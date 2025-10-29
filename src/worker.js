const logger = require("#utils/logger.js");
const queue = require("./queue");

const QUEUE_NAME = process.env.JUDGE_QUEUE_NAME || "judge-queue";
const PREFETCH = parseInt(process.env.JUDGE_CONSUMER_PREFETCH || "1", 10);

const EXCHANGE = process.env.JUDGE_EXCHANGE || "dmoj-events";
// Default to 'topic' to match common setups and avoid PRECONDITION errors
// when an existing exchange is already declared as 'topic'. Make configurable
// via `JUDGE_EXCHANGE_TYPE` when needed.
const EXCHANGE_TYPE = process.env.JUDGE_EXCHANGE_TYPE || "topic";
const HEALTH_INTERVAL_MS = parseInt(
  process.env.JUDGE_HEALTH_INTERVAL_MS || "60000",
  10,
);
async function handleMessage(msg) {
  if (!msg) return;
  let payload = null;
  try {
    payload = JSON.parse(msg.content.toString());
  } catch (err) {
    // malformed message -> let consume wrapper nack without requeue
    logger.error(
      "Worker failed to parse message",
      err && err.message ? err.message : err,
    );
    throw err;
  }

  logger.info(
    "Worker received message",
    payload && payload.type ? payload.type : "unknown",
  );

  // TODO: delegate to specific processors based on payload.type
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function publishStatus(when = new Date()) {
  const payload = {
    type: "status",
    service: "judgehost",
    status: "online",
    timestamp: when.toISOString
      ? when.toISOString()
      : new Date(when).toISOString(),
  };

  try {
    await queue.publish(EXCHANGE, "status", payload);
    logger.info("Published status event", payload);
  } catch (err) {
    logger.warn(
      "Failed to publish status event",
      err && err.message ? err.message : err,
    );
  }
}

/**
 * One-time startup operation:
 * - ensure connection
 * - declare exchange only if missing (avoid PRECONDITION errors)
 * - assert queue and binding
 * - start consuming
 */
async function startupOnce() {
  // Ensure connection
  await queue.connect();

  const ch = await queue.createChannel({ confirm: false });
  try {
    // Prefer a passive check to avoid declaring an exchange with a different
    // type (which causes PRECONDITION-FAILED / 406).
    try {
      if (typeof ch.checkExchange === "function") {
        await ch.checkExchange(EXCHANGE);
        logger.info(`Exchange '${EXCHANGE}' exists; skipping declaration`);
      } else {
        logger.info(
          "channel.checkExchange not available; will attempt assertExchange",
        );
        await queue.assertExchange(ch, EXCHANGE, EXCHANGE_TYPE, {
          durable: true,
        });
      }
    } catch (err) {
      // If checkExchange fails, declare the exchange (it likely doesn't exist)
      // but if it exists with a different type this assert will raise a
      // PRECONDITION error which we let bubble for the retry logic to handle.
      logger.info(
        `Exchange '${EXCHANGE}' not found; declaring as type='${EXCHANGE_TYPE}'`,
      );
      await queue.assertExchange(ch, EXCHANGE, EXCHANGE_TYPE, {
        durable: true,
      });
    }

    await queue.assertQueue(ch, QUEUE_NAME, { durable: true });
    await queue.bindQueue(ch, QUEUE_NAME, EXCHANGE, "");
  } finally {
    try {
      await ch.close();
    } catch (e) {
      // ignore
    }
  }

  // Start consuming; consume returns the channel used by the consumer.
  await queue.consume(QUEUE_NAME, handleMessage, { prefetch: PREFETCH });
  logger.info(
    `Worker listening on queue "${QUEUE_NAME}" (prefetch=${PREFETCH})`,
  );
}

async function init() {
  // Retry startup until success. Backoff capped at 30s.
  const INITIAL = 1000;
  const MAX = 30000;
  let attempt = 0;
  while (true) {
    attempt += 1;
    try {
      await startupOnce();

      // publish immediate status and schedule periodic health-heartbeats
      await publishStatus(new Date());
      setInterval(() => publishStatus(new Date()), HEALTH_INTERVAL_MS).unref();

      return; // startup succeeded
    } catch (err) {
      const delay = Math.min(INITIAL * 2 ** Math.min(attempt, 8), MAX);
      // Provide extra guidance for PRECONDITION-FAILED errors
      const message = err && err.message ? err.message : String(err);
      if (/PRECONDITION/i.test(message)) {
        logger.warn(
          `Startup attempt ${attempt} failed (precondition): ${message}. This usually means an existing exchange/queue has incompatible parameters. Check exchange type and queue options. Retrying in ${delay}ms`,
        );
      } else {
        logger.warn(
          `Startup attempt ${attempt} failed: ${message}. Retrying in ${delay}ms`,
        );
      }

      await sleep(delay);
    }
  }
}

module.exports = {
  init,
};
