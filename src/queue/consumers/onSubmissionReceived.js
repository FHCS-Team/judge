/**
 * Submission received consumer.
 */
const logger = require("#utils/logger.js");

/**
 * Handle submission events from the message queue.
 * Expected header: headers['x-event-type'] === 'judge.submission.created'
 * Expected content (JSON): { submission_id, problem_id, submission_url }
 * @param {import("amqplib").Message} msg
 */
module.exports = async function onSubmissionReceived(msg) {
  if (!msg || !msg.properties) return false;

  const headers = msg.properties.headers || {};
  const eventType = headers["x-event-type"] || headers["X-Event-Type"] || null;
  if (eventType !== "judge.submission.created") return false;

  let payload;
  try {
    payload = JSON.parse(msg.content && msg.content.toString());
  } catch (err) {
    logger.warn("onSubmissionReceived: failed to parse message content");
    logger.debug(err && err.message ? err.message : err);
    return false;
  }

  const { submission_id, problem_id, submission_url } = payload || {};
  if (!submission_id || !problem_id || !submission_url) {
    logger.warn("onSubmissionReceived: missing required fields in payload", {
      submission_id,
      problem_id,
      submission_url,
    });
    return false;
  }

  // Minimal handling: log and return handled. The actual work (download, enqueue)
  // should be performed by a service module invoked here.
  logger.info(
    `Submission received: submission=${submission_id} problem=${problem_id}`,
  );
  logger.debug({ payload });

  return true;
};
