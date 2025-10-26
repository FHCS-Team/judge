const logger = require("../../utils/logger");
const { JudgeProcessor } = require("../../processor");

/**
 * Register submission handler on a queue instance.
 * The handler processes submission evaluations using the complete judge workflow.
 * @param {InMemoryQueue} queue
 */
function registerSubmissionHandler(queue) {
  if (!queue || typeof queue.registerHandler !== "function") {
    throw new Error("queue must support registerHandler");
  }

  queue.registerHandler("submission", async (msg, { ack, nack }) => {
    logger.info("Received submission", {
      id: msg.payload && msg.payload.submission_id,
      problem_id: msg.payload && msg.payload.problem_id,
      team_id: msg.payload && msg.payload.team_id,
    });

    try {
      const processor = new JudgeProcessor();

      // Extract submission data from message payload
      const submissionData = {
        submission_id: msg.payload.submission_id || "unknown",
        problem_id: msg.payload.problem_id || "unknown",
        team_id: msg.payload.team_id || "unknown",
        archive_url: msg.payload.archive_url,
        archive_data: msg.payload.archive_data,
      };

      // Submit submission if we have archive data/URL
      if (submissionData.archive_url || submissionData.archive_data) {
        await processor.submitSubmission(submissionData);
      }

      // Run evaluation
      const evaluationResult = await processor.runEvaluation({
        submission_id: submissionData.submission_id,
        problem_id: submissionData.problem_id,
        team_id: submissionData.team_id,
      });

      // Create result event payload from evaluation result
      const resultPayload = {
        submission_id: evaluationResult.submission_id,
        problem_id: evaluationResult.problem_id,
        team_id: evaluationResult.team_id,
        status: evaluationResult.status,
        evaluated_at:
          evaluationResult.completed_at || evaluationResult.failed_at,
        execution_status:
          evaluationResult.status === "completed" ? "success" : "error",
        timed_out: false,
        total_score: evaluationResult.total_score || 0,
        max_score: evaluationResult.max_score || 0,
        percentage: evaluationResult.percentage || 0,
        metadata: {
          evaluation_id: evaluationResult.evaluation_id,
          containers: evaluationResult.containers,
          rubrics: evaluationResult.rubrics,
          ...evaluationResult.metadata,
        },
        error: evaluationResult.error,
      };

      // Enqueue result event back onto the queue
      queue.enqueue({
        type: "result.evaluation.completed",
        payload: resultPayload,
        max_retries: 0,
        _internal: true,
      });

      ack();
    } catch (err) {
      // Log error with structured logger (include stack when available)
      logger.error("Submission handler error (caught)", {
        submission_id: msg.payload && msg.payload.submission_id,
        problem_id: msg.payload && msg.payload.problem_id,
        message: err && err.message,
        stack: err && err.stack,
      });

      // Send error result event
      const errorPayload = {
        submission_id: (msg.payload && msg.payload.submission_id) || "unknown",
        problem_id: (msg.payload && msg.payload.problem_id) || "unknown",
        team_id: (msg.payload && msg.payload.team_id) || "unknown",
        status: "failed",
        evaluated_at: new Date().toISOString(),
        execution_status: "error",
        timed_out: false,
        total_score: 0,
        max_score: 0,
        percentage: 0,
        error: err.message,
      };

      queue.enqueue({
        type: "result.evaluation.failed",
        payload: errorPayload,
        max_retries: 0,
        _internal: true,
      });

      nack(err);
    }
  });
}

module.exports = { registerSubmissionHandler };
