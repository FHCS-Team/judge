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

/**
 * Handle incoming messages.
 * @param {import("amqplib").Message} msg
 * @returns
 */
async function handleMessage(msg) {
  if (!msg) return;
  let payload = null;
  try {
    payload = JSON.parse(msg.content.toString());
    // TODO: Add actual message handling logic here & nack if not consumed
    logger.debug(msg);
  } catch (err) {
    logger.error(
      "Worker failed to parse message",
      err && err.message ? err.message : err,
    );
    throw err;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const publishStatus = require("./queue/publishers/status");

async function startupOnce() {
  await queue.connect();

  const ch = await queue.createChannel({ confirm: false });
  try {
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
      await publishStatus(new Date());
      setInterval(() => publishStatus(new Date()), HEALTH_INTERVAL_MS).unref();
      return;
    } catch (err) {
      const delay = Math.min(INITIAL * 2 ** Math.min(attempt, 8), MAX);
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
