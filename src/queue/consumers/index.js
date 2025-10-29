const { BaseConsumer } = require("./baseConsumer");
const { SubmissionConsumer } = require("./submissionConsumer");
const { PackageConsumer } = require("./packageConsumer");
const { BuildRequestConsumer } = require("./buildRequestConsumer");
const { HooksExecuteConsumer } = require("./hooksExecuteConsumer");
const { StatusConsumer } = require("./statusConsumer");

/**
 * Factory for creating and registering all message consumers
 */
class ConsumerRegistry {
  constructor(options = {}) {
    this.processor = options.processor || null;
    this.publisher = options.publisher || null;
    this.queue = options.queue || null;
    this.consumers = new Map();
  }

  /**
   * Register a consumer instance
   * @param {BaseConsumer} consumer - Consumer instance
   */
  register(consumer) {
    const messageType = consumer.getMessageType();
    if (!messageType) {
      throw new Error(`Consumer ${consumer.name} has no message type defined`);
    }

    this.consumers.set(messageType, consumer);
    return this;
  }

  /**
   * Register all default consumers
   */
  registerDefaults() {
    const commonOptions = {
      processor: this.processor,
      publisher: this.publisher,
      queue: this.queue,
    };

    // Register submission consumer
    this.register(new SubmissionConsumer(commonOptions));

    // Register package consumer
    this.register(new PackageConsumer(commonOptions));

    // Register build request consumer
    this.register(new BuildRequestConsumer(commonOptions));

    // Register hooks execute consumer
    this.register(new HooksExecuteConsumer(commonOptions));

    // Register status consumer
    this.register(new StatusConsumer(commonOptions));

    return this;
  }

  /**
   * Attach all registered consumers to a queue
   * @param {Object} queue - Queue instance (InMemoryQueue or RabbitMQQueue)
   */
  attachToQueue(queue) {
    for (const [messageType, consumer] of this.consumers.entries()) {
      queue.registerHandler(messageType, async (envelope, context) => {
        await consumer.consume(envelope, context);
      });
    }
    return this;
  }

  /**
   * Get a consumer by message type
   * @param {string|RegExp} messageType - Message type
   * @returns {BaseConsumer|null}
   */
  get(messageType) {
    return this.consumers.get(messageType) || null;
  }

  /**
   * Get all registered consumers
   * @returns {Map<string|RegExp, BaseConsumer>}
   */
  getAll() {
    return this.consumers;
  }
}

module.exports = {
  BaseConsumer,
  SubmissionConsumer,
  PackageConsumer,
  BuildRequestConsumer,
  HooksExecuteConsumer,
  StatusConsumer,
  ConsumerRegistry,
};
