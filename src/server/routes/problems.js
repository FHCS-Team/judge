/**
 * API Routes for Problem Management
 * Handles problem package registration, retrieval, and deletion
 */

const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs/promises");
const logger = require("../../utils/logger");
const config = require("../../config");
const {
  processProblemPackage,
  getProblemInfo,
  listProblems,
  deleteProblem,
} = require("../../core/processor");

const router = express.Router();

// Configure multer for file uploads with original filename preservation
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadsDir = path.join(config.paths.workDir, "uploads");
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Preserve the original file extension, including compound extensions like .tar.gz
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const originalName = file.originalname;

    // Handle compound extensions (.tar.gz, .tar.bz2, etc.)
    let ext = "";
    if (originalName.match(/\.tar\.(gz|bz2|xz)$/i)) {
      // Extract compound extension
      const match = originalName.match(/(\.[^.]+\.[^.]+)$/);
      ext = match ? match[1] : path.extname(originalName);
    } else {
      ext = path.extname(originalName);
    }

    cb(null, `${timestamp}-${randomString}${ext}`);
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: config.api.maxUploadSizeMB * 1024 * 1024, // Convert MB to bytes
  },
});

/**
 * POST /api/problems
 * Register a new problem package
 */
router.post("/", upload.single("problem_package"), async (req, res) => {
  let problem_id, problem_name, package_type, packagePath;
  let package_url,
    archive_checksum,
    git_url,
    git_branch,
    git_commit,
    project_type,
    force_rebuild,
    timeout;

  try {
    ({
      problem_id,
      problem_name,
      package_type,
      package_url,
      archive_checksum,
      git_url,
      git_branch,
      git_commit,
      project_type,
      force_rebuild,
      timeout,
    } = req.body);

    // Validate required fields
    if (!problem_id || !problem_name || !package_type) {
      return res.status(400).json({
        success: false,
        error: "validation_error",
        message: "Missing required fields",
        details: {
          required: ["problem_id", "problem_name", "package_type"],
        },
      });
    }

    // Handle different package types
    switch (package_type) {
      case "file":
        if (!req.file) {
          return res.status(400).json({
            success: false,
            error: "validation_error",
            message: "problem_package file is required when package_type=file",
          });
        }
        packagePath = req.file.path;
        break;

      case "url":
        if (!package_url) {
          return res.status(400).json({
            success: false,
            error: "validation_error",
            message: "package_url is required when package_type=url",
          });
        }
        // Download from URL
        const downloader = require("../../utils/downloader");
        const tempPath = path.join(
          config.paths.workDir,
          `problem-${problem_id}-${Date.now()}.tar.gz`
        );

        if (archive_checksum) {
          await downloader.downloadToFile(
            package_url,
            tempPath,
            archive_checksum
          );
        } else {
          await downloader.downloadToFile(package_url, tempPath);
        }
        packagePath = tempPath;
        break;

      case "git":
        if (!git_url) {
          return res.status(400).json({
            success: false,
            error: "validation_error",
            message: "git_url is required when package_type=git",
          });
        }
        // Clone Git repository
        const simpleGit = require("simple-git");
        const git = simpleGit();
        const gitTempDir = path.join(
          config.paths.workDir,
          `problem-${problem_id}-${Date.now()}`
        );

        const cloneOptions = [];
        if (config.git.shallowClone) cloneOptions.push("--depth=1");
        if (git_branch) cloneOptions.push("--branch", git_branch);

        await git.clone(git_url, gitTempDir, cloneOptions);

        if (git_commit) {
          const repoGit = simpleGit(gitTempDir);
          await repoGit.checkout(git_commit);
        }

        packagePath = gitTempDir;
        break;

      default:
        return res.status(400).json({
          success: false,
          error: "invalid_package_type",
          message: `Invalid package_type: ${package_type}`,
          details: {
            valid_types: ["file", "url", "git"],
          },
        });
    }

    // Check if problem already exists
    const existingProblem = await getProblemInfo(problem_id);
    if (existingProblem && !force_rebuild) {
      return res.status(409).json({
        success: false,
        error: "problem_exists",
        message: `Problem ${problem_id} already exists`,
        details: {
          problem_id,
          use_force_rebuild: true,
        },
      });
    }

    // Process problem package
    logger.info(`Registering problem: ${problem_id}`, {
      problem_id,
      problem_name,
      package_type,
      package_path: packagePath,
      project_type,
      force_rebuild,
    });

    const result = await processProblemPackage(problem_id, packagePath, {
      projectType: project_type,
      forceRebuild: force_rebuild === "true",
      buildTimeout: timeout ? parseInt(timeout, 10) : undefined,
    });

    // Cleanup temporary files
    await fs.rm(packagePath, { recursive: true, force: true }).catch(() => {});

    logger.info(`Problem ${problem_id} registered successfully`, {
      problem_id: result.problemId,
      image_name: result.imageName,
    });

    res.status(201).json({
      success: true,
      message: `Problem ${problem_id} registered successfully`,
      data: {
        problem_id: result.problemId,
        problem_name,
        image_name: result.imageName,
        registered_at: result.registeredAt,
      },
    });
  } catch (error) {
    logger.error(`Error registering problem ${problem_id}:`, {
      problem_id,
      problem_name,
      package_type,
      error: error.message,
      stack: error.stack,
      packagePath,
    });

    // Determine appropriate error status code
    let statusCode = 500;
    let errorType = "registration_failed";

    if (error.message.includes("must contain config.json")) {
      statusCode = 400;
      errorType = "invalid_package_structure";
    } else if (error.message.includes("must contain Dockerfile")) {
      statusCode = 400;
      errorType = "invalid_package_structure";
    } else if (error.message.includes("Problem ID in config.json")) {
      statusCode = 400;
      errorType = "config_mismatch";
    } else if (error.message.includes("Failed to extract")) {
      statusCode = 400;
      errorType = "extraction_failed";
    } else if (error.message.includes("Docker build")) {
      statusCode = 500;
      errorType = "build_failed";
    }

    res.status(statusCode).json({
      success: false,
      error: errorType,
      message: error.message,
      details: {
        problem_id,
        package_type,
      },
    });
  }
});

