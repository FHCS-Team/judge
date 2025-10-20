/**
 * Dynamic Mount Manager
 * Generates Docker mount configurations for problem packages
 */

const path = require("path");
const fs = require("fs/promises");
const logger = require("../../utils/logger");

/**
 * Generate mount configurations for a container
 * @param {Object} options - Mount options
 * @param {string} options.problemPath - Absolute path to problem package
 * @param {string} options.containerId - Container identifier
 * @param {string} [options.submissionPath] - Absolute path to submission files
 * @param {string} [options.outputPath] - Absolute path for output files
 * @param {string} [options.sharedPath] - Absolute path for shared data between containers
 * @param {boolean} [options.acceptsSubmission] - Whether this container receives submission
 * @returns {Promise<Array>} Array of Docker mount configurations
 */
async function generateMounts(options) {
  const {
    problemPath,
    containerId,
    submissionPath,
    outputPath,
    sharedPath,
    acceptsSubmission = false,
  } = options;

  const mounts = [];
  const containerPath = path.join(problemPath, containerId);

  // 1. Hooks directory (read-only)
  const hooksPath = path.join(containerPath, "hooks");
  if (await directoryExists(hooksPath)) {
    mounts.push({
      Type: "bind",
      Source: hooksPath,
      Target: "/workspace/hooks",
      ReadOnly: true,
    });
    logger.debug(`Mount added: ${hooksPath} -> /workspace/hooks (RO)`);
  } else {
    logger.warn(`Hooks directory not found: ${hooksPath}`);
  }

  // 2. Data directory (read-only)
  const dataPath = path.join(containerPath, "data");
  if (await directoryExists(dataPath)) {
    mounts.push({
      Type: "bind",
      Source: dataPath,
      Target: "/workspace/data",
      ReadOnly: true,
    });
    logger.debug(`Mount added: ${dataPath} -> /workspace/data (RO)`);
  } else {
    logger.debug(`Data directory not found (optional): ${dataPath}`);
  }

  // 3. Submission files (read-only, only if accepts_submission is true)
  if (acceptsSubmission && submissionPath) {
    if (await directoryExists(submissionPath)) {
      mounts.push({
        Type: "bind",
        Source: submissionPath,
        Target: "/submission",
        ReadOnly: true,
      });
      logger.debug(`Mount added: ${submissionPath} -> /submission (RO)`);
    } else {
      throw new Error(`Submission directory not found: ${submissionPath}`);
    }
  }

  // 4. Output directory (read-write)
  if (outputPath) {
    // Ensure output directory exists
    await fs.mkdir(outputPath, { recursive: true });
    mounts.push({
      Type: "bind",
      Source: outputPath,
      Target: "/out",
      ReadOnly: false,
    });
    logger.debug(`Mount added: ${outputPath} -> /out (RW)`);
  }

  // 5. Shared directory (read-write, for inter-container communication)
  if (sharedPath) {
    // Ensure shared directory exists
    await fs.mkdir(sharedPath, { recursive: true });
    mounts.push({
      Type: "bind",
      Source: sharedPath,
      Target: "/shared",
      ReadOnly: false,
    });
    logger.debug(`Mount added: ${sharedPath} -> /shared (RW)`);
  }

  return mounts;
}

/**
 * Check if a directory exists
 * @param {string} dirPath - Path to check
 * @returns {Promise<boolean>} True if directory exists
 */
async function directoryExists(dirPath) {
  try {
    const stats = await fs.stat(dirPath);
    return stats.isDirectory();
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

/**
 * Validate that all required mount sources exist
 * @param {Array} mounts - Array of mount configurations
 * @returns {Promise<Object>} Validation result
 */
async function validateMounts(mounts) {
  const results = {
    valid: true,
    errors: [],
    warnings: [],
  };

  for (const mount of mounts) {
    if (mount.Type === "bind") {
      const exists = await directoryExists(mount.Source);
      if (!exists) {
        results.valid = false;
        results.errors.push(`Mount source not found: ${mount.Source}`);
      }
    }
  }

  return results;
}

/**
 * Create evaluation workspace directories
 * @param {string} resultPath - Base path for result
 * @returns {Promise<Object>} Created paths
 */
async function createEvaluationWorkspace(resultPath) {
  const outputPath = path.join(resultPath, "output");
  const sharedPath = path.join(resultPath, "shared");
  const logsPath = path.join(resultPath, "logs");

  await fs.mkdir(outputPath, { recursive: true });
  await fs.mkdir(sharedPath, { recursive: true });
  await fs.mkdir(logsPath, { recursive: true });

  logger.info(`Created evaluation workspace at: ${resultPath}`);

  return {
    outputPath,
    sharedPath,
    logsPath,
  };
}

/**
 * Get list of hook files in a directory
 * @param {string} hooksPath - Path to hooks directory
 * @param {string} hookType - Hook type (pre, post, periodic)
 * @returns {Promise<Array>} List of hook file paths
 */
async function listHooks(hooksPath, hookType) {
  const hookDir = path.join(hooksPath, hookType);

  try {
    const files = await fs.readdir(hookDir);
    const shellFiles = files
      .filter((f) => f.endsWith(".sh"))
      .sort()
      .map((f) => path.join(hookDir, f));

    return shellFiles;
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

module.exports = {
  generateMounts,
  validateMounts,
  createEvaluationWorkspace,
  listHooks,
  directoryExists,
};
