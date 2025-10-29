const amqp = require("amqplib");
const os = require("os");
const logger = require("../utils/logger");
const { ConsumerRegistry } = require("./consumers");

class RabbitMQQueue {
  constructor(opts = {}) {
    this.rabbitUrl =
      opts.rabbitUrl || process.env.RABBITMQ_URL || "amqp://localhost";
    this.queueName =
      opts.queueName || process.env.JUDGE_QUEUE_NAME || "judge-queue";
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
      await this._ch.assertQueue(this.queueName, { durable: true });
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
    const envelope = Object.assign(
      {
        id: msg && msg.id ? msg.id : undefined,
        type: (msg && msg.type) || "message",
        payload: (msg && msg.payload) || msg || {},
        created_at: new Date().toISOString(),
        retries: (msg && msg.retries) || 0,
        max_retries: (msg && msg.max_retries) || 3,
      },
      msg && msg._raw ? msg._raw : {},
    );

    const buf = Buffer.from(JSON.stringify(envelope));
    const ok = this._ch.sendToQueue(this.queueName, buf, { persistent: true });
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
        this._ch.ack(rawMsg);
        return;
      }

      const ack = () => {
        try {
          this._ch.ack(rawMsg);
        } catch (e) {}
      };

      const nack = (err, opts = {}) => {
        try {
          // Increment retries and requeue if allowed
          envelope.retries = (envelope.retries || 0) + 1;
          const max = envelope.max_retries || 3;
          if (envelope.retries <= max) {
            // ack original and re-publish
            this._ch.ack(rawMsg);
            this._ch.sendToQueue(
              this.queueName,
              Buffer.from(JSON.stringify(envelope)),
              { persistent: true },
            );
          } else {
            // final: ack and drop (could send to DLQ)
            this._ch.ack(rawMsg);
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
