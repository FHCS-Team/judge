#!/usr/bin/env node

const path = require("path");
const { JudgeProcessor } = require("../src/processor");
const logger = require("../src/utils/logger");

async function runDemo() {
  try {
    logger.info(
      "Starting Judge Processor Demo with updated db-optimization package",
    );

    const processor = new JudgeProcessor({
      dataDir: path.resolve(__dirname, "../data"),
    });

    const problemId = "db-optimization";
    const submissionId = `demo-submission-${Date.now()}`;
    const teamId = "demo-team";

    // Step 1: Submit problem package
    logger.info("Step 1: Submitting problem package...");
    const problemPackageDir = path.resolve(
      __dirname,
      "../mocks/packages/db-optimization-updated",
    );

    // Copy problem package to processor's problems directory
    const problemDir = path.resolve(processor.problemsDir, problemId);
    await processor.copyDirectory(problemPackageDir, problemDir);

    // Validate the package
    await processor.validateProblemPackage(problemDir);
    logger.info("✓ Problem package validated");

    // Step 2: Build problem images
    logger.info("Step 2: Building problem images...");
    const buildResult = await processor.buildProblemImages(problemId);
    logger.info("✓ Problem images built:", buildResult);

    // Step 3: Submit submission
    logger.info("Step 3: Submitting test submission...");
    const submissionPackageDir = path.resolve(
      __dirname,
      "../mocks/packages/db-optimization-submission-updated",
    );

    // Copy submission to processor's submissions directory
    const submissionDir = path.resolve(
      processor.submissionsDir,
      problemId,
      submissionId,
    );
    await processor.copyDirectory(submissionPackageDir, submissionDir);
    logger.info("✓ Submission submitted");

    // Step 4: Run evaluation
    logger.info("Step 4: Running evaluation...");
    const evaluationRequest = {
      submission_id: submissionId,
      problem_id: problemId,
      team_id: teamId,
    };

    const result = await processor.runEvaluation(evaluationRequest);

    logger.info("Evaluation completed:");
    logger.info("Status:", result.status);
    logger.info("Total Score:", result.total_score, "/", result.max_score);
    logger.info("Percentage:", result.percentage?.toFixed(2) + "%");

    if (result.rubrics) {
      logger.info("Rubric Results:");
      for (const [rubricId, rubric] of Object.entries(result.rubrics)) {
        logger.info(
          `  ${rubricId}: ${rubric.score}/${rubric.max_score} (${rubric.status})`,
        );
        if (rubric.message) {
          logger.info(`    ${rubric.message}`);
        }
      }
    }

    if (result.error) {
      logger.error("Evaluation error:", result.error);
    }

    logger.info("Demo completed!");
  } catch (error) {
    logger.error("Demo failed:", error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  runDemo();
}

module.exports = { runDemo };
