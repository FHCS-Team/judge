/**
 * API Routes for Result Retrieval
 * Handles fetching evaluation results, logs, and artifacts
 */

const express = require("express");
const path = require("path");
const fs = require("fs/promises");
const logger = require("../../utils/logger");
const config = require("../../config");

const router = express.Router();

/**
 * GET /api/results/:submission_id
 * Get complete evaluation results
 */
router.get("/:submission_id", async (req, res) => {
  try {
    const { submission_id } = req.params;
    const { include_logs, include_metrics, include_artifacts, format } =
      req.query;

    // Validate format parameter (currently only JSON is supported)
    if (format && format !== "json") {
      return res.status(400).json({
        success: false,
        error: "invalid_format",
        message: "Only JSON format is currently supported",
        details: {
          supported_formats: ["json"],
          requested_format: format,
        },
      });
    }

    // Find job
    const { getQueue } = require("../../core/queue");
    const queue = getQueue();
    const jobs = queue.getJobs();
    const job = jobs.find((j) => j.submissionId === submission_id);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: "submission_not_found",
        message: `Submission ${submission_id} not found`,
      });
    }

    // If still queued or running, return status
    if (job.state === "queued" || job.state === "running") {
      return res.status(202).json({
        success: true,
        message: "Evaluation in progress. Check back in a few moments.",
        data: {
          submission_id,
          status: job.state,
          enqueued_at: job.enqueuedAt,
          started_at: job.startedAt,
        },
      });
    }

    // If cancelled or failed, return status
    if (job.state === "cancelled") {
      return res.json({
        success: true,
        data: {
          submission_id,
          status: "cancelled",
          cancelled_at: job.completedAt,
        },
      });
    }

    if (job.state === "failed") {
      return res.json({
        success: true,
        data: {
          submission_id,
          status: "failed",
          error: job.error,
          failed_at: job.completedAt,
        },
      });
    }

    // Load results from file
    const resultsPath = path.join(
      config.paths.resultsDir,
      submission_id,
      "results.json"
    );

    try {
      const resultsContent = await fs.readFile(resultsPath, "utf8");
      const results = JSON.parse(resultsContent);

      // Filter based on query parameters
      const responseData = {
        submission_id: results.submissionId,
        problem_id: results.problemId,
        status: "completed",
        evaluated_at: results.evaluatedAt,
        execution_status: results.executionStatus,
        timed_out: results.timedOut,
        total_score: results.totalScore,
        max_score: results.maxScore,
        percentage: results.percentage,
        rubric_scores: results.rubricScores,
      };

      // Conditionally include logs
      if (include_logs === "true") {
        responseData.logs = results.logs;
      }

      // Conditionally include metrics
      if (include_metrics === "true" || include_metrics === undefined) {
        responseData.metadata = results.metadata;
      }

      // Conditionally include artifacts info
      if (include_artifacts === "true" || include_artifacts === undefined) {
        const artifactsDir = path.join(config.paths.resultsDir, submission_id);
        const files = await fs.readdir(artifactsDir).catch(() => []);

        responseData.artifacts = files
          .filter((f) => !f.startsWith("rubric_") && f !== "results.json")
          .map((f) => ({
            filename: f,
            url: `/api/results/${submission_id}/artifacts/${f}`,
          }));
      }

      res.json({
        success: true,
        data: responseData,
      });
    } catch (error) {
      if (error.code === "ENOENT") {
        // Results file not found but job is completed - inconsistent state
        return res.status(500).json({
          success: false,
          error: "results_not_found",
          message: "Evaluation completed but results file not found",
        });
      }
      throw error;
    }
  } catch (error) {
    logger.error("Error getting results:", error);

    res.status(500).json({
      success: false,
      error: "get_results_failed",
      message: error.message,
    });
  }
});

/**
 * GET /api/results/:submission_id/logs
 * Get execution logs
 */
router.get("/:submission_id/logs", async (req, res) => {
  try {
    const { submission_id } = req.params;
    const { type, format, timestamps } = req.query;

    const resultsPath = path.join(
      config.paths.resultsDir,
      submission_id,
      "results.json"
    );

    try {
      const resultsContent = await fs.readFile(resultsPath, "utf8");
      const results = JSON.parse(resultsContent);

      if (format === "json") {
        res.json({
          success: true,
          data: {
            submission_id,
            logs: results.logs,
            timestamp: results.evaluatedAt,
          },
        });
      } else {
        // Return as plain text
        res.type("text/plain");
        res.send(results.logs || "No logs available");
      }
    } catch (error) {
      if (error.code === "ENOENT") {
        return res.status(404).json({
          success: false,
          error: "results_not_found",
          message: `Results for submission ${submission_id} not found`,
        });
      }
      throw error;
    }
  } catch (error) {
    logger.error("Error getting logs:", error);

    res.status(500).json({
      success: false,
      error: "get_logs_failed",
      message: error.message,
    });
  }
});

/**
 * GET /api/results/:submission_id/artifacts
 * List all artifacts
 */
