const fs = require("fs");
const path = require("path");
const logger = require("../src/utils/logger");

// Monkey-patch runEvaluation to avoid Docker actions during this demo
const processorModule = require("../src/processor");
if (processorModule && processorModule.JudgeProcessor) {
  processorModule.JudgeProcessor.prototype.runEvaluation = async function (
    evaluationRequest,
  ) {
    logger.info(
      { evaluationRequest },
      "Demo: runEvaluation skipped (monkey-patched)",
    );
    const result = {
      evaluation_id: `demo-${Date.now()}`,
      submission_id: evaluationRequest.submission_id,
      problem_id: evaluationRequest.problem_id,
      status: "skipped",
      started_at: new Date().toISOString(),
      containers: {},
      rubrics: {},
      metadata: { demo: true },
    };
    try {
      const artifactsDir = path.resolve(
        this.artifactsDir,
        `demo-${Date.now()}`,
      );
      await fs.promises.mkdir(artifactsDir, { recursive: true });
      if (this.writeEvaluationResult) {
        await this.writeEvaluationResult(artifactsDir, result);
      }
    } catch (e) {
      logger.warn(
        "Demo: failed to write demo evaluation result",
        e && e.message ? e.message : e,
      );
    }
    return result;
  };
}

const onSubmissionReceived = require("../src/queue/consumers/onSubmissionReceived");

async function run() {
  // Use the exact URL the user provided (external server expected to be running on port 8000)
  const payload = {
    submission_id: "demo-sub-1",
    problem_id: "demo-prob-1",
    submission_url: "http://localhost:8000/submission/1/package",
    team_id: "demo-team",
  };

  const msg = {
    content: Buffer.from(JSON.stringify(payload)),
    properties: {
      headers: {
        "x-event-type": "judge.submission.created",
      },
    },
  };

  logger.info("Invoking onSubmissionReceived with payload", payload);
  const handled = await onSubmissionReceived(msg);
  logger.info("Consumer returned", { handled });

  // Wait a short time for background processing to run (submitSubmission downloads/extracts)
  await new Promise((r) => setTimeout(r, 4000));

  // Inspect where submission would be stored
  const dataDir = path.resolve(process.cwd(), "data");
  const submissionPath = path.join(
    dataDir,
    "submissions",
    payload.problem_id,
    payload.submission_id,
  );
  try {
    const exists = fs.existsSync(submissionPath);
    logger.info("Submission path exists:", { submissionPath, exists });
    if (exists) {
      const files = await fs.promises.readdir(submissionPath);
      console.log("Submission directory files:", files);
    } else {
      console.log(
        "Submission directory not created by submitSubmission (check logs)",
      );
    }
  } catch (e) {
    console.error(
      "Error inspecting submission path",
      e && e.message ? e.message : e,
    );
  }

  process.exit(0);
}

run().catch((e) => {
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
});
