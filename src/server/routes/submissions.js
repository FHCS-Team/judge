/**
 * API Routes for Submission Management
 * Handles submission creation, status tracking, and cancellation
 */

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs/promises");
const logger = require("../../utils/logger");
const config = require("../../config");
const { enqueue, getJob, cancelJob, Priority } = require("../../core/queue");
const { getProcessor } = require("../../core/processor");

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  dest: path.join(config.paths.workDir, "uploads"),
  limits: {
    fileSize: config.api.maxUploadSizeMB * 1024 * 1024,
  },
});

// Configure multer for multi-file uploads (multi-container submissions)
const multiUpload = multer({
  dest: path.join(config.paths.workDir, "uploads"),
  limits: {
    fileSize: config.api.maxUploadSizeMB * 1024 * 1024,
    files: 10, // Maximum 10 packages per submission
  },
});

/**
 * POST /api/submissions
 * Submit code for evaluation
 */
router.post("/", upload.single("submission_file"), async (req, res) => {
  try {
    const {
      problem_id,
      package_type,
      package_url,
      archive_checksum,
      git_url,
      git_branch,
      git_commit,
      team_id,
      submission_metadata,
      priority,
      notification_url,
      timeout_override,
    } = req.body;

    // Validate required fields
    if (!problem_id || !package_type) {
      return res.status(400).json({
        success: false,
        error: "validation_error",
        message: "Missing required fields",
        details: {
          required: ["problem_id", "package_type"],
        },
      });
    }

    // Validate package type specific requirements
    if (package_type === "file" && !req.file) {
      return res.status(400).json({
        success: false,
        error: "invalid_package_type",
        message: "Invalid package type configuration",
        details: {
          package_type: "file",
          error: "submission_file is required when package_type is 'file'",
          received_fields: Object.keys(req.body),
        },
      });
    }

    if (package_type === "url" && !package_url) {
      return res.status(400).json({
        success: false,
        error: "invalid_package_type",
        message: "Invalid package type configuration",
        details: {
          package_type: "url",
          error: "package_url is required when package_type is 'url'",
          received_fields: Object.keys(req.body),
        },
      });
    }

    if (package_type === "git" && !git_url) {
      return res.status(400).json({
        success: false,
        error: "invalid_package_type",
        message: "Invalid package type configuration",
        details: {
          package_type: "git",
          error: "git_url is required when package_type is 'git'",
          received_fields: Object.keys(req.body),
        },
      });
    }

    // Validate timeout_override if provided
    if (timeout_override) {
      const timeoutValue = parseInt(timeout_override, 10);
      if (isNaN(timeoutValue) || timeoutValue <= 0) {
        return res.status(400).json({
          success: false,
          error: "validation_error",
          message: "timeout_override must be a positive integer",
        });
      }

      // Check against problem's maximum timeout (will be validated later with problem config)
      const maxTimeout = config.docker.defaultTimeout / 1000; // Convert ms to seconds
      if (timeoutValue > maxTimeout) {
        return res.status(400).json({
          success: false,
          error: "validation_error",
          message: `timeout_override cannot exceed maximum timeout of ${maxTimeout} seconds`,
          details: {
            requested: timeoutValue,
            maximum: maxTimeout,
          },
        });
      }
    }

    // Check if problem exists before accepting submission
    const { getProblemInfo } = require("../../core/processor");
    const problemExists = await getProblemInfo(problem_id);

    if (!problemExists) {
      // Cleanup uploaded file if present
      if (req.file) {
        await fs.rm(req.file.path, { force: true }).catch(() => {});
      }

      return res.status(404).json({
        success: false,
        error: "problem_not_found",
        message: "Problem with the specified ID does not exist",
        details: {
          problem_id: problem_id,
          suggestion:
            "Check the problem ID or create the problem first using POST /problems",
        },
      });
    }

    // If file upload, save to submissions directory
    let submissionId = `sub_${Date.now()}${Math.random()
      .toString(36)
      .substring(2, 10)}`;

    let localPath = null;

    if (package_type === "file") {
      const submissionDir = path.join(
        config.paths.submissionsDir,
        submissionId
      );
      await fs.mkdir(submissionDir, { recursive: true });

      // Move uploaded file to submission directory
      const targetPath = path.join(submissionDir, req.file.originalname);
      await fs.rename(req.file.path, targetPath);

      // Extract if archive
      if (
        req.file.originalname.endsWith(".zip") ||
        req.file.originalname.endsWith(".tar.gz")
      ) {
        const downloader = require("../../utils/downloader");
        const fileBuffer = await fs.readFile(targetPath);
        await downloader.extractBuffer(fileBuffer, submissionDir);
        await fs.rm(targetPath); // Remove archive after extraction
      }

      // Set local path for processor
      localPath = submissionDir;
    }

    // Parse priority
    const jobPriority = priority ? parseInt(priority, 10) : Priority.NORMAL;

    // Create submission object
    const submission = {
      submissionId,
      problemId: problem_id,
      packageType: package_type,
      packageUrl: package_url,
      archiveChecksum: archive_checksum,
      gitUrl: git_url,
      gitBranch: git_branch || "main",
      gitCommit: git_commit,
      localPath: localPath, // Local path for file uploads
      teamId: team_id,
      metadata: submission_metadata ? JSON.parse(submission_metadata) : {},
      priority: jobPriority,
      notificationUrl: notification_url,
      timeoutOverride: timeout_override
        ? parseInt(timeout_override, 10)
        : undefined,
    };

    // Enqueue job
    const job = enqueue(submission);

    logger.info(`Submission ${submissionId} enqueued as job ${job.id}`);

    // Calculate estimated start time based on queue position
    const { getQueue } = require("../../core/queue");
    const queue = getQueue();
    const waitTimeSeconds = queue.estimateWaitTime(job.id) || 0;
    const estimatedStartTime = new Date(Date.now() + waitTimeSeconds * 1000);

    res.status(201).json({
      success: true,
      message: "Submission enqueued successfully",
      data: {
        job_id: job.id,
        submission_id: submissionId,
        problem_id: problem_id,
        status: job.state,
        priority: job.priority,
        enqueued_at: job.enqueuedAt,
        estimated_start_time: estimatedStartTime.toISOString(),
      },
    });
  } catch (error) {
    logger.error("Error creating submission:", error);

    // Cleanup uploaded file on error
    if (req.file) {
      await fs.rm(req.file.path, { force: true }).catch(() => {});
    }

    res.status(500).json({
      success: false,
      error: "submission_failed",
      message: error.message,
    });
  }
});

