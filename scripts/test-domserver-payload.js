#!/usr/bin/env node
/**
 * Test script to verify DOMserver payload structure
 * Usage: node scripts/test-domserver-payload.js <submission_id>
 */

const fs = require("fs");
const path = require("path");

// Get submission ID from command line
const submissionId = process.argv[2];

if (!submissionId) {
  console.error(
    "Usage: node scripts/test-domserver-payload.js <submission_id>"
  );
  process.exit(1);
}

// Load results.json
const resultsPath = path.join(
  __dirname,
  "../data/results",
  submissionId,
  "results.json"
);

try {
  const resultsContent = fs.readFileSync(resultsPath, "utf8");
  const results = JSON.parse(resultsContent);

  // Simulate the payload that would be sent to DOMserver
  const startTime = new Date(results.evaluatedAt);
  const endTime = new Date(results.evaluatedAt);
  endTime.setMilliseconds(
    endTime.getMilliseconds() + (results.metadata?.executionTime || 0)
  );

  const executionTimeSeconds = (endTime - startTime) / 1000;
  const totalScore = results.rubricScores.reduce(
    (sum, r) => sum + (r.score || 0),
    0
  );
  const maxScore = results.rubricScores.reduce(
    (sum, r) => sum + (r.max_score || 0),
    0
  );
  const overallPercentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;

  const payload = {
    judge_task_id: null,
    submission_id: results.submissionId,
    problem_id: results.problemId,
    status: results.status,
    started_at: startTime.toISOString(),
    completed_at: endTime.toISOString(),
    execution_time_seconds: executionTimeSeconds,
    total_score: totalScore,
    max_score: maxScore,
    percentage: overallPercentage,
    rubrics: results.rubricScores.map((r) => ({
      rubric_id: r.rubric_id,
      name: r.rubric_name,
      rubric_type: r.rubric_type,
      score: r.score || 0,
      max_score: r.max_score,
      percentage:
        r.percentage || (r.max_score > 0 ? (r.score / r.max_score) * 100 : 0),
      status: r.status || "DONE",
      message: r.message || "",
      details: r.details || {},
    })),
    logs_url: `http://localhost:3000/api/results/${results.submissionId}/logs`,
    artifacts_urls: {
      metrics: `http://localhost:3000/api/results/${results.submissionId}/metrics`,
    },
    metadata: {
      judgehost_version: "1.0.0",
      judgehost_hostname: "test-judgehost",
      evaluation_method: "containerized_hooks",
      timestamp: new Date().toISOString(),
    },
  };

  console.log("=== DOMserver Payload Structure ===\n");
  console.log(JSON.stringify(payload, null, 2));

  console.log("\n=== Summary ===");
  console.log(`Submission ID: ${payload.submission_id}`);
  console.log(`Problem ID: ${payload.problem_id}`);
  console.log(`Status: ${payload.status}`);
  console.log(
    `Total Score: ${payload.total_score.toFixed(2)} / ${payload.max_score}`
  );
  console.log(`Percentage: ${payload.percentage.toFixed(2)}%`);
  console.log(`Execution Time: ${payload.execution_time_seconds.toFixed(3)}s`);
  console.log(`\nRubrics (${payload.rubrics.length}):`);

  payload.rubrics.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.name} (${r.rubric_id})`);
    console.log(`     Type: ${r.rubric_type}`);
    console.log(
      `     Score: ${r.score.toFixed(2)} / ${
        r.max_score
      } (${r.percentage.toFixed(2)}%)`
    );
    console.log(`     Status: ${r.status}`);
    console.log(`     Message: ${r.message}`);
    console.log(`     Details: ${JSON.stringify(r.details)}`);
  });

  console.log("\n=== Validation ===");

  // Validate required fields
  const validations = [
    { field: "submission_id", value: payload.submission_id, required: true },
    { field: "problem_id", value: payload.problem_id, required: true },
    { field: "status", value: payload.status, required: true },
    { field: "total_score", value: payload.total_score, required: true },
    { field: "max_score", value: payload.max_score, required: true },
    { field: "percentage", value: payload.percentage, required: true },
    { field: "rubrics", value: payload.rubrics, required: true, isArray: true },
  ];

  let isValid = true;
  validations.forEach((v) => {
    const exists = v.value !== undefined && v.value !== null;
    const arrayValid =
      !v.isArray || (Array.isArray(v.value) && v.value.length > 0);
    const valid = exists && arrayValid;

    console.log(
      `${valid ? "✓" : "✗"} ${v.field}: ${
        exists ? (v.isArray ? `${v.value.length} items` : "present") : "MISSING"
      }`
    );

    if (!valid && v.required) {
      isValid = false;
    }
  });

  // Validate each rubric
  console.log("\nRubric Validation:");
  payload.rubrics.forEach((r, i) => {
    const rubricValid =
      r.rubric_id &&
      r.name &&
      r.rubric_type &&
      r.score !== undefined &&
      r.max_score !== undefined &&
      r.percentage !== undefined;
    console.log(
      `${rubricValid ? "✓" : "✗"} Rubric ${i + 1} (${r.rubric_id}): ${
        rubricValid ? "valid" : "INVALID"
      }`
    );

    if (!rubricValid) {
      isValid = false;
      console.log(
        `    Missing fields: ${!r.rubric_id ? "rubric_id " : ""}${
          !r.name ? "name " : ""
        }${!r.rubric_type ? "rubric_type " : ""}`
      );
    }
  });

  console.log(`\n${isValid ? "✓ Payload is VALID" : "✗ Payload is INVALID"}`);
  process.exit(isValid ? 0 : 1);
} catch (error) {
  console.error("Error:", error.message);
  process.exit(1);
}
