/**
 * Resource Mounting Utility
 * Manages mounting of problem resources and submission code to containers
 * according to the documented structure in docs/data-models/containers/resources.md
 */

const fs = require("fs/promises");
const path = require("path");
const logger = require("../utils/logger");
const config = require("../config");

/**
 * Mount point definitions as per documentation
 */
const MountPoints = {
  TOOLS: "/tools", // Universal tools (read-only)
  HOOKS: "/hooks", // Problem hooks (read-only)
  DATA: "/data", // Problem data (read-only)
  SUBMISSION: "/submission", // Original submission (read-only)
  WORKSPACE: "/workspace", // Working directory (read-write)
  OUT: "/out", // Output directory (read-write)
  TMP: "/tmp", // Temporary files (read-write)
};

/**
 * Prepare volume mounts for a container based on its role and configuration
 *
 * @param {Object} options - Mount configuration options
 * @param {string} options.submissionId - Submission identifier
 * @param {string} options.problemId - Problem identifier
 * @param {string} options.containerId - Container identifier
 * @param {Object} options.containerConfig - Container configuration
 * @param {string} options.submissionPath - Path to submission code (if accepts_submission)
 * @param {string} options.resultsDir - Results directory path
 * @returns {Promise<Object>} Mount configuration with binds and volumes
 */
async function prepareMounts(options) {
  const {
    submissionId,
    problemId,
    containerId,
    containerConfig,
    submissionPath,
    resultsDir,
  } = options;

  const binds = [];
  const volumes = {};

  // Base directories
  const problemDir = path.join(config.paths.problemsDir, problemId);
  const containerProblemDir = path.join(problemDir, containerId);

  logger.info(`Preparing mounts for container ${containerId}`);

  try {
    // 1. Mount /tools directory (universal tools - read-only)
    await mountTools(binds, volumes, containerProblemDir);

    // 2. Mount /hooks directory (problem hooks - read-only)
    await mountHooks(binds, volumes, containerProblemDir, problemDir);

    // 3. Mount /data directory (problem data - read-only)
    await mountData(binds, volumes, containerProblemDir, problemDir);

    // 4. Mount /out directory (output - read-write)
    await mountOutput(binds, volumes, resultsDir, containerId);

    // 5. Mount /tmp directory (temporary - read-write)
    // Use Docker volume for tmp (no host binding needed)
    volumes[MountPoints.TMP] = {};

    // 6. Mount submission and workspace if this container accepts submission
    if (containerConfig.accepts_submission && submissionPath) {
      await mountSubmission(binds, volumes, submissionPath);
    }

    // 7. Add custom volumes from container config
    if (containerConfig.volumes) {
      containerConfig.volumes.forEach((vol) => {
        binds.push(vol);
      });
    }

    logger.info(
      `Prepared ${binds.length} bind mounts and ${
        Object.keys(volumes).length
      } volumes for ${containerId}`
    );

    return { binds, volumes };
  } catch (error) {
    logger.error(`Failed to prepare mounts for ${containerId}:`, error);
    throw error;
  }
}

/**
 * Mount universal tools directory
 */
async function mountTools(binds, volumes, containerProblemDir) {
  // Check for container-specific tools
  const containerToolsDir = path.join(containerProblemDir, "tools");

  try {
    await fs.access(containerToolsDir);
    binds.push(`${containerToolsDir}:${MountPoints.TOOLS}:ro`);
    logger.debug(`Mounting container-specific tools from ${containerToolsDir}`);
    return;
  } catch (error) {
    // No container-specific tools, that's okay
    logger.debug(`No container-specific tools directory found`);
  }

  // Note: Universal judgehost tools are typically baked into the image
  // during build, not mounted. This is for problem-specific tools only.
}

/**
 * Mount hooks directory
 * Supports both container-specific hooks and shared hooks
 */
async function mountHooks(binds, volumes, containerProblemDir, problemDir) {
  // First, try container-specific hooks directory
  const containerHooksDir = path.join(containerProblemDir, "hooks");

  try {
    await fs.access(containerHooksDir);
    binds.push(`${containerHooksDir}:${MountPoints.HOOKS}:ro`);
    logger.debug(`Mounting container-specific hooks from ${containerHooksDir}`);
    return;
  } catch (error) {
    // Fall back to shared hooks directory
    const sharedHooksDir = path.join(problemDir, "hooks");

    try {
      await fs.access(sharedHooksDir);
      binds.push(`${sharedHooksDir}:${MountPoints.HOOKS}:ro`);
      logger.debug(`Mounting shared hooks from ${sharedHooksDir}`);
      return;
    } catch (error) {
      logger.debug(`No hooks directory found for container`);
    }
  }
}

/**
 * Mount data directory
 * Supports both container-specific data and shared data
 */
async function mountData(binds, volumes, containerProblemDir, problemDir) {
  // Container-specific data has priority
  const containerDataDir = path.join(containerProblemDir, "data");

  try {
    await fs.access(containerDataDir);
    binds.push(`${containerDataDir}:${MountPoints.DATA}:ro`);
    logger.debug(`Mounting container-specific data from ${containerDataDir}`);

    // Also mount shared data to /data/shared if it exists
    const sharedDataDir = path.join(problemDir, "data");
    try {
      await fs.access(sharedDataDir);
      binds.push(`${sharedDataDir}:/data/shared:ro`);
      logger.debug(`Mounting shared data from ${sharedDataDir}`);
    } catch (error) {
      // No shared data, that's okay
    }

    return;
  } catch (error) {
    // No container-specific data, try shared data only
    const sharedDataDir = path.join(problemDir, "data");

    try {
      await fs.access(sharedDataDir);
      binds.push(`${sharedDataDir}:${MountPoints.DATA}:ro`);
      logger.debug(`Mounting shared data from ${sharedDataDir}`);
    } catch (error) {
      logger.debug(`No data directory found for container`);
    }
  }
}

