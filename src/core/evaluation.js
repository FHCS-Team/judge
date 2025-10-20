/**
 * Evaluation Module
 * Orchestrates the complete evaluation workflow for submissions
 */

const path = require("path");
const fs = require("fs/promises");
const logger = require("../utils/logger");
const config = require("../config");
const dockerClient = require("./docker/client");
const { buildImage } = require("./docker/image");
const { createNetwork, removeNetworkByName } = require("./docker/network");
const {
  generateMounts,
  createEvaluationWorkspace,
  listHooks,
} = require("./docker/mounts");
const {
  executePreHooks,
  executePostHooks,
  waitForHealthy,
} = require("./docker/hooks");
const { loadStageConfig } = require("./docker/stage");

/**
 * Image cache to avoid rebuilding
 * Key: `${problemId}:${containerId}:${stage}`
 * Value: image ID
 */
const imageCache = new Map();

/**
 * Run a complete submission evaluation
 * @param {Object} options - Evaluation options
 * @param {string} options.problemId - Problem identifier
 * @param {string} options.submissionId - Submission identifier
 * @param {string} options.resultId - Result identifier
 * @param {string} options.problemPath - Path to problem package
 * @param {string} options.submissionPath - Path to submission files
 * @param {string} options.resultPath - Path for results
 * @returns {Promise<Object>} Evaluation result
 */
async function runEvaluation(options) {
  const {
    problemId,
    submissionId,
    resultId,
    problemPath,
    submissionPath,
    resultPath,
  } = options;

  logger.info(`Starting evaluation for submission: ${submissionId}`, {
    problemId,
    resultId,
  });

  // Load problem configuration
  const problemConfig = await loadProblemConfig(problemPath);
  logger.info(`Loaded problem config: ${problemConfig.problem_id}`);

  // Create evaluation workspace
  const workspace = await createEvaluationWorkspace(resultPath);
  logger.info(`Created evaluation workspace at: ${resultPath}`);

  const networkName = `eval-${resultId}`;
  const containers = new Map(); // container_id -> container instance
  const evaluationResult = {
    submission_id: submissionId,
    problem_id: problemId,
    result_id: resultId,
    status: "pending",
    rubrics: [],
    containers: [],
    error: null,
    start_time: new Date().toISOString(),
    end_time: null,
  };

  try {
    // Step 1: Build images (Stage 1 - cached)
    logger.info("Step 1: Building container images");
    await buildContainerImages(
      problemId,
      problemPath,
      problemConfig.containers
    );

    // Step 2: Create network
    logger.info(`Step 2: Creating network: ${networkName}`);
    await createNetwork(networkName, { internal: false });

    // Step 3: Start containers in dependency order
    logger.info("Step 3: Starting containers");
    await startContainersInOrder(
      problemId,
      problemPath,
      submissionPath,
      workspace,
      problemConfig.containers,
      networkName,
      containers
    );

    // Step 4: Execute post-hooks for evaluation
    logger.info("Step 4: Executing evaluation hooks");
    await executeEvaluationHooks(
      problemPath,
      problemConfig.containers,
      containers
    );

    // Step 5: Collect rubric results
    logger.info("Step 5: Collecting rubric results");
    const rubrics = await collectRubrics(
      workspace.outputPath,
      problemConfig.rubrics
    );
    evaluationResult.rubrics = rubrics;

    evaluationResult.status = "completed";
    logger.info(`Evaluation completed successfully: ${submissionId}`);
  } catch (error) {
    logger.error(`Evaluation failed: ${submissionId}`, {
      error: error.message,
      stack: error.stack,
    });

    evaluationResult.status = "failed";
    evaluationResult.error = {
      message: error.message,
      stack: error.stack,
    };
  } finally {
    // Cleanup
    logger.info("Cleaning up evaluation environment");

    // Stop and remove containers
    for (const [containerId, containerInfo] of containers.entries()) {
      try {
        const container = dockerClient.getContainer(containerInfo.name);
        await container.stop({ t: 10 });
        await container.remove();
        logger.info(`Removed container: ${containerInfo.name}`);
      } catch (error) {
        logger.warn(`Error removing container ${containerId}:`, error.message);
      }
    }

    // Remove network
    try {
      await removeNetworkByName(networkName);
      logger.info(`Removed network: ${networkName}`);
    } catch (error) {
      logger.warn(`Error removing network ${networkName}:`, error.message);
    }

    evaluationResult.end_time = new Date().toISOString();
  }

  return evaluationResult;
}

/**
 * Load problem configuration from config.json
 * @param {string} problemPath - Path to problem package
 * @returns {Promise<Object>} Problem configuration
 */
async function loadProblemConfig(problemPath) {
  const configPath = path.join(problemPath, "config.json");

  try {
    const content = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(content);

    // Validate required fields
    if (!config.problem_id) {
      throw new Error("Missing required field: problem_id");
    }
    if (!config.containers || !Array.isArray(config.containers)) {
      throw new Error("Missing or invalid field: containers");
    }
    if (!config.rubrics || !Array.isArray(config.rubrics)) {
      throw new Error("Missing or invalid field: rubrics");
    }

    return config;
  } catch (error) {
    logger.error(`Error loading problem config: ${configPath}`, error);
    throw new Error(`Failed to load problem configuration: ${error.message}`);
  }
}

