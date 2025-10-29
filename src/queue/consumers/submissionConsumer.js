const { BaseConsumer } = require("./baseConsumer");
const logger = require("../../utils/logger");

/**
 * Consumer for submission events (dmoj.submission.submitted)
 * Handles incoming submission requests from DMOJ platform.
 */
class SubmissionConsumer extends BaseConsumer {
  constructor(options = {}) {
    super({
      ...options,
      messageType: "submission",
    });
  }

  validate(envelope) {
    const baseValidation = super.validate(envelope);
    if (!baseValidation.valid) {
      return baseValidation;
    }

    const errors = [];
    const payload = envelope.payload;

    if (!payload.submission_id) {
      errors.push("submission_id is required");
    }

    if (!payload.problem_id) {
      errors.push("problem_id is required");
    }

    if (!payload.package_url && !payload.submission_blob) {
      errors.push("Either package_url or submission_blob is required");
    }

    return { valid: errors.length === 0, errors };
  }

  async process(envelope, context) {
    const {
      submission_id,
      problem_id,
      package_url,
      submission_blob,
      team_id,
      user_id,
    } = envelope.payload;

    logger.info(
      { submission_id, problem_id, team_id, user_id },
      "Processing submission event",
    );

    if (!this.processor) {
      logger.error("No processor configured for SubmissionConsumer");
      context.nack(new Error("Processor not configured"));
      return;
    }

    try {
      // Publish evaluation started event
      await this.publish(
        "evaluation.started",
        {
          submission_id,
          problem_id,
          started_at: new Date().toISOString(),
          queued_at:
            envelope.created_at || envelope.payload.timestamp_submitted,
        },
        {
          correlationId: envelope.id,
        },
      );

      // Submit submission to processor
      const submissionData = {
        submission_id,
        problem_id,
        team_id,
        user_id,
        archive_url: package_url,
        archive_data: submission_blob,
      };

      const submitResult =
        await this.processor.submitSubmission(submissionData);

      // Run evaluation
      const evaluationRequest = {
        submission_id,
        problem_id,
        team_id,
        user_id,
        ...envelope.payload.run_options,
      };

      const evalResult = await this.processor.runEvaluation(evaluationRequest);

      // Publish result event
      await this.publish(
        "result.evaluation.completed",
        {
          submission_id,
          problem_id,
          status: evalResult.status === "completed" ? "completed" : "failed",
          evaluated_at: evalResult.completed_at || evalResult.failed_at,
          execution_status:
            evalResult.status === "completed" ? "success" : "failed",
          timed_out: false,
          total_score: evalResult.total_score || 0,
          max_score: evalResult.max_score || 0,
          percentage: evalResult.percentage || 0,
          rubrics: Object.entries(evalResult.rubrics || {}).map(
            ([rubric_id, data]) => ({
              rubric_id,
              score: data.score || 0,
              max_score: data.max_score || 0,
              details: data,
            }),
          ),
          metadata: evalResult.metadata || {},
          artifacts: [],
        },
        {
          correlationId: envelope.id,
        },
      );

      logger.info(
        { submission_id, problem_id, status: evalResult.status },
        "Submission evaluation completed",
      );

      context.ack();
    } catch (error) {
      logger.error(
        { submission_id, problem_id, error: error.message },
        "Submission processing failed",
      );

      // Publish failure event
      await this.publish(
        "result.evaluation.failed",
        {
          submission_id,
          problem_id,
          status: "failed",
          evaluated_at: new Date().toISOString(),
          execution_status: "error",
          error: error.message,
        },
        {
          correlationId: envelope.id,
        },
      );

      context.nack(error);
    }
  }
}

module.exports = { SubmissionConsumer };