/**
 * Mount output directory for collecting results
 * Creates container-specific output directory
 */
async function mountOutput(binds, volumes, resultsDir, containerId) {
  const containerOutDir = path.join(
    resultsDir,
    "containers",
    containerId,
    "out"
  );

  // Create output directory if it doesn't exist
  await fs.mkdir(containerOutDir, { recursive: true });

  binds.push(`${containerOutDir}:${MountPoints.OUT}:rw`);
  logger.debug(`Mounting output directory: ${containerOutDir}`);
}

/**
 * Mount submission code
 * Creates both read-only /submission and read-write /workspace
 */
async function mountSubmission(binds, volumes, submissionPath) {
  // Mount original submission as read-only
  binds.push(`${submissionPath}:${MountPoints.SUBMISSION}:ro`);
  logger.debug(`Mounting submission (read-only): ${submissionPath}`);

  // Create workspace as a copy (will be done via Docker copy mechanism)
  // We'll use a volume for workspace that gets populated during container creation
  volumes[MountPoints.WORKSPACE] = {};
  logger.debug(`Creating workspace volume for writable copy`);
}

/**
 * Ensure all required directories exist in the results directory
 *
 * @param {string} resultsDir - Results directory path
 * @param {Array<string>} containerIds - Array of container IDs
 * @returns {Promise<void>}
 */
async function ensureResultsDirectories(resultsDir, containerIds) {
  logger.info(
    `Ensuring results directory structure for ${containerIds.length} containers`
  );

  // Create base directories
  await fs.mkdir(path.join(resultsDir, "logs"), { recursive: true });
  await fs.mkdir(path.join(resultsDir, "artifacts"), { recursive: true });
  await fs.mkdir(path.join(resultsDir, "containers"), { recursive: true });

  // Create per-container directories
  for (const containerId of containerIds) {
    const containerDir = path.join(resultsDir, "containers", containerId);
    await fs.mkdir(path.join(containerDir, "out"), { recursive: true });
    await fs.mkdir(path.join(containerDir, "logs"), { recursive: true });
  }

  logger.debug(`Results directory structure created at ${resultsDir}`);
}

/**
 * Validate that required problem resources exist
 *
 * @param {string} problemId - Problem identifier
 * @param {Array<Object>} containers - Container configurations
 * @returns {Promise<Object>} Validation result
 */
async function validateProblemResources(problemId, containers) {
  const problemDir = path.join(config.paths.problemsDir, problemId);
  const issues = [];
  const warnings = [];

  logger.info(`Validating problem resources for ${problemId}`);

  // Check if problem directory exists
  try {
    await fs.access(problemDir);
  } catch (error) {
    issues.push(`Problem directory not found: ${problemDir}`);
    return { valid: false, issues, warnings };
  }

  // Validate each container's resources
  for (const container of containers) {
    const containerId = container.container_id;
    const containerDir = path.join(problemDir, containerId);

    // Check if container directory exists
    try {
      await fs.access(containerDir);
    } catch (error) {
      warnings.push(
        `Container directory not found: ${containerDir} (using shared resources only)`
      );
      continue;
    }

    // Check for Dockerfile (required)
    const dockerfilePath = path.join(
      containerDir,
      container.dockerfile_path || "Dockerfile"
    );
    try {
      await fs.access(dockerfilePath);
    } catch (error) {
      issues.push(
        `Dockerfile not found for container ${containerId}: ${dockerfilePath}`
      );
    }

    // Check for hooks (optional but recommended)
    const hooksDir = path.join(containerDir, "hooks");
    try {
      await fs.access(hooksDir);
      const hookTypes = await fs.readdir(hooksDir);
      logger.debug(
        `Container ${containerId} has hook types: ${hookTypes.join(", ")}`
      );
    } catch (error) {
      warnings.push(`No hooks directory for container ${containerId}`);
    }

    // Check for data (optional)
    const dataDir = path.join(containerDir, "data");
    try {
      await fs.access(dataDir);
      logger.debug(`Container ${containerId} has data directory`);
    } catch (error) {
      // Data is optional, no warning needed
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    warnings,
  };
}

/**
 * Get mount statistics for logging/debugging
 *
 * @param {Object} mounts - Mount configuration
 * @returns {Object} Statistics
 */
function getMountStatistics(mounts) {
  const { binds, volumes } = mounts;

  return {
    totalBinds: binds.length,
    totalVolumes: Object.keys(volumes).length,
    readOnlyBinds: binds.filter((b) => b.endsWith(":ro")).length,
    readWriteBinds: binds.filter((b) => b.endsWith(":rw")).length,
    bindsByType: {
      tools: binds.filter((b) => b.includes(":" + MountPoints.TOOLS)).length,
      hooks: binds.filter((b) => b.includes(":" + MountPoints.HOOKS)).length,
      data: binds.filter((b) => b.includes(":" + MountPoints.DATA)).length,
      submission: binds.filter((b) => b.includes(":" + MountPoints.SUBMISSION))
        .length,
      out: binds.filter((b) => b.includes(":" + MountPoints.OUT)).length,
    },
  };
}

module.exports = {
  MountPoints,
  prepareMounts,
  ensureResultsDirectories,
  validateProblemResources,
  getMountStatistics,
};
