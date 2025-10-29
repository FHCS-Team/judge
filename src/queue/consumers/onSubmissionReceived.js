const logger = require("#utils/logger.js");
const { JudgeProcessor } = require("../../processor");

// Create a single processor instance to reuse across messages
const processor = new JudgeProcessor();

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

  logger.info(
    `Submission received: submission=${submission_id} problem=${problem_id}`,
  );
  logger.debug({ payload });
  // Start processing asynchronously so the AMQP consumer can ack quickly.
  // submitSubmission will handle downloading/extracting the archive (url or data)
  // and `runEvaluation` will perform the evaluation pipeline.
  (async () => {
    try {
      // Map external `submission_url` to processor expected `archive_url` and
      // ensure only the required fields are passed through.
      const mapped = {
        submission_id,
        problem_id,
        archive_url: submission_url,
        team_id: payload.team_id,
      };

      // Ensure submission is saved/extracted and validated
      await processor.submitSubmission(mapped);

      // Kick off evaluation. Pass team_id if present (may be undefined/null).
      await processor.runEvaluation({
        submission_id,
        problem_id,
        team_id: payload.team_id || null,
      });

      logger.info(
        `Processing complete for submission=${submission_id} problem=${problem_id}`,
      );
    } catch (err) {
      // Log the error; do not throw so the consumer can continue processing other messages
      try {
        logger.error(
          {
            err: err && err.message ? err.message : err,
            submission_id,
            problem_id,
          },
          "Error processing submission",
        );
      } catch (e) {
        // Best-effort: swallow logging errors
      }
    }
  })();

  return true;
};
