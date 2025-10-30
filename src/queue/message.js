const logger = require("#utils/logger.js");

/**
 * Extract an event identifier from an AMQP message.
 * Checks, in order:
 *  - msg.fields.routingKey
 *  - msg.properties.headers['x-event-type']
 *  - parsed msg.content.channel or msg.content.type (if content is JSON)
 * Returns null if none found.
 * @param {import("amqplib").Message} msg
 */
function getEventType(msg) {
  if (!msg) return null;

  // 1) routing key from AMQP fields
  if (msg.fields && msg.fields.routingKey) {
    logger.debug(
      { source: "routingKey", value: msg.fields.routingKey },
      "getEventType: eventType detected",
    );
    return msg.fields.routingKey;
  }

  // 2) legacy/custom header
  if (msg.properties && msg.properties.headers) {
    const h =
      msg.properties.headers["x-event-type"] ||
      msg.properties.headers["event-type"];
    if (h) return h;
  }

  // 3) some publishers (including updated upstream) put a `channel` or `type`
  // property inside the message content payload. Try to parse JSON content.
  try {
    const raw =
      msg.content && msg.content.toString ? msg.content.toString() : null;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      if (parsed.channel) {
        logger.debug(
          { source: "content.channel", value: parsed.channel },
          "getEventType: eventType detected from content.channel",
        );
        return parsed.channel;
      }
      if (parsed.type) {
        logger.debug(
          { source: "content.type", value: parsed.type },
          "getEventType: eventType detected from content.type",
        );
        return parsed.type;
      }
      // Some messages may wrap the payload as { fields: { routingKey }, content }
      if (parsed.fields && parsed.fields.routingKey)
        return parsed.fields.routingKey;
      if (
        parsed.properties &&
        parsed.properties.headers &&
        parsed.properties.headers["x-event-type"]
      ) {
        logger.debug(
          {
            source: "content.headers",
            value: parsed.properties.headers["x-event-type"],
          },
          "getEventType: eventType detected from content.properties.headers",
        );
        return parsed.properties.headers["x-event-type"];
      }
    }
  } catch (e) {
    // not JSON or parse failed — ignore
    logger.debug(
      "getEventType: failed to parse message content for event type",
    );
  }

  return null;
}

module.exports = { getEventType };
