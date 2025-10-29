/**
 * Messaging consumer module
 *
 * This module provides a small helper to start message consumers backed by
 * RabbitMQ. It uses the RabbitMQQueue adapter which implements the same
 * handler registration API as the InMemoryQueue used in tests.
 */

const logger = require("../utils/logger");
const { RabbitMQQueue } = require("../queue/rabbitmq");
const { registerSubmissionHandler } = require("./handlers/submissionHandler");
const { registerResultHandler } = require("./handlers/resultHandler");

async function startConsumers(opts = {}) {
  const queue = new RabbitMQQueue({
    rabbitUrl: opts.rabbitUrl,
    queueName: opts.queueName,
    prefetch: opts.prefetch,
  });

  // Register handlers
  registerSubmissionHandler(queue);
  registerResultHandler(queue);

  // Start consuming
  await queue.start();
  logger.info({ queue: queue.queueName }, "Message consumers started");

  return queue;
}

module.exports = { startConsumers };
