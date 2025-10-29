const logger = require("../../utils/logger");

/**
 * Base consumer class providing common functionality for all message event consumers.
 *
 * Each consumer should:
 * 1. Extend this class
 * 2. Implement the `process(envelope, context)` method
 * 3. Define `messageType` property or pattern
 * 4. Optionally override `validate(envelope)` for custom validation
 */
class BaseConsumer {
  constructor(options = {}) {
    this.name = this.constructor.name;
    this.messageType = options.messageType || null;
    this.processor = options.processor || null;
    this.publisher = options.publisher || null;
  }

  /**
   * Get the message type pattern this consumer handles.
   * Can be a string (exact match), string with wildcards (*), or RegExp.
   * @returns {string|RegExp}
   */
  getMessageType() {
    return this.messageType;
  }

  /**
   * Validate the message envelope before processing.
   * Override this method for custom validation logic.
   * @param {Object} envelope - Message envelope
   * @returns {Object} { valid: boolean, errors: string[] }
   */
  validate(envelope) {
    const errors = [];

    if (!envelope) {
      errors.push("Envelope is null or undefined");
      return { valid: false, errors };
    }

    if (!envelope.type) {
      errors.push("Message type is missing");
    }

    if (!envelope.payload) {
      errors.push("Message payload is missing");
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Process the message. Must be implemented by subclasses.
   * @param {Object} envelope - Message envelope
   * @param {Object} context - Processing context with ack/nack functions
   * @returns {Promise<void>}
   */
  async process(envelope, context) {
    throw new Error(`process() must be implemented by ${this.name}`);
  }

  /**
   * Handle message consumption (called by queue).
   * Performs validation, calls process(), and handles ack/nack.
   * @param {Object} envelope - Message envelope
   * @param {Object} context - Context with ack/nack functions
   */
  async consume(envelope, context) {
    const startTime = Date.now();

    logger.info(
      {
        consumer: this.name,
        messageType: envelope.type,
        messageId: envelope.id,
      },
      "Consuming message",
    );

    try {
      // Validate envelope
      const validation = this.validate(envelope);
      if (!validation.valid) {
        logger.error(
          {
            consumer: this.name,
            messageId: envelope.id,
            errors: validation.errors,
          },
          "Message validation failed",
        );
        // Validation failures are not retryable - ack to drop
        context.ack();
        return;
      }

      // Process message
      await this.process(envelope, context);

      const duration = Date.now() - startTime;
      logger.info(
        {
          consumer: this.name,
          messageType: envelope.type,
          messageId: envelope.id,
          durationMs: duration,
        },
        "Message processed successfully",
      );

      // Let the process method handle ack/nack
      // If process doesn't call ack/nack, we assume success and ack here
      if (context && typeof context.ack === "function") {
        context.ack();
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(
        {
          consumer: this.name,
          messageType: envelope.type,
          messageId: envelope.id,
          error: error.message,
          stack: error.stack,
          durationMs: duration,
        },
        "Message processing failed",
      );

      // Nack for retry
      if (context && typeof context.nack === "function") {
        context.nack(error);
      }
    }
  }

  /**
   * Publish a result/response message
   * @param {string} eventType - Event type
   * @param {Object} payload - Event payload
   * @param {Object} options - Publishing options
   */
  async publish(eventType, payload, options = {}) {
    if (!this.publisher) {
      logger.warn(
        { consumer: this.name, eventType },
        "No publisher configured, skipping publish",
      );
      return;
    }

    try {
      const message = {
        type: eventType,
        payload,
        correlation_id: options.correlationId || null,
        ...options,
      };

      await this.publisher.publish(eventType, message);

      logger.debug(
        { consumer: this.name, eventType },
        "Published result message",
      );
    } catch (error) {
      logger.error(
        {
          consumer: this.name,
          eventType,
          error: error.message,
        },
        "Failed to publish result message",
      );
      // Don't fail the consumer if publish fails
    }
  }
}

module.exports = { BaseConsumer };
