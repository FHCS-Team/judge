const logger = require("#utils/logger.js");
const os = require("os");
const { createChannel, connect, close } = require("./amqpConnection");

const JUDGE_EXCHANGE = process.env.JUDGE_EXCHANGE || "dmoj-events";
const JUDGE_QUEUE_NAME = process.env.JUDGE_QUEUE_NAME || "judge-queue";
const JUDGE_EXCHANGE_TYPE = process.env.JUDGE_EXCHANGE_TYPE || "topic";

// Unique identifier for this process/instance so we can avoid processing our
// own published messages. Can be overridden with JUDGE_INSTANCE_ID env var.
const INSTANCE_ID =
  process.env.JUDGE_INSTANCE_ID || `${os.hostname()}:${process.pid}`;

async function assertExchange(
  channel,
  exchangeName,
  type = JUDGE_EXCHANGE_TYPE,
  opts = { durable: true },
) {
  const name = exchangeName || JUDGE_EXCHANGE;
  await channel.assertExchange(name, type, opts);
}

async function assertQueue(channel, queueName, opts = { durable: true }) {
  const name = queueName || JUDGE_QUEUE_NAME;
  await channel.assertQueue(name, opts);
}

async function bindQueue(channel, queueName, exchangeName, pattern = "") {
  const q = queueName || JUDGE_QUEUE_NAME;
  const ex = exchangeName || JUDGE_EXCHANGE;
  await channel.bindQueue(q, ex, pattern);
}

async function publish(routingKey, content, options = {}) {
  // Publish the provided `content` as the top-level message body to the
  // configured exchange. This matches the expected envelope shape used by
  // external consumers (judge-site).
  const ch = await createChannel({ confirm: false });
  try {
    await ch.assertExchange(JUDGE_EXCHANGE, JUDGE_EXCHANGE_TYPE, {
      durable: true,
    });

    const props = Object.assign({}, options);
    // Ensure JSON content-type when not provided
    if (!props.contentType) props.contentType = "application/json";
    // Attach origin header so local consumers can ignore self-published messages
    props.headers = Object.assign({}, props.headers || {}, {
      "x-origin": INSTANCE_ID,
      ...(props.headers || {}),
    });

    const body = Buffer.from(JSON.stringify(content));
    const ok = ch.publish(JUDGE_EXCHANGE, routingKey, body, props);

    logger.debug(
      `Published message to ${JUDGE_EXCHANGE} with key ${routingKey}`,
    );
    logger.debug(content);

    return ok;
  } finally {
    try {
      await ch.close();
    } catch (e) {}
  }
}

async function consume(queueName, onMessage, { prefetch = 1 } = {}) {
  const ch = await createChannel({ confirm: false });
  const q = queueName || JUDGE_QUEUE_NAME;
  await ch.assertQueue(q, { durable: true });
  await ch.prefetch(prefetch);

  const wrapped = async (msg) => {
    try {
      await onMessage(msg);
      ch.ack(msg);
    } catch (err) {
      ch.nack(msg, false, false);
    }
  };

  await ch.consume(q, wrapped, { noAck: false });
  return ch;
}

module.exports = {
  connect,
  close,
  createChannel,
  assertExchange,
  assertQueue,
  bindQueue,
  publish,
  consume,
  INSTANCE_ID,
};
