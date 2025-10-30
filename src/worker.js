const logger = require("#utils/logger.js");
const queue = require("./queue");

const QUEUE_NAME = process.env.JUDGE_QUEUE_NAME || "judge-queue";
const PREFETCH = parseInt(process.env.JUDGE_CONSUMER_PREFETCH || "1", 10);
const EXCHANGE = process.env.JUDGE_EXCHANGE || "dmoj-events";
const EXCHANGE_TYPE = process.env.JUDGE_EXCHANGE_TYPE || "topic";
// For topic exchanges, default to receiving all routing keys. Can be overridden
// with JUDGE_BINDING_KEY env var if you only want specific patterns.
const BINDING_KEY = process.env.JUDGE_BINDING_KEY || "#";
const HEALTH_INTERVAL_MS = parseInt(
  process.env.JUDGE_HEALTH_INTERVAL_MS || "60000",
  10,
);

/**
 * A set of functions
 */
const consumers = new Set();

const addConsumer = (fn) => {
  consumers.add(fn);
};

const removeConsumer = (fn) => {
  consumers.delete(fn);
};

/**
 * Handle incoming messages.
 * @param {import("amqplib").Message} msg
 * @returns
 */
async function handleMessage(msg) {
  if (!msg) return;
  const identifier = msg.properties.messageId;
  try {
    // Ignore messages published by this same instance (x-origin header)
    try {
      const origin =
        msg.properties &&
        msg.properties.headers &&
        msg.properties.headers["x-origin"];
      if (origin && origin === queue.INSTANCE_ID) {
        logger.debug(
          `Skipping self-originated message ${identifier} (x-origin=${origin})`,
        );
        // Indicate to the consumer wrapper that this message should NOT be
        // acknowledged by this consumer but should be requeued so other
        // consumers (possibly sharing the same queue) can process it.
        // The consume wrapper understands a return value of { requeue: true }.
        return { requeue: true };
      }
    } catch (e) {
      // ignore header errors and continue
    }

    let handled = false;
    for (const consumer of consumers) {
      // try calling consumer(msg), if false or undefined, skip to next
      // if a consumer returns a truthy value, consider the message handled
      try {
        const result = await consumer(msg);
        if (result) {
          handled = true;
          break;
        }
      } catch (e) {
        // A consumer threw — log and continue to allow other consumers to try
        logger.warn(`Consumer threw while handling message ${identifier}`);
        logger.debug(e && e.stack ? e.stack : String(e));
      }
    }

    if (handled) {
      logger.debug(`Message ${identifier} was handled by a consumer`);
      return;
    }

    // No consumer handled the message
    logger.debug(`Received new message ${identifier}`);
    logger.debug(msg);
    throw new Error("No consumer handled message");
  } catch (err) {
    logger.warn("Message failed parsing or skipped");
    logger.debug(err.message);
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
    logger.info(
      `Binding queue '${QUEUE_NAME}' to exchange '${EXCHANGE}' with key '${BINDING_KEY}'`,
    );
    await queue.bindQueue(ch, QUEUE_NAME, EXCHANGE, BINDING_KEY);
    // Auto-register consumers from src/queue/consumers if present.
    try {
      const fs = require("fs");
      const path = require("path");
      const consumersDir = path.resolve(__dirname, "queue", "consumers");
      let loaded = 0;
      if (fs.existsSync(consumersDir)) {
        const files = fs.readdirSync(consumersDir);
        for (const f of files) {
          if (!/\.js$/.test(f)) continue;
          try {
            const mod = require(path.join(consumersDir, f));
            // mod may be a function, an object of functions, or an array
            if (typeof mod === "function") {
              addConsumer(mod);
              loaded += 1;
            } else if (Array.isArray(mod)) {
              for (const fn of mod) {
                if (typeof fn === "function") {
                  addConsumer(fn);
                  loaded += 1;
                }
              }
            } else if (mod && typeof mod === "object") {
              // add any function exports
              for (const key of Object.keys(mod)) {
                if (typeof mod[key] === "function") {
                  addConsumer(mod[key]);
                  loaded += 1;
                }
              }
            }
          } catch (e) {
            logger.warn(`Failed to load consumer from ${f}`);
            logger.debug(e && e.stack ? e.stack : String(e));
          }
        }
      }
      logger.info(`Message consumers started (loaded=${loaded})`);
    } catch (e) {
      logger.warn("Failed to auto-register consumers");
      logger.debug(e && e.stack ? e.stack : String(e));
    }
  } finally {
    try {
      await ch.close();
    } catch (e) {
      logger.error("Failed to close message queue channel");
      logger.debug(e);
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
  addConsumer,
  removeConsumer,
};
