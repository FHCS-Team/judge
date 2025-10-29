const logger = require("#utils/logger.js");

/**
 * Test message consumer. This consumer will handle messages with header
 * `x-event-type: judge.test` OR when the environment variable
 * `JUDGE_CONSUMER_ACCEPT_TEST` is set to a truthy value.
 * This is intentionally conservative so it won't accidentally claim unrelated messages.
 * @param {import("amqplib").Message} msg
 */
module.exports = async function onTestMessage(msg) {
  if (!msg || !msg.properties) return false;

  return true;
};