/**
 * POST /api/submissions/multi
 * Submit multiple packages for multi-container evaluation
 *
 * Body format:
 * - problem_id: string (required)
 * - team_id: string (optional)
 * - priority: number (optional, 1-10)
 * - notification_url: string (optional)
 * - timeout_override: number (optional)
 * - packages: JSON string array of package configurations
 *
 * Files should be uploaded with field names matching package IDs:
 * - <package_id>_file: file upload for each package
 *
 * Each package in JSON can specify:
 * - package_id: string (required, must match submission_packages in problem config)
 * - package_source: 'file'|'url'|'git' (required)
 * - package_url: string (required for 'url' source)
 * - git_url: string (required for 'git' source)
 * - git_branch: string (optional, default: main)
 * - git_commit: string (optional)
 * - checksum: string (optional)
 */
router.post("/multi", multiUpload.any(), async (req, res) => {
  try {
    const {
      problem_id,
      team_id,
      priority,
      notification_url,
      timeout_override,
      packages: packagesJson,
      submission_metadata,
    } = req.body;

    // Validate required fields
    if (!problem_id) {
      return res.status(400).json({
        success: false,
        error: "validation_error",
        message: "Missing required field: problem_id",
      });
    }

    if (!packagesJson) {
      return res.status(400).json({
        success: false,
        error: "validation_error",
        message: "Missing required field: packages (JSON array)",
      });
    }

    // Parse packages configuration
    let packages;
    try {
      packages = JSON.parse(packagesJson);
      if (!Array.isArray(packages)) {
        throw new Error("packages must be an array");
      }
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: "validation_error",
        message: `Invalid packages JSON: ${error.message}`,
      });
    }

    // Check if problem exists and get its configuration
    const { getProblemInfo } = require("../../core/processor");
    const problemInfo = await getProblemInfo(problem_id);

    if (!problemInfo) {
      // Cleanup uploaded files
      if (req.files) {
        for (const file of req.files) {
          await fs.rm(file.path, { force: true }).catch(() => {});
        }
      }

      return res.status(404).json({
        success: false,
        error: "problem_not_found",
        message: "Problem with the specified ID does not exist",
        details: { problem_id },
      });
    }

    // Validate that problem has containers configuration
    if (!problemInfo.containers || !Array.isArray(problemInfo.containers)) {
      // Cleanup uploaded files
      if (req.files) {
        for (const file of req.files) {
          await fs.rm(file.path, { force: true }).catch(() => {});
        }
      }

      return res.status(400).json({
        success: false,
        error: "invalid_problem_configuration",
        message: "Problem does not have valid multi-container configuration",
        details: {
          problem_id,
          hint: "Problem must define 'containers' array in config.json",
        },
      });
    }

    // Generate submission ID
    const submissionId = `sub_${Date.now()}${Math.random()
      .toString(36)
      .substring(2, 10)}`;

    // Process each package
    const processedPackages = [];

    for (const packageConfig of packages) {
      const { package_id, package_source } = packageConfig;

      if (!package_id || !package_source) {
        // Cleanup
        if (req.files) {
          for (const file of req.files) {
            await fs.rm(file.path, { force: true }).catch(() => {});
          }
        }

        return res.status(400).json({
          success: false,
          error: "validation_error",
          message: "Each package must have package_id and package_source",
          details: { invalid_package: packageConfig },
        });
      }

      // Handle file uploads
      if (package_source === "file") {
        const fileFieldName = `${package_id}_file`;
        const uploadedFile = req.files?.find(
          (f) => f.fieldname === fileFieldName
        );

        if (!uploadedFile) {
          // Cleanup
          if (req.files) {
            for (const file of req.files) {
              await fs.rm(file.path, { force: true }).catch(() => {});
            }
          }

          return res.status(400).json({
            success: false,
            error: "validation_error",
            message: `File upload required for package ${package_id}`,
            details: {
              expected_field: fileFieldName,
              received_fields: req.files?.map((f) => f.fieldname) || [],
            },
          });
        }

        // Create package directory
        const packageDir = path.join(
          config.paths.submissionsDir,
          submissionId,
          package_id
        );
        await fs.mkdir(packageDir, { recursive: true });

        // Move uploaded file
        const targetPath = path.join(packageDir, uploadedFile.originalname);
        await fs.rename(uploadedFile.path, targetPath);

        // Extract if archive
        if (
          uploadedFile.originalname.endsWith(".zip") ||
          uploadedFile.originalname.endsWith(".tar.gz")
        ) {
          const downloader = require("../../utils/downloader");
          const fileBuffer = await fs.readFile(targetPath);
          await downloader.extractBuffer(fileBuffer, packageDir);
          await fs.rm(targetPath); // Remove archive after extraction
        }

        processedPackages.push({
          package_id,
          package_source: "file",
          local_path: packageDir,
        });
      } else if (package_source === "url") {
        if (!packageConfig.package_url) {
          return res.status(400).json({
            success: false,
            error: "validation_error",
            message: `package_url required for package ${package_id}`,
          });
        }

        processedPackages.push({
          package_id,
          package_source: "url",
          package_url: packageConfig.package_url,
          checksum: packageConfig.checksum,
        });
      } else if (package_source === "git") {
        if (!packageConfig.git_url) {
          return res.status(400).json({
            success: false,
            error: "validation_error",
            message: `git_url required for package ${package_id}`,
          });
        }

        processedPackages.push({
          package_id,
          package_source: "git",
          git_url: packageConfig.git_url,
          git_branch: packageConfig.git_branch || "main",
          git_commit: packageConfig.git_commit,
        });
      } else {
        return res.status(400).json({
          success: false,
          error: "validation_error",
          message: `Invalid package_source for package ${package_id}: ${package_source}`,
        });
      }
    }

    // Parse priority
    const jobPriority = priority ? parseInt(priority, 10) : Priority.NORMAL;

    // Create submission object
    const submission = {
      submissionId,
      problemId: problem_id,
      teamId: team_id,
      packages: processedPackages,
      metadata: submission_metadata ? JSON.parse(submission_metadata) : {},
      priority: jobPriority,
      notificationUrl: notification_url,
      timeoutOverride: timeout_override
        ? parseInt(timeout_override, 10)
        : undefined,
    };

    // Enqueue job
    const job = enqueue(submission);

    logger.info(
      `Multi-package submission ${submissionId} enqueued as job ${job.id} with ${processedPackages.length} packages`
    );

    // Calculate estimated start time
    const { getQueue } = require("../../core/queue");
    const queue = getQueue();
    const waitTimeSeconds = queue.estimateWaitTime(job.id) || 0;
    const estimatedStartTime = new Date(Date.now() + waitTimeSeconds * 1000);

    res.status(201).json({
      success: true,
      message: "Multi-package submission enqueued successfully",
      data: {
        job_id: job.id,
        submission_id: submissionId,
        problem_id: problem_id,
        packages: processedPackages.map((p) => ({
          package_id: p.package_id,
          source: p.package_source,
        })),
        status: job.state,
        priority: job.priority,
        enqueued_at: job.enqueuedAt,
        estimated_start_time: estimatedStartTime.toISOString(),
      },
    });
  } catch (error) {
    logger.error("Error creating multi-package submission:", error);

    // Cleanup uploaded files on error
    if (req.files) {
      for (const file of req.files) {
        await fs.rm(file.path, { force: true }).catch(() => {});
      }
    }

    res.status(500).json({
      success: false,
      error: "submission_failed",
      message: error.message,
    });
  }
});

