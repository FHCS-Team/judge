const os = require("os");
const crypto = require("crypto");
const uuidv4 = (() => {
  if (typeof crypto.randomUUID === "function") return () => crypto.randomUUID();
  return () => {
    // fallback: pseudo-uuid
    return "xxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };
})();

/**
 * Simple in-memory queue with pluggable backend placeholder.
 * - Supports: enqueue, start processing with a handler, ack/retry semantics, graceful shutdown.
 * - Capacity (concurrency) is inferred from host memory: available = total * 0.8, divided by per-job memory estimate.
 * - Messages follow the lightweight envelope schema documented below.
 *
 * Message envelope (recommended):
 * {
 *   id: string (uuid),
 *   type: 'submission'|'problem_package'|'result'|...,
 *   payload: object,
 *   created_at: ISO string,
 *   retries: number,
 *   max_retries: number,
 *   resources: { memory_mb: number, cpus: number }
 * }
 */

const DEFAULT_JOB_MEMORY_MB = 512; // fallback per-job memory estimate
const HOST_MEMORY_USAGE_RATIO = 0.8; // leave 20% buffer
const { getValidator } = require("../types/schemaRegistry");

// Obtain compiled validators from the central registry (may be null)
const resultPayloadValidate = getValidator("resultPayload");
const problemValidate = getValidator("problemSchema");
const submissionValidate = getValidator("submission");

class InMemoryQueue {
  constructor(opts = {}) {
    this.backend = opts.backend || process.env.QUEUE_BACKEND || "memory";
    this.rabbitUrl =
      opts.rabbitUrl || process.env.RABBITMQ_URL || "amqp://localhost";

    if (this.backend !== "memory") {
      // placeholder for future RabbitMQ implementation
      throw new Error("Only in-memory backend is implemented currently");
    }

    this._queue = [];
    this._processing = 0;
    // _shutdown: external enqueue/accepting flag. When true we stop accepting new external messages
    // but continue to process and allow internal retries to finish.
    this._shutdown = false;
    // track pending retry timers so shutdown can wait for them
    this._retryTimers = new Set();
    this._worker = null;
    this._handler = null;
    this._waiting = [];
    // handlers stored as array of { pattern, fn }
    this._handlers = [];

    // concurrency inferred from host memory and per-job estimate
    const totalMb = Math.floor(os.totalmem() / 1024 / 1024);
    const availableMb = Math.max(
      1,
      Math.floor(totalMb * HOST_MEMORY_USAGE_RATIO),
    );
    const perJob = opts.defaultJobMemoryMb || DEFAULT_JOB_MEMORY_MB;
    this.concurrency = Math.max(1, Math.floor(availableMb / perJob));
  }

  // Enqueue a message. Message will be wrapped into the envelope if missing fields.
  enqueue(msg) {
    // allow internal system enqueues to bypass shutdown flag by setting `_internal: true` on the message
    if (this._shutdown && !(msg && msg._internal)) {
      throw new Error("Queue is shutting down, not accepting new messages");
    }

    const envelope = Object.assign(
      {
        id: uuidv4(),
        type: (msg && msg.type) || "message",
        payload: (msg && msg.payload) || msg || {},
        created_at: new Date().toISOString(),
        retries: 0,
        max_retries: (msg && msg.max_retries) || 3,
        resources: (msg && msg.resources) || {},
      },
      msg && msg._raw ? msg._raw : {},
    );

    // Lightweight validation using docs schemas when available.
    try {
      if (
        envelope.type &&
        typeof envelope.type === "string" &&
        envelope.type.toLowerCase().startsWith("result") &&
        resultPayloadValidate
      ) {
        const ok = resultPayloadValidate(envelope.payload);
        if (!ok) {
          const err = (resultPayloadValidate.errors || [])
            .map((e) => `${e.instancePath} ${e.message}`)
            .join("; ");
          throw new Error(`result_event payload validation failed: ${err}`);
        }
      }

      if (
        envelope.type &&
        typeof envelope.type === "string" &&
        (envelope.type.toLowerCase().includes("problem") ||
          envelope.type.toLowerCase().includes("problem_package")) &&
        problemValidate
      ) {
        const ok = problemValidate(envelope.payload);
        if (!ok) {
          // validate submission payloads when available
          if (
            envelope.type &&
            typeof envelope.type === "string" &&
            envelope.type.toLowerCase().includes("submission") &&
            submissionValidate
          ) {
            const ok = submissionValidate(envelope.payload);
            if (!ok) {
              const err = (submissionValidate.errors || [])
                .map((e) => `${e.instancePath} ${e.message}`)
                .join("; ");
              throw new Error(`submission payload validation failed: ${err}`);
            }
          }
          const err = (problemValidate.errors || [])
            .map((e) => `${e.instancePath} ${e.message}`)
            .join("; ");
          throw new Error(`problem payload validation failed: ${err}`);
        }
      }
    } catch (e) {
      // Surface validation errors to caller rather than enqueueing invalid messages.
      throw e;
    }

    this._queue.push(envelope);
    // kick worker if present
    this._drain();
    return envelope.id;
  }

  // Start processing. An optional default handler may be provided. Handlers for specific
  // message types can be registered via `registerHandler(type, fn)`.
  start(handler) {
    if (this._handler) throw new Error("Queue already started");
    if (handler && typeof handler !== "function")
      throw new Error("handler must be a function");
    this._handler = handler || null;
    this._stopped = false;
    // no separate loop; _drain triggers processing as messages arrive
    this._drain();
  }

  // Register a handler for a message type or pattern.
  // pattern: string (exact), string prefix ending with '.' for prefix match, string with '*' wildcards, or RegExp
  registerHandler(pattern, fn) {
    if (!pattern || typeof fn !== "function")
      throw new Error("pattern and function required");
    if (typeof pattern === "string") {
      if (pattern.indexOf("*") !== -1) {
        // convert wildcard to RegExp
        const esc = pattern
          .split("*")
          .map((s) => s.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&"))
          .join(".*");
        this._handlers.push({ pattern: new RegExp(`^${esc}$`), fn });
        return;
      }
      // string (exact or prefix if endsWith('.'))
      this._handlers.push({ pattern, fn });
      return;
    }
    if (pattern instanceof RegExp) {
      this._handlers.push({ pattern, fn });
      return;
    }
    throw new Error("pattern must be string or RegExp");
  }

  // Internal: attempt to start jobs while concurrency allows
  _drain() {
    if (!this._handler && this._handlers.size === 0) return;
    // process as many as allowed
    while (this._processing < this.concurrency && this._queue.length > 0) {
      const msg = this._queue.shift();
      this._runMessage(msg);
    }
  }

  _runMessage(msg) {
    this._processing += 1;

    let finished = false;

    const ack = () => {
      if (finished) return;
      finished = true;
      this._processing -= 1;
      // continue processing queued messages
      this._drain();
    };

    const nack = (err, opts = {}) => {
      if (finished) return;
      finished = true;
      this._processing -= 1;
      // retry semantics: increment retries and requeue with exponential backoff
      msg.retries = (msg.retries || 0) + 1;
      const max = msg.max_retries || 3;
      if (msg.retries <= max) {
        const delay =
          opts.delay || Math.min(30000, 1000 * Math.pow(2, msg.retries - 1));
        const t = setTimeout(() => {
          try {
            // Always requeue internal retries so that an orderly shutdown can finish work.
            this._queue.push(msg);
            this._drain();
          } finally {
            this._retryTimers.delete(t);
          }
        }, delay);
        this._retryTimers.add(t);
      } else {
        // if exhausted, emit to waiting or simply log (here we keep it dropped)
        // consumers may implement error handling via handler
      }

      this._drain();
    };

    // pick handler: check registered patterns in insertion order
    let handler = null;
    for (const entry of this._handlers) {
      const p = entry.pattern;
      if (typeof p === "string") {
        if (p === msg.type) {
          handler = entry.fn;
          break;
        }
        // prefix match when pattern ends with '.' (e.g., 'result.')
        if (p.endsWith(".") && msg.type.startsWith(p)) {
          handler = entry.fn;
          break;
        }
        // also allow pattern like 'result*' handled in registerHandler as RegExp, so skip here
      } else if (p instanceof RegExp) {
        if (p.test(msg.type)) {
          handler = entry.fn;
          break;
        }
      }
    }
    if (!handler) handler = this._handler;
    if (!handler) {
      // no handler for this message type; ack to drop
      ack();
      return;
    }

    // run handler safely
    Promise.resolve()
      .then(() => handler(msg, { ack, nack }))
      .catch((err) => {
        // on unhandled exception, treat as nack
        try {
          nack(err);
        } catch (e) {
          // swallow
        }
      });
  }

  // stop accepting new messages and wait for in-flight to finish (with optional timeout)
  close(timeoutMs = 30000) {
    // Mark shutdown: prevent new external enqueues but allow in-flight and internal retries to finish.
    this._shutdown = true;
    return new Promise((resolve) => {
      const interval = setInterval(() => {
        if (
          this._processing === 0 &&
          this._queue.length === 0 &&
          this._retryTimers.size === 0
        ) {
          clearInterval(interval);
          clearTimeout(timer);
          return resolve();
        }
      }, 100);

      const timer = setTimeout(() => {
        clearInterval(interval);
        // force resolve; note: callers should handle that some jobs may still be running or queued
        resolve();
      }, timeoutMs);
    });
  }

  // helper for diagnostic / metrics
  stats() {
    return {
      queued: this._queue.length,
      processing: this._processing,
      concurrency: this.concurrency,
    };
  }
}

module.exports = {
  InMemoryQueue,
};
