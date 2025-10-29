const path = require("path");
const logger = require("./utils/logger");
const { ConsumerRegistry } = require("./queue");

// choose backend based on environment
function createQueueFromEnv() {
  // Default to RabbitMQ-backed queue implementation. The top-level
  // `src/queue` module now re-exports the RabbitMQQueue.
  try {
    const { RabbitMQQueue } = require("./queue");
    return new RabbitMQQueue();
  } catch (err) {
    logger.error({ err: err.message }, "Failed to load RabbitMQQueue");
    throw err;
  }
}

async function main() {
  logger.info("Starting live worker");

  // try to require processor and publisher if available; fall back to null
  let processor = null;
  let publisher = null;
  try {
    processor = require("./processor");
  } catch (e) {
    logger.debug(
      { err: e.message },
      "No processor module found; continuing with null",
    );
  }
  try {
    publisher = require("./messaging/publisher");
  } catch (e) {
    logger.debug(
      { err: e.message },
      "No publisher module found; continuing with null",
    );
  }

  const queue = createQueueFromEnv();

  const registry = new ConsumerRegistry({ processor, publisher, queue });
  // register the default consumers that come with the registry
  try {
    registry.registerDefaults();
  } catch (e) {
    logger.error({ err: e.message }, "Failed to register default consumers");
    throw e;
  }

  // attach consumers to queue
  registry.attachToQueue(queue);

  // start the queue (works for both sync and async start implementations)
  try {
    await Promise.resolve(queue.start && queue.start());
    logger.info(
      { backend: process.env.QUEUE_BACKEND || "rabbitmq" },
      "Queue started",
    );
  } catch (e) {
    logger.error({ err: e.message }, "Failed to start queue");
    // if RabbitMQ failed to start, exit with non-zero
    process.exitCode = 1;
    return;
  }

  // show simple stats for in-memory queue if available
  if (typeof queue.stats === "function") {
    try {
      logger.info({ stats: queue.stats() }, "Queue stats");
    } catch (e) {
      // ignore
    }
  }

  let shuttingDown = false;
  let shutdownResolve;
  const stopPromise = new Promise((res) => {
    shutdownResolve = res;
  });

  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Shutdown requested");
    try {
      await Promise.resolve(queue.close && queue.close(30000));
      logger.info("Queue closed gracefully");
    } catch (e) {
      logger.error({ err: e.message }, "Error during queue.close");
    } finally {
      // resolve the wait promise so main can exit
      try {
        if (typeof shutdownResolve === "function") shutdownResolve();
      } catch (e) {}
      // give logger a moment if it buffers
      setTimeout(() => process.exit(0), 50);
    }
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  process.on("uncaughtException", (err) => {
    logger.fatal(
      { err: err && err.stack ? err.stack : err },
      "uncaughtException",
    );
    // attempt graceful shutdown
    shutdown("uncaughtException");
  });

  process.on("unhandledRejection", (reason) => {
    logger.error({ err: reason }, "unhandledRejection");
  });
  // keep process alive until shutdown() resolves stopPromise
  await stopPromise;
}

if (require.main === module) {
  main().catch((err) => {
    logger.fatal(
      { err: err && err.stack ? err.stack : err },
      "Failed to run live worker",
    );
    process.exit(1);
  });
}

module.exports = { main };
