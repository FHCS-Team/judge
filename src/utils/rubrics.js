/**
 * Rubric Utilities
 * Validates and processes rubric evaluation results
 */

const logger = require("./logger");

/**
 * Rubric types defined in documentation
 */
const RubricTypes = {
  TEST_CASES: "test_cases",
  SECURITY_SCAN: "security_scan",
  API_ENDPOINTS: "api_endpoints",
  PERFORMANCE_BENCHMARK: "performance_benchmark",
  CODE_QUALITY: "code_quality",
  UI_TESTS: "ui_tests",
  DATABASE_INTEGRATION: "database_integration",
  CUSTOM: "custom",
};

/**
 * Validate rubric result against expected format
 */
function validateRubricResult(rubricData, rubricConfig) {
  const errors = [];

  // Required fields
  if (!rubricData.rubric_id) {
    errors.push("Missing rubric_id");
  }

  if (typeof rubricData.score !== "number") {
    errors.push("Missing or invalid score");
  }

  if (typeof rubricData.max_score !== "number") {
    errors.push("Missing or invalid max_score");
  }

  // Check score bounds
  if (rubricData.score < 0) {
    errors.push("Score cannot be negative");
  }

  if (rubricData.score > rubricData.max_score) {
    errors.push("Score cannot exceed max_score");
  }

  // Validate type-specific details structure
  if (rubricData.rubric_type) {
    const detailsErrors = validateDetailsForType(
      rubricData.rubric_type,
      rubricData.details
    );
    errors.push(...detailsErrors);
  }

  return errors;
}

/**
 * Validate details structure based on rubric type
 */
function validateDetailsForType(rubricType, details) {
  const errors = [];

  if (!details) {
    return errors; // Details are optional
  }

  switch (rubricType) {
    case RubricTypes.TEST_CASES:
      if (typeof details.total !== "number") {
        errors.push("test_cases: details.total must be a number");
      }
      if (typeof details.passed !== "number") {
        errors.push("test_cases: details.passed must be a number");
      }
      if (typeof details.failed !== "number") {
        errors.push("test_cases: details.failed must be a number");
      }
      break;

    case RubricTypes.SECURITY_SCAN:
      if (details.vulnerabilities && !Array.isArray(details.vulnerabilities)) {
        errors.push("security_scan: details.vulnerabilities must be an array");
      }
      if (details.summary && typeof details.summary !== "object") {
        errors.push("security_scan: details.summary must be an object");
      }
      break;

    case RubricTypes.API_ENDPOINTS:
      if (details.endpoints && !Array.isArray(details.endpoints)) {
        errors.push("api_endpoints: details.endpoints must be an array");
      }
      if (typeof details.total !== "number") {
        errors.push("api_endpoints: details.total must be a number");
      }
      if (typeof details.passed !== "number") {
        errors.push("api_endpoints: details.passed must be a number");
      }
      break;

    case RubricTypes.PERFORMANCE_BENCHMARK:
      if (details.benchmarks && !Array.isArray(details.benchmarks)) {
        errors.push(
          "performance_benchmark: details.benchmarks must be an array"
        );
      }
      break;

    case RubricTypes.CODE_QUALITY:
      if (details.metrics && typeof details.metrics !== "object") {
        errors.push("code_quality: details.metrics must be an object");
      }
      break;

    default:
      // Custom or unknown type - no validation
      break;
  }

  return errors;
}

/**
 * Calculate percentage for rubric
 */
function calculatePercentage(score, maxScore) {
  if (maxScore === 0) {
    return 0;
  }
  return Math.round((score / maxScore) * 100 * 100) / 100; // Round to 2 decimals
}

/**
 * Normalize rubric result with calculated fields
 */
function normalizeRubricResult(rubricData, rubricConfig) {
  const normalized = {
    rubric_id: rubricData.rubric_id,
    rubric_name: rubricData.rubric_name || rubricConfig?.rubric_name || "",
    rubric_type:
      rubricData.rubric_type || rubricConfig?.rubric_type || "custom",
    score: Number(rubricData.score),
    max_score: Number(rubricData.max_score),
    percentage: calculatePercentage(rubricData.score, rubricData.max_score),
    weight: rubricConfig?.weight || 1.0,
    weighted_score: 0, // Will be calculated
    status: "unknown",
    details: rubricData.details || {},
    feedback: rubricData.feedback || "",
  };

  // Calculate weighted score
  normalized.weighted_score = normalized.score * normalized.weight;

  // Determine status
  if (normalized.percentage >= 100) {
    normalized.status = "passed";
  } else if (normalized.percentage >= 50) {
    normalized.status = "partial";
  } else if (normalized.percentage > 0) {
    normalized.status = "partial";
  } else {
    normalized.status = "failed";
  }

  // If explicit status provided, use it
  if (rubricData.status) {
    normalized.status = rubricData.status;
  }

  return normalized;
}

