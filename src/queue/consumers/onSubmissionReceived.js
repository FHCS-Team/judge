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

  // Determine event type from several possible locations (routing key,
  // headers, or content.channel) because different publishers may use
  // different formats.
  const { getEventType } = require("../message");
  const eventType = getEventType(msg);
  if (eventType !== "judge.submission.created") return false;

  let payload;
  try {
    const raw =
      msg.content && msg.content.toString ? msg.content.toString() : null;
    payload = raw ? JSON.parse(raw) : null;
    // If the publisher wraps the actual payload inside another envelope, accept common keys
    if (payload && typeof payload === "object") {
      // Accept nested envelope shapes: { payload: {...} } or { data: {...} } or { message: {...} }
      if (payload.payload && typeof payload.payload === "object")
        payload = payload.payload;
      else if (payload.data && typeof payload.data === "object")
        payload = payload.data;
      else if (payload.message && typeof payload.message === "object")
        payload = payload.message;
    }
  } catch (err) {
    logger.warn("onSubmissionReceived: failed to parse message content");
    logger.debug(err && err.message ? err.message : err);
    return false;
  }

  let { submission_id, problem_id, submission_url } = payload || {};

  // Coerce IDs to strings when present so they can be used in URLs/paths
  submission_id = submission_id != null ? String(submission_id) : submission_id;
  problem_id = problem_id != null ? String(problem_id) : problem_id;

  // Some upstream publishers send `package_path` (relative path on site) instead of a full URL.
  // The site exposes package downloads at base_url/submission/{submission_id}/package — build that when needed.
  let final_submission_url = submission_url || null;
  if (
    !final_submission_url &&
    payload &&
    payload.package_path &&
    submission_id
  ) {
    try {
      const axiosClient = require("../../config/axios");
      const base =
        (axiosClient && axiosClient.defaults && axiosClient.defaults.baseURL) ||
        process.env.AXIOS_BASE_URL ||
        `http://localhost:${process.env.PORT || 3000}`;
      const joinBase = String(base).replace(/\/$/, "");
      final_submission_url = `${joinBase}/submission/${encodeURIComponent(submission_id)}/package`;
    } catch (e) {
      logger.debug(
        { err: e && e.message ? e.message : String(e) },
        "onSubmissionReceived: failed to construct submission URL from package_path",
      );
    }
  }

  // Also accept archive_url if present
  if (!final_submission_url && payload && payload.archive_url) {
    final_submission_url = payload.archive_url;
  }

  if (!submission_id || !problem_id || !final_submission_url) {
    logger.warn("onSubmissionReceived: missing required fields in payload", {
      submission_id,
      problem_id,
      submission_url: final_submission_url,
    });
    // Add helpful debug info to figure out the incoming message shape
    try {
      logger.debug({
        raw:
          msg.content && msg.content.toString ? msg.content.toString() : null,
        parsed: payload,
      });
    } catch (e) {
      logger.debug(
        "onSubmissionReceived: failed to stringify message content for debug",
      );
    }
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
        archive_url: final_submission_url,
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