/**
 * GET /api/problems
 * List all registered problems
 */
router.get("/", async (req, res) => {
  try {
    const problems = await listProblems();

    res.json({
      success: true,
      data: {
        problems: problems.map((p) => ({
          problem_id: p.problemId,
          problem_name: p.problemName || p.problemId,
          project_type: p.projectType,
          rubrics: p.rubrics || [],
        })),
        total: problems.length,
      },
    });
  } catch (error) {
    logger.error("Error listing problems:", error);

    res.status(500).json({
      success: false,
      error: "list_failed",
      message: error.message,
    });
  }
});

/**
 * GET /api/problems/:problem_id
 * Get problem information
 */
router.get("/:problem_id", async (req, res) => {
  try {
    const { problem_id } = req.params;

    const problem = await getProblemInfo(problem_id);

    if (!problem) {
      return res.status(404).json({
        success: false,
        error: "problem_not_found",
        message: `Problem ${problem_id} not found`,
      });
    }

    res.json({
      success: true,
      data: problem,
    });
  } catch (error) {
    logger.error("Error getting problem:", error);

    res.status(500).json({
      success: false,
      error: "get_failed",
      message: error.message,
    });
  }
});

/**
 * DELETE /api/problems/:problem_id
 * Delete a problem
 */
router.delete("/:problem_id", async (req, res) => {
  try {
    const { problem_id } = req.params;

    const problem = await getProblemInfo(problem_id);

    if (!problem) {
      return res.status(404).json({
        success: false,
        error: "problem_not_found",
        message: `Problem ${problem_id} not found`,
      });
    }

    const deleted = await deleteProblem(problem_id);

    if (!deleted) {
      throw new Error("Failed to delete problem");
    }

    res.json({
      success: true,
      message: `Problem ${problem_id} deleted successfully`,
    });
  } catch (error) {
    logger.error("Error deleting problem:", error);

    res.status(500).json({
      success: false,
      error: "delete_failed",
      message: error.message,
    });
  }
});

module.exports = router;