/**
 * Build container images (Stage 1) with caching
 * @param {string} problemId - Problem identifier
 * @param {string} problemPath - Path to problem package
 * @param {Array} containers - Container configurations
 * @returns {Promise<void>}
 */
async function buildContainerImages(problemId, problemPath, containers) {
  for (const containerConfig of containers) {
    const { container_id, dockerfile_path } = containerConfig;
    const cacheKey = `${problemId}:${container_id}:stage1`;

    // Check cache
    if (imageCache.has(cacheKey)) {
      logger.info(`Using cached image for: ${cacheKey}`);
      continue;
    }

    // Build image
    const dockerfilePath = path.join(problemPath, dockerfile_path);
    const contextPath = path.dirname(dockerfilePath);
    const imageName = `judgehost-${problemId}-${container_id}`;

    logger.info(`Building image: ${imageName} from ${dockerfilePath}`);

    const imageId = await buildImage(contextPath, imageName);
    imageCache.set(cacheKey, imageId);

    logger.info(`Built image: ${imageName} (${imageId.substring(0, 12)})`);
  }
}

/**
 * Start containers in dependency order
 * @param {string} problemId - Problem identifier
 * @param {string} problemPath - Path to problem package
 * @param {string} submissionPath - Path to submission files
 * @param {Object} workspace - Workspace paths
 * @param {Array} containerConfigs - Container configurations
 * @param {string} networkName - Network name
 * @param {Map} containersMap - Map to store container instances
 * @returns {Promise<void>}
 */
async function startContainersInOrder(
  problemId,
  problemPath,
  submissionPath,
  workspace,
  containerConfigs,
  networkName,
  containersMap
) {
  // Build dependency graph
  const dependencyGraph = new Map();
  for (const containerConfig of containerConfigs) {
    dependencyGraph.set(containerConfig.container_id, {
      config: containerConfig,
      dependsOn: containerConfig.depends_on || [],
    });
  }

  // Start containers in order (simple topological sort)
  const started = new Set();

  async function startContainer(containerConfig) {
    const { container_id } = containerConfig;

    if (started.has(container_id)) {
      return;
    }

    // Start dependencies first
    for (const dep of containerConfig.depends_on || []) {
      const depConfig = containerConfigs.find(
        (c) => c.container_id === dep.container_id
      );
      if (depConfig) {
        await startContainer(depConfig);
      }
    }

    // Start this container
    logger.info(`Starting container: ${container_id}`);

    const containerName = `eval-${problemId}-${container_id}-${Date.now()}`;
    const imageName = `judgehost-${problemId}-${container_id}`;

    // Generate mounts
    const mounts = await generateMounts({
      problemPath,
      containerId: container_id,
      submissionPath: containerConfig.accepts_submission
        ? submissionPath
        : null,
      outputPath: workspace.outputPath,
      sharedPath: workspace.sharedPath,
      acceptsSubmission: containerConfig.accepts_submission,
    });

    // Load stage2 config for runtime settings
    const stageConfig = await loadStageConfig(problemPath, container_id, 2);

    // Build container config
    const createConfig = {
      name: containerName,
      Image: imageName,
      HostConfig: {
        Mounts: mounts,
        NetworkMode: networkName,
        Memory: parseMemoryLimit(stageConfig.resource_limits?.memory || "1g"),
        NanoCpus:
          parseCpuLimit(stageConfig.resource_limits?.cpu || "1.0") * 1e9,
      },
      NetworkingConfig: {
        EndpointsConfig: {
          [networkName]: {
            Aliases: [container_id], // Use container_id as hostname
          },
        },
      },
      Env: Object.entries(stageConfig.environment || {}).map(
        ([k, v]) => `${k}=${v}`
      ),
    };

    // Add healthcheck if defined
    if (stageConfig.health_check) {
      const hc = stageConfig.health_check;
      createConfig.Healthcheck = {
        Test: ["CMD-SHELL", hc.command],
        Interval: (hc.interval || 30) * 1e9, // Convert to nanoseconds
        Timeout: (hc.timeout || 30) * 1e9,
        Retries: hc.retries || 3,
        StartPeriod: (hc.start_period || 0) * 1e9,
      };
    } else {
      // If no health check, keep container alive with sleep infinity
      // This is needed for containers that don't have a long-running service
      createConfig.Cmd = ["sleep", "infinity"];
    }

    // Create container
    const container = await dockerClient.createContainer(createConfig);

    await container.start();
    logger.info(`Container started: ${containerName}`);

    containersMap.set(container_id, {
      name: containerName,
      id: container.id,
      config: containerConfig,
    });

    // Wait for container's own health check if defined
    if (stageConfig.health_check) {
      logger.info(`Waiting for container health check: ${container_id}`);
      const healthy = await waitForHealthy(containerName, {
        timeout:
          stageConfig.health_check.start_period +
            stageConfig.health_check.retries *
              stageConfig.health_check.interval || 60,
        interval: stageConfig.health_check.interval || 2,
      });

      if (!healthy) {
        throw new Error(`Container failed health check: ${container_id}`);
      }
    }

    // Execute pre-hooks (after container is healthy)
    const hooksPath = path.join(problemPath, container_id, "hooks");
    const preHooks = await listHooks(hooksPath, "pre");

    if (preHooks.length > 0) {
      logger.info(
        `Executing ${preHooks.length} pre-hooks for: ${container_id}`
      );
      const hookPaths = preHooks.map(
        (h) => `/workspace/hooks/pre/${path.basename(h)}`
      );
      await executePreHooks(containerName, hookPaths, {
        timeout: stageConfig.resource_limits?.timeout || 300,
      });
    }

    // Wait for dependencies to be healthy
    for (const dep of containerConfig.depends_on || []) {
      const depContainer = containersMap.get(dep.container_id);
      if (depContainer) {
        logger.info(`Waiting for dependency: ${dep.container_id}`);
        const healthy = await waitForHealthy(depContainer.name, {
          timeout: dep.timeout || 60,
          interval: dep.retry_interval || 2,
        });

        if (!healthy) {
          throw new Error(`Dependency not healthy: ${dep.container_id}`);
        }
      }
    }

    started.add(container_id);
  }

  // Start all containers
  for (const containerConfig of containerConfigs) {
    await startContainer(containerConfig);
  }
}

