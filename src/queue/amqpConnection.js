const logger = require("#utils/logger.js");
const amqp = require("amqplib");

function buildUrl() {
  if (process.env.JUDGE_QUEUE_URL) return process.env.JUDGE_QUEUE_URL;

  const host = process.env.JUDGE_QUEUE_HOST || "localhost";
  const port = process.env.JUDGE_QUEUE_PORT || "5672";
  const user = process.env.JUDGE_QUEUE_USERNAME;
  ("guest");
  const pass = process.env.JUDGE_QUEUE_PASSWORD;
  ("guest");
  const vhost = process.env.JUDGE_QUEUE_VHOST || "/";
  return `amqp://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}${vhost === "/" ? "" : `/${encodeURIComponent(vhost)}`}`;
}

let connection = null;
let connecting = false;
let closedByUser = false;

// Retry logic
const MAX_RECONNECT_DELAY = 30000; // ms
const INITIAL_DELAY = 1000;

async function _connectWithRetry() {
  if (connection) return connection;
  if (connecting)
    return new Promise((res) => setTimeout(() => res(connection), 100));

  connecting = true;
  let attempt = 0;
  const url = buildUrl();

  while (!connection && !closedByUser) {
    attempt += 1;
    try {
      connection = await amqp.connect(url);
      connection.on("error", (err) => {
        logger.error(
          "AMQP connection error",
          err && err.message ? err.message : err,
        );
      });

      connection.on("close", () => {
        logger.warn("AMQP connection closed");
        connection = null;
        if (!closedByUser) {
          setTimeout(() => {
            _connectWithRetry().catch(() => {});
          }, INITIAL_DELAY);
        }
      });

      connecting = false;
      return connection;
    } catch (err) {
      const delay = Math.min(
        INITIAL_DELAY * 2 ** Math.min(attempt, 8),
        MAX_RECONNECT_DELAY,
      );
      logger.warn(
        `AMQP connect attempt ${attempt} failed: ${err && err.message ? err.message : err}. retrying in ${delay}ms`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  connecting = false;
  if (!connection)
    throw new Error("AMQP connection closed or could not be established");
  return connection;
}

async function connect() {
  closedByUser = false;
  return _connectWithRetry();
}

/**
 * Create and return a channel (confirm channel optionally).
 * If `confirm` is true, returns a ConfirmChannel.
 * @returns {Promise<amqp.Channel|amqp.ConfirmChannel>}
 */
async function createChannel({ confirm = false } = {}) {
  const conn = await connect();
  if (confirm) return conn.createConfirmChannel();
  return conn.createChannel();
}

async function close() {
  closedByUser = true;
  if (!connection) return;
  try {
    await connection.close();
  } catch (err) {
    logger.error(
      "Error closing amqp connection",
      err && err.message ? err.message : err,
    );
  } finally {
    connection = null;
  }
}

module.exports = {
  connect,
  createChannel,
  close,
};