/**
 * GET /api/submissions/:submission_id
 * Get submission status and details
 */
router.get("/:submission_id", async (req, res) => {
  try {
    const { submission_id } = req.params;

    // Find job by submission ID
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

    // Get evaluation status if running
    const processor = getProcessor();
    const evalStatus = processor.getEvaluationStatus(job.id);

    res.json({
      success: true,
      data: {
        submission_id: job.submissionId,
        job_id: job.id,
        problem_id: job.problemId,
        status: job.state,
        priority: job.priority,
        enqueued_at: job.enqueuedAt,
        started_at: job.startedAt,
        completed_at: job.completedAt,
        evaluation_state: evalStatus?.state,
        result: job.result,
        error: job.error,
      },
    });
  } catch (error) {
    logger.error("Error getting submission:", error);

    res.status(500).json({
      success: false,
      error: "get_failed",
      message: error.message,
    });
  }
});

/**
 * DELETE /api/submissions/:submission_id
 * Cancel a submission
 */
router.delete("/:submission_id", async (req, res) => {
  try {
    const { submission_id } = req.params;

    // Find job by submission ID
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

    // Cancel job
    const cancelledJob = cancelJob(job.id);

    res.json({
      success: true,
      message: `Submission ${submission_id} cancelled`,
      data: {
        submission_id: cancelledJob.submissionId,
        job_id: cancelledJob.id,
        status: cancelledJob.state,
      },
    });
  } catch (error) {
    logger.error("Error cancelling submission:", error);

    res.status(500).json({
      success: false,
      error: "cancel_failed",
      message: error.message,
    });
  }
});

module.exports = router;