/**
 * Execute evaluation hooks (post-hooks)
 * @param {string} problemPath - Path to problem package
 * @param {Array} containerConfigs - Container configurations
 * @param {Map} containers - Map of container instances
 * @returns {Promise<void>}
 */
async function executeEvaluationHooks(
  problemPath,
  containerConfigs,
  containers
) {
  for (const containerConfig of containerConfigs) {
    const { container_id } = containerConfig;
    const containerInfo = containers.get(container_id);

    if (!containerInfo) {
      continue;
    }

    // Execute post-hooks for evaluation
    const hooksPath = path.join(problemPath, container_id, "hooks");
    const postHooks = await listHooks(hooksPath, "post");

    if (postHooks.length > 0) {
      logger.info(
        `Executing ${postHooks.length} post-hooks for: ${container_id}`
      );
      const hookPaths = postHooks.map(
        (h) => `/workspace/hooks/post/${path.basename(h)}`
      );

      const stageConfig = await loadStageConfig(problemPath, container_id, 2);

      await executePostHooks(containerInfo.name, hookPaths, {
        timeout: stageConfig.resource_limits?.timeout || 300,
        continueOnError: true, // Continue even if a hook fails
      });
    }
  }
}

/**
 * Collect rubric results from output directory
 * @param {string} outputPath - Path to output directory
 * @param {Array} rubricConfigs - Rubric configurations
 * @returns {Promise<Array>} Array of rubric results
 */
async function collectRubrics(outputPath, rubricConfigs) {
  const rubrics = [];

  for (const rubricConfig of rubricConfigs) {
    const rubricFile = path.join(
      outputPath,
      `rubric_${rubricConfig.rubric_id}.json`
    );

    try {
      const content = await fs.readFile(rubricFile, "utf-8");
      const rubricData = JSON.parse(content);

      rubrics.push({
        rubric_id: rubricConfig.rubric_id,
        name: rubricConfig.name,
        type: rubricConfig.type,
        max_score: rubricConfig.max_score,
        score: rubricData.score || 0,
        status: rubricData.status || "unknown",
        details: rubricData.details || {},
        message: rubricData.message || "",
      });

      logger.info(
        `Collected rubric: ${rubricConfig.rubric_id} (${rubricData.score}/${rubricConfig.max_score})`
      );
    } catch (error) {
      logger.warn(`Failed to collect rubric: ${rubricConfig.rubric_id}`, {
        error: error.message,
      });

      // Add placeholder rubric with error
      rubrics.push({
        rubric_id: rubricConfig.rubric_id,
        name: rubricConfig.name,
        type: rubricConfig.type,
        max_score: rubricConfig.max_score,
        score: 0,
        status: "error",
        details: {},
        message: `Failed to collect rubric: ${error.message}`,
      });
    }
  }

  return rubrics;
}

/**
 * Parse memory limit string to bytes
 * @param {string} memory - Memory limit (e.g., "1g", "512m")
 * @returns {number} Memory in bytes
 */
function parseMemoryLimit(memory) {
  const units = { b: 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3 };
  const match = memory.toLowerCase().match(/^(\d+)([bkmg])$/);

  if (!match) {
    return 1024 ** 3; // Default 1GB
  }

  return parseInt(match[1]) * units[match[2]];
}

/**
 * Parse CPU limit to number of CPUs
 * @param {string|number} cpu - CPU limit (e.g., "1.0", "2.5")
 * @returns {number} Number of CPUs
 */
function parseCpuLimit(cpu) {
  return parseFloat(cpu) || 1.0;
}

module.exports = {
  runEvaluation,
  loadProblemConfig,
  buildContainerImages,
  imageCache,
};