/**
 * Aggregate rubric results into overall result
 */
function aggregateRubrics(rubricResults, problemConfig) {
  const rubrics = Array.isArray(rubricResults) ? rubricResults : [];

  // Calculate totals
  let totalScore = 0;
  let maxScore = 0;
  let totalWeightedScore = 0;
  let totalWeight = 0;

  const rubricScores = [];

  for (const rubric of rubrics) {
    totalScore += rubric.score || 0;
    maxScore += rubric.max_score || 0;
    totalWeightedScore += rubric.weighted_score || 0;
    totalWeight += rubric.weight || 1.0;

    rubricScores.push(rubric);
  }

  // Calculate overall percentage
  const percentage =
    maxScore > 0 ? Math.round((totalScore / maxScore) * 100 * 100) / 100 : 0;

  // Determine grade and verdict
  const grade = getGrade(percentage);
  const verdict = getVerdict(percentage);
  const passed = percentage >= 50; // Configurable threshold

  return {
    passed,
    total_score: totalScore,
    max_score: maxScore,
    percentage,
    grade,
    verdict,
    rubric_scores: rubricScores,
    summary: {
      total_rubrics: rubrics.length,
      weighted_score: totalWeightedScore,
      total_weight: totalWeight,
    },
  };
}

/**
 * Get letter grade from percentage
 */
function getGrade(percentage) {
  if (percentage >= 97) return "A+";
  if (percentage >= 93) return "A";
  if (percentage >= 90) return "A-";
  if (percentage >= 87) return "B+";
  if (percentage >= 83) return "B";
  if (percentage >= 80) return "B-";
  if (percentage >= 77) return "C+";
  if (percentage >= 73) return "C";
  if (percentage >= 70) return "C-";
  if (percentage >= 67) return "D+";
  if (percentage >= 63) return "D";
  if (percentage >= 60) return "D-";
  return "F";
}

/**
 * Get verdict from percentage
 */
function getVerdict(percentage) {
  if (percentage >= 90) return "Excellent";
  if (percentage >= 80) return "Good";
  if (percentage >= 70) return "Satisfactory";
  if (percentage >= 60) return "Acceptable";
  if (percentage >= 50) return "Needs Improvement";
  return "Unsatisfactory";
}

/**
 * Process all rubric files from directory
 */
async function processRubricFiles(rubricFiles, problemConfig) {
  const fs = require("fs/promises");
  const path = require("path");

  const rubricResults = [];
  const errors = [];

  // Get rubric configurations from problem config
  const rubricConfigs = {};
  if (problemConfig.rubrics && Array.isArray(problemConfig.rubrics)) {
    for (const rubricConfig of problemConfig.rubrics) {
      rubricConfigs[rubricConfig.rubric_id] = rubricConfig;
    }
  }

  for (const rubricFile of rubricFiles) {
    try {
      const rubricContent = await fs.readFile(rubricFile, "utf8");
      const rubricData = JSON.parse(rubricContent);

      // Get corresponding config
      const rubricConfig = rubricConfigs[rubricData.rubric_id];

      // Validate
      const validationErrors = validateRubricResult(rubricData, rubricConfig);
      if (validationErrors.length > 0) {
        logger.warn(
          `Rubric ${rubricData.rubric_id} validation errors:`,
          validationErrors
        );
        errors.push({
          rubric_id: rubricData.rubric_id,
          file: path.basename(rubricFile),
          errors: validationErrors,
        });
      }

      // Normalize and add to results
      const normalized = normalizeRubricResult(rubricData, rubricConfig);
      rubricResults.push(normalized);
    } catch (error) {
      logger.error(`Error processing rubric file ${rubricFile}:`, error);
      errors.push({
        file: path.basename(rubricFile),
        error: error.message,
      });
    }
  }

  return {
    rubrics: rubricResults,
    errors,
  };
}

module.exports = {
  RubricTypes,
  validateRubricResult,
  validateDetailsForType,
  calculatePercentage,
  normalizeRubricResult,
  aggregateRubrics,
  processRubricFiles,
  getGrade,
  getVerdict,
};