router.get("/:submission_id/artifacts", async (req, res) => {
  try {
    const { submission_id } = req.params;

    const artifactsDir = path.join(config.paths.resultsDir, submission_id);

    try {
      const files = await fs.readdir(artifactsDir);

      const artifacts = [];

      for (const file of files) {
        if (file.startsWith("rubric_") || file === "results.json") {
          continue; // Skip internal files
        }

        const filePath = path.join(artifactsDir, file);
        const stats = await fs.stat(filePath);

        artifacts.push({
          filename: file,
          size: stats.size,
          modified: stats.mtime.toISOString(),
          url: `/api/results/${submission_id}/artifacts/${file}`,
        });
      }

      res.json({
        success: true,
        data: {
          submission_id,
          artifacts,
          total: artifacts.length,
        },
      });
    } catch (error) {
      if (error.code === "ENOENT") {
        return res.status(404).json({
          success: false,
          error: "results_not_found",
          message: `Results for submission ${submission_id} not found`,
        });
      }
      throw error;
    }
  } catch (error) {
    logger.error("Error listing artifacts:", error);

    res.status(500).json({
      success: false,
      error: "list_artifacts_failed",
      message: error.message,
    });
  }
});

/**
 * GET /api/results/:submission_id/artifacts/:filename
 * Download a specific artifact
 */
router.get("/:submission_id/artifacts/:filename", async (req, res) => {
  try {
    const { submission_id, filename } = req.params;

    // Prevent directory traversal
    if (filename.includes("..") || filename.includes("/")) {
      return res.status(400).json({
        success: false,
        error: "invalid_filename",
        message: "Invalid filename",
      });
    }

    const filePath = path.join(
      config.paths.resultsDir,
      submission_id,
      filename
    );

    try {
      await fs.access(filePath);
      res.download(filePath);
    } catch (error) {
      if (error.code === "ENOENT") {
        return res.status(404).json({
          success: false,
          error: "artifact_not_found",
          message: `Artifact ${filename} not found`,
        });
      }
      throw error;
    }
  } catch (error) {
    logger.error("Error downloading artifact:", error);

    res.status(500).json({
      success: false,
      error: "download_failed",
      message: error.message,
    });
  }
});

/**
 * GET /api/results/:submission_id/rubric/:rubric_id
 * Get detailed rubric evaluation
 */
router.get("/:submission_id/rubric/:rubric_id", async (req, res) => {
  try {
    const { submission_id, rubric_id } = req.params;

    const rubricPath = path.join(
      config.paths.resultsDir,
      submission_id,
      `rubric_${rubric_id}.json`
    );

    try {
      const rubricContent = await fs.readFile(rubricPath, "utf8");
      const rubric = JSON.parse(rubricContent);

      res.json({
        success: true,
        data: rubric,
      });
    } catch (error) {
      if (error.code === "ENOENT") {
        return res.status(404).json({
          success: false,
          error: "rubric_not_found",
          message: `Rubric ${rubric_id} not found for submission ${submission_id}`,
        });
      }
      throw error;
    }
  } catch (error) {
    logger.error("Error getting rubric:", error);

    res.status(500).json({
      success: false,
      error: "get_rubric_failed",
      message: error.message,
    });
  }
});

/**
 * GET /api/results/:submission_id/logs/:container_id
 * Get logs for a specific container
 */
router.get("/:submission_id/logs/:container_id", async (req, res) => {
  try {
    const { submission_id, container_id } = req.params;
    const { format = "json" } = req.query;

    const logsDir = path.join(config.paths.resultsDir, submission_id, "logs");
    const logFile = path.join(logsDir, `${container_id}.log`);

    try {
      const logContent = await fs.readFile(logFile, "utf8");

      if (format === "json") {
        res.json({
          success: true,
          data: {
            submission_id,
            container_id,
            log: logContent,
            log_size_bytes: Buffer.byteLength(logContent, "utf8"),
            generated_at: new Date().toISOString(),
          },
        });
      } else {
        // Return as plain text
        res.type("text/plain");
        res.send(logContent);
      }
    } catch (error) {
      if (error.code === "ENOENT") {
        return res.status(404).json({
          success: false,
          error: "log_not_found",
          message: `Log for container ${container_id} in submission ${submission_id} not found`,
        });
      }
      throw error;
    }
  } catch (error) {
    logger.error("Error getting container logs:", error);

    res.status(500).json({
      success: false,
      error: "get_container_logs_failed",
      message: error.message,
    });
  }
});

/**
 * GET /api/results/:submission_id/metrics
 * Get evaluation metrics
 */
router.get("/:submission_id/metrics", async (req, res) => {
  try {
    const { submission_id } = req.params;

    const metricsPath = path.join(
      config.paths.resultsDir,
      submission_id,
      "shared",
      "migration_metrics.json"
    );

    try {
      const metricsContent = await fs.readFile(metricsPath, "utf8");
      const metrics = JSON.parse(metricsContent);

      res.json({
        success: true,
        data: {
          submission_id,
          metrics,
        },
      });
    } catch (error) {
      if (error.code === "ENOENT") {
        // Try to get metrics from results.json
        const resultsPath = path.join(
          config.paths.resultsDir,
          submission_id,
          "results.json"
        );

        try {
          const resultsContent = await fs.readFile(resultsPath, "utf8");
          const results = JSON.parse(resultsContent);

          res.json({
            success: true,
            data: {
              submission_id,
              metrics: results.metadata || {},
            },
          });
        } catch (resultsError) {
          return res.status(404).json({
            success: false,
            error: "metrics_not_found",
            message: `Metrics for submission ${submission_id} not found`,
          });
        }
      } else {
        throw error;
      }
    }
  } catch (error) {
    logger.error("Error getting metrics:", error);

    res.status(500).json({
      success: false,
      error: "get_metrics_failed",
      message: error.message,
    });
  }
});

module.exports = router;
