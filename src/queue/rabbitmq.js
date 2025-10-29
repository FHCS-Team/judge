const amqp = require("amqplib");
const os = require("os");
const logger = require("../utils/logger");
const { ConsumerRegistry } = require("./consumers");

// lightweight id generator to avoid ESM-only uuid import in test env
function _genId() {
  return `msg-${Date.now().toString(36)}-${Math.floor(Math.random() * 0xfffff).toString(36)}`;
}

class RabbitMQQueue {
  constructor(opts = {}) {
    this.rabbitUrl =
      opts.rabbitUrl || process.env.JUDGE_QUEUE_URL || "amqp://localhost";
    this.queueName =
      opts.queueName || process.env.JUDGE_QUEUE_NAME || "judge-queue";
    // Exchange to publish/subscribe to (topic exchange)
    this.exchangeName =
      opts.exchangeName || process.env.JUDGE_EXCHANGE || "dmoj-events";
    this._conn = null;
    this._ch = null;
    this._handlers = [];
    this._consuming = false;
    this.prefetch =
      opts.prefetch ||
      Math.max(1, Math.floor(os.totalmem() / 1024 / 1024 / 512));
  }

  async connect() {
    if (this._conn) return;
    const url = this.rabbitUrl;
    logger.info({ url }, `Connecting to ${url}`);
    try {
      this._conn = await amqp.connect(url);
      this._ch = await this._conn.createChannel();
      // Ensure exchange exists and queue is declared
      await this._ch.assertExchange(this.exchangeName, "topic", {
        durable: true,
      });
      await this._ch.assertQueue(this.queueName, { durable: true });
      // Bind queue to exchange with a catch-all so the app's internal routing
      // (based on envelope.type) continues to work. Specific bindings can be
      // added later if desired.
      await this._ch.bindQueue(this.queueName, this.exchangeName, "#");
      await this._ch.prefetch(this.prefetch);
      logger.info({ url }, `Connected to ${url}`);
    } catch (err) {
      logger.error(
        { err: err && err.message ? err.message : err, url },
        `Failed to connect to ${url}`,
      );
      // cleanup any partial state
      try {
        if (this._conn) await this._conn.close();
      } catch (e) {}
      this._conn = null;
      this._ch = null;
      throw err;
    }
  }

  async enqueue(msg) {
    await this.connect();
    const id = (msg && msg.id) || _genId();
    const envelope = Object.assign(
      {
        id,
        type: (msg && msg.type) || "message",
        payload: (msg && msg.payload) || msg || {},
        created_at: new Date().toISOString(),
        retries: (msg && msg.retries) || 0,
        max_retries: (msg && msg.max_retries) || 3,
      },
      msg && msg._raw ? msg._raw : {},
    );

    const buf = Buffer.from(JSON.stringify(envelope));
    // Publish to the configured exchange using envelope.type as the routing key.
    // This allows other services to bind to the exchange with topic bindings
    // while preserving the existing queue consumers which are bound with '#'.
    const routingKey = envelope.type || "";
    const ok = this._ch.publish(this.exchangeName, routingKey, buf, {
      persistent: true,
    });

    // Log message event id for external messages (not internal system messages)
    try {
      if (!(msg && msg._internal)) {
        logger.info(
          { id: envelope.id, type: envelope.type, queue: this.queueName },
          `Queued message ${envelope.id}`,
        );
      }
    } catch (e) {
      // don't let logging failures break enqueue
    }

    return envelope.id || null;
  }

  registerHandler(pattern, fn) {
    if (!pattern || typeof fn !== "function")
      throw new Error("pattern and function required");
    if (typeof pattern === "string") {
      if (pattern.indexOf("*") !== -1) {
        const esc = pattern
          .split("*")
          .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
          .join(".*");
        this._handlers.push({ pattern: new RegExp(`^${esc}$`), fn });
        return;
      }
      this._handlers.push({ pattern, fn });
      return;
    }
    if (pattern instanceof RegExp) {
      this._handlers.push({ pattern, fn });
      return;
    }
    throw new Error("pattern must be string or RegExp");
  }

  _pickHandler(type) {
    for (const entry of this._handlers) {
      const p = entry.pattern;
      if (typeof p === "string") {
        if (p === type) return entry.fn;
        if (p.endsWith(".") && type.startsWith(p)) return entry.fn;
      } else if (p instanceof RegExp) {
        if (p.test(type)) return entry.fn;
      }
    }
    return null;
  }

  async start() {
    await this.connect();
    if (this._consuming) return;
    this._consuming = true;

    await this._ch.consume(this.queueName, async (rawMsg) => {
      if (!rawMsg) return;
      let envelope = null;
      try {
        envelope = JSON.parse(rawMsg.content.toString());
      } catch (e) {
        // malformed message: ack and drop
        try {
          this._ch.ack(rawMsg);
        } catch (e2) {}
        return;
      }

      // Normalize message format: support both { type, payload: {...} }
      // and flattened messages { type, ...fields }. If payload is missing
      // but there are extra keys, move them into payload so consumers can
      // read values consistently from envelope.payload.
      try {
        if (!envelope || typeof envelope !== "object") {
          // malformed; ack and drop
          try {
            this._ch.ack(rawMsg);
          } catch (e2) {}
          return;
        }

        // If payload is missing or not an object, but other user fields exist,
        // build a payload object from remaining keys.
        const known = new Set([
          "id",
          "type",
          "created_at",
          "retries",
          "max_retries",
          "_raw",
          "_internal",
        ]);
        if (!envelope.payload || typeof envelope.payload !== "object") {
          // collect other keys into payload
          const payload = {};
          for (const k of Object.keys(envelope)) {
            if (!known.has(k)) {
              payload[k] = envelope[k];
            }
          }

          // If payload is empty and envelope.payload was falsy, ensure payload is an object
          envelope.payload = Object.keys(payload).length ? payload : {};

          // Ensure id exists
          if (!envelope.id) envelope.id = _genId();
          if (!envelope.created_at)
            envelope.created_at = new Date().toISOString();
        }
      } catch (e) {
        try {
          this._ch.ack(rawMsg);
        } catch (e2) {}
        return;
      }

      // ack/nack idempotency guard to avoid double-acking (which closes channel)
      let ackedOrNacked = false;

      const ack = () => {
        if (ackedOrNacked) return;
        ackedOrNacked = true;
        try {
          this._ch.ack(rawMsg);
        } catch (e) {}
      };

      const nack = (err, opts = {}) => {
        if (ackedOrNacked) return;
        ackedOrNacked = true;
        try {
          // Increment retries and requeue if allowed
          envelope.retries = (envelope.retries || 0) + 1;
          const max = envelope.max_retries || 3;
          if (envelope.retries <= max) {
            // ack original and re-publish
            try {
              this._ch.ack(rawMsg);
            } catch (e) {}
            this._ch.sendToQueue(
              this.queueName,
              Buffer.from(JSON.stringify(envelope)),
              { persistent: true },
            );
          } else {
            // final: ack and drop (could send to DLQ)
            try {
              this._ch.ack(rawMsg);
            } catch (e) {}
          }
        } catch (e) {
          try {
            this._ch.ack(rawMsg);
          } catch (e2) {}
        }
      };

      const handler = this._pickHandler(envelope.type);
      if (!handler) {
        // no handler, ack
        ack();
        return;
      }

      // Run handler and map exceptions to nack
      try {
        await Promise.resolve(handler(envelope, { ack, nack }));
      } catch (err) {
        try {
          nack(err || new Error("handler error"));
        } catch (e) {
          try {
            this._ch.ack(rawMsg);
          } catch (e2) {}
        }
      }
    });
  }

  // Provide a synchronous stats API similar to InMemoryQueue so StatusConsumer
  // can call it without awaiting. We return conservative defaults when exact
  // values are not available.
  stats() {
    return { queued: 0, processing: 0, concurrency: this.prefetch || 1 };
  }

  async close(timeoutMs = 30000) {
    try {
      if (this._ch) await this._ch.close();
    } catch (e) {}
    try {
      if (this._conn) await this._conn.close();
    } catch (e) {}
    this._ch = null;
    this._conn = null;
    this._consuming = false;
  }
}

module.exports = { RabbitMQQueue, ConsumerRegistry };
