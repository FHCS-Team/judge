const logger = require("../../utils/logger");
const docker = require("./client");
const { waitForDependency } = require("./dependency");
const path = require("path");
const fs = require("fs/promises");

/**
 * Create a container group for multi-container evaluation
 * @param {Object} options
 * @param {string} options.submissionId - Submission identifier
 * @param {string} options.problemId - Problem identifier
 * @param {string} options.problemPath - Path to problem package
 * @param {string} options.submissionPath - Path to submission files
 * @param {string} options.resultsPath - Path to store results
 * @param {Array} options.containers - Array of container configurations
 * @param {string} options.networkId - Docker network ID
 * @param {number} options.timeout - Total timeout in seconds
 * @returns {Promise<Object>} Container group object with control methods
 */
async function createContainerGroup(options) {
  const {
    submissionId,
    problemId,
    problemPath,
    submissionPath,
    resultsPath,
    containers,
    networkId,
    timeout,
  } = options;

  logger.info(`Creating container group for submission ${submissionId}`);

  // Create shared volume directory
  const sharedDir = path.join(resultsPath, "shared");
  await fs.mkdir(sharedDir, { recursive: true });

  const createdContainers = [];
  const containerInstances = new Map();

  try {
    // Create all containers
    for (const containerConfig of containers) {
      const {
        containerId,
        imageName,
        stages,
        acceptsSubmission,
        submissionPackageId,
      } = containerConfig;

      logger.info(`Creating container ${containerId} from image ${imageName}`);

      // Prepare mounts
      const binds = [`${resultsPath}:/out:rw`, `${sharedDir}:/shared:rw`];

      // Determine container data path
      const containerDataPath = path.join(problemPath, containerId, "data");

      // Mount container-specific data directory as read-only at /data
      try {
        await fs.access(containerDataPath);
        binds.push(`${containerDataPath}:/data:ro`);
        logger.info(`Mounted data directory for container ${containerId}`);
      } catch (error) {
        logger.debug(`No data directory found for container ${containerId}`);
      }

      // Create a writable workspace directory for each container
      const containerWorkspacePath = path.join(
        resultsPath,
        "workspace",
        containerId
      );
      await fs.mkdir(containerWorkspacePath, { recursive: true });

      // Copy container-specific data to workspace if it exists
      // This allows hooks to access and use problem data files
      try {
        await fs.access(containerDataPath);
        const dataFiles = await fs.readdir(containerDataPath);
        for (const file of dataFiles) {
          const srcPath = path.join(containerDataPath, file);
          const destPath = path.join(containerWorkspacePath, file);
          const stats = await fs.stat(srcPath);
          if (stats.isFile()) {
            await fs.copyFile(srcPath, destPath);
            logger.debug(
              `Copied ${file} to container ${containerId} workspace`
            );
          }
        }
        logger.info(
          `Copied data files to workspace for container ${containerId}`
        );
      } catch (error) {
        logger.debug(`No data files to copy for container ${containerId}`);
      }

      binds.push(`${containerWorkspacePath}:/workspace:rw`);

      // Mount submission if this container accepts it
      if (acceptsSubmission && submissionPath) {
        binds.push(`${submissionPath}:/submission:ro`);
      }

      // Mount hooks directory from problem package
      const containerHooksPath = path.join(problemPath, containerId, "hooks");
      try {
        await fs.access(containerHooksPath);
        binds.push(`${containerHooksPath}:/hooks:ro`);
        logger.info(`Mounted hooks for container ${containerId}`);
      } catch (error) {
        logger.warn(`No hooks directory found for container ${containerId}`);
      }

      // Determine if we should override CMD
      // Service containers (databases, etc.) should run their default ENTRYPOINT/CMD
      // Submission/testing containers should idle and wait for hook execution
      let cmdOverride = undefined;

      // If container doesn't accept submission, it's likely a service (database, etc.)
      // Let it run its default CMD/ENTRYPOINT
      if (acceptsSubmission) {
        // Submission containers should idle and wait for orchestrator commands
        // The actual work is done by executing hooks via docker exec
        cmdOverride = ["sh", "-c", "tail -f /dev/null"];
        logger.info(
          `Container ${containerId} will idle and wait for hook execution`
        );
      } else {
        logger.info(
          `Container ${containerId} will use default CMD/ENTRYPOINT (service mode)`
        );
      }

      // Create container
      const container = await docker.createContainer({
        Image: imageName,
        name: `${submissionId}-${containerId}`,
        Cmd: cmdOverride,
        Env: [
          `SUBMISSION_ID=${submissionId}`,
          `PROBLEM_ID=${problemId}`,
          `CONTAINER_ID=${containerId}`,
        ],
        Labels: {
          submission_id: submissionId,
          problem_id: problemId,
          container_id: containerId,
        },
        HostConfig: {
          Binds: binds,
          NetworkMode: networkId || "none",
          AutoRemove: false,
        },
        WorkingDir: "/workspace",
      });

      createdContainers.push({
        containerId,
        container,
        stages,
        acceptsSubmission,
      });

      containerInstances.set(containerId, container);

      logger.info(
        `Container ${containerId} created: ${container.id.substring(0, 12)}`
      );
    }

    // Return control object
    return {
      submissionId,
      containers: createdContainers,
      containerInstances,

      /**
       * Execute all stages for all containers
       */
      async executeAll() {
        logger.info(`Executing all stages for submission ${submissionId}`);

        // Group containers by stage dependencies
        // For now, execute database containers first, then submission containers
        const databaseContainers = createdContainers.filter(
          (c) => !c.acceptsSubmission
        );
        const submissionContainers = createdContainers.filter(
          (c) => c.acceptsSubmission
        );

        // Execute database container stages
        for (const containerInfo of databaseContainers) {
          await executeContainerStages(containerInfo, resultsPath);
        }

        // Execute submission container stages
        for (const containerInfo of submissionContainers) {
          await executeContainerStages(containerInfo, resultsPath);
        }

        logger.info(`All stages completed for submission ${submissionId}`);
      },

      /**
       * Cleanup all containers and resources
       */
      async cleanup() {
        logger.info(
          `Cleaning up container group for submission ${submissionId}`
        );

        for (const { container, containerId } of createdContainers) {
          try {
            // Stop container if running
            const info = await container.inspect().catch(() => null);
            if (info && info.State && info.State.Running) {
              await container.stop({ t: 5 });
            }

            // Remove container
            await container.remove({ force: true });
            logger.info(`Container ${containerId} removed`);
          } catch (error) {
            logger.warn(
              `Failed to cleanup container ${containerId}: ${error.message}`
            );
          }
        }
      },
    };
  } catch (error) {
    // Cleanup on error
    for (const { container, containerId } of createdContainers) {
      try {
        await container.remove({ force: true });
      } catch (cleanupError) {
        logger.warn(
          `Failed to cleanup container ${containerId}: ${cleanupError.message}`
        );
      }
    }
    throw error;
  }
}

/**
 * Execute all stages for a single container
 */
async function executeContainerStages(containerInfo, resultsPath) {
  const { containerId, container, stages, acceptsSubmission } = containerInfo;

  logger.info(`Executing stages for container ${containerId}`);

  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    const stageNum = i + 1;

    logger.info(
      `Executing stage ${stageNum}/${stages.length} for ${containerId}: ${
        stage.name || stage.stage_id
      }`
    );

    // Start container if not running
    const info = await container.inspect();
    if (!info.State.Running) {
      await container.start();
      logger.info(`Container ${containerId} started for stage ${stageNum}`);

      // If this is a service container (database, etc.), give it time to initialize
      if (!acceptsSubmission) {
        logger.info(
          `Waiting 5 seconds for service container ${containerId} to initialize...`
        );
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    // Execute pre-hooks for this stage
    // Hooks are mounted at /hooks (not /workspace/{containerId}/hooks)
    const hooksDir = "/hooks";
    const preHooks = await findHooks(container, hooksDir, `pre_0${stageNum}`);

    for (const hook of preHooks) {
      await executeHook(container, containerId, hook, stage.timeout || 300);
    }

    // Wait a bit for the stage to stabilize
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Execute post-hooks for this stage
    const postHooks = await findHooks(container, hooksDir, `post_0${stageNum}`);

    for (const hook of postHooks) {
      await executeHook(container, containerId, hook, stage.timeout || 300);
    }

    logger.info(`Stage ${stageNum} completed for ${containerId}`);
  }

  // Keep database containers running for submission containers
  if (!containerInfo.acceptsSubmission) {
    logger.info(`Container ${containerId} (database) will keep running`);
    // Don't stop - let it run for other containers
  }
}

/**
 * Find hooks matching a pattern
 */
async function findHooks(container, hooksDir, pattern) {
  try {
    const exec = await container.exec({
      Cmd: ["sh", "-c", `ls ${hooksDir}/${pattern}*.sh 2>/dev/null || true`],
      AttachStdout: true,
      AttachStderr: true,
    });

    const stream = await exec.start({ hijack: true, stdin: false });
    const output = await streamToString(stream);

    const hooks = output
      .trim()
      .split("\n")
      .filter((line) => line.trim().length > 0);

    return hooks;
  } catch (error) {
    logger.warn(`Failed to list hooks: ${error.message}`);
    return [];
  }
}

/**
 * Execute a single hook script
 */
async function executeHook(container, containerId, hookPath, timeoutSeconds) {
  logger.info(`Executing hook ${hookPath} in ${containerId}`);

  try {
    const exec = await container.exec({
      Cmd: ["sh", hookPath],
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: "/workspace",
    });

    const stream = await exec.start({ hijack: true, stdin: false });

    // Set timeout
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Hook timeout")), timeoutSeconds * 1000)
    );

    const outputPromise = streamToString(stream);

    const output = await Promise.race([outputPromise, timeoutPromise]);

    logger.info(`Hook ${hookPath} completed`);
    logger.debug(`Hook output: ${output}`);

    return output;
  } catch (error) {
    logger.error(`Hook ${hookPath} failed: ${error.message}`);
    throw error;
  }
}

/**
 * Convert stream to string
 */
function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    stream.on("error", reject);
  });
}

/**
 * Start containers in a group, waiting for their declared dependencies.
 * This function only starts containers and tracks statuses in a map.
 * @param {Object} containerGroup
 * @returns {Promise<Map>} map of containerId -> start metadata
 */
async function startContainerGroup(containerGroup) {
  logger.info(`Starting container group for ${containerGroup.submissionId}`);

  const startedContainers = new Map();

  for (const containerInfo of containerGroup.containers) {
    const { dockerContainerId, containerId, config } = containerInfo;

    if (config.depends_on && Array.isArray(config.depends_on)) {
      logger.info(
        `Container ${containerId} has ${config.depends_on.length} dependencies`
      );
      for (const dependency of config.depends_on) {
        await waitForDependency(containerGroup, dependency, startedContainers);
      }
    }

    logger.info(`Starting container ${containerId}`);
    const container = docker.getContainer(dockerContainerId);
    await container.start();

    startedContainers.set(containerId, {
      dockerContainerId,
      status: "starting",
      startedAt: Date.now(),
    });
  }

  logger.info(`All containers started for ${containerGroup.submissionId}`);
  return startedContainers;
}

/**
 * Monitor containers which, when finished, should trigger termination of other containers.
 * @param {Object} containerGroup
 * @param {Function} [onTerminate]
 * @returns {Promise<void>}
 */
async function monitorContainerTerminations(containerGroup, onTerminate) {
  logger.info(
    `Starting termination monitoring for ${containerGroup.submissionId}`
  );

  const terminationPromises = [];

  for (const containerInfo of containerGroup.containers) {
    const { dockerContainerId, containerId, config } = containerInfo;
    const terminates = config.terminates || config.terminate_on_finish || [];

    if (terminates.length === 0) continue;

    const monitorPromise = (async () => {
      try {
        const container = docker.getContainer(dockerContainerId);
        const result = await container.wait();

        logger.info(
          `Container ${containerId} finished with status ${result.StatusCode}`
        );

        for (const targetContainerId of terminates) {
          await terminateContainer(containerGroup, targetContainerId);
        }

        if (onTerminate) await onTerminate(containerId, terminates);
      } catch (error) {
        logger.error(
          `Error monitoring container ${containerId}:`,
          error.message
        );
      }
    })();

    terminationPromises.push(monitorPromise);
  }

  if (terminationPromises.length > 0) await Promise.all(terminationPromises);
}

/**
 * Terminate a container in the group either gracefully (stop) or forcefully (kill).
 * @param {Object} containerGroup
 * @param {string} containerId
 * @param {boolean} [graceful=true]
 * @returns {Promise<void>}
 */
async function terminateContainer(
  containerGroup,
  containerId,
  graceful = true
) {
  const containerInfo = containerGroup.containers.find(
    (c) => c.containerId === containerId
  );
  if (!containerInfo) {
    logger.warn(`Container ${containerId} not found in group`);
    return;
  }

  logger.info(
    `Terminating container ${containerId} ${
      graceful ? "(graceful)" : "(forced)"
    }`
  );

  try {
    const container = docker.getContainer(containerInfo.dockerContainerId);
    const info = await container.inspect().catch(() => null);
    if (!info || !info.State || !info.State.Running) return;

    if (graceful) {
      try {
        await container.stop({ t: 10 });
        logger.info(`Container ${containerId} stopped gracefully`);
      } catch (error) {
        if (error.statusCode === 304) {
          logger.debug(`Container ${containerId} already stopped`);
        } else {
          throw error;
        }
      }
    } else {
      await container.kill();
      logger.info(`Container ${containerId} forcefully killed`);
    }
  } catch (error) {
    logger.error(`Error terminating container ${containerId}:`, error.message);
    throw error;
  }
}

/**
 * Wait for the group's primary execution containers (sidecar/tester) to finish.
 * @param {Object} containerGroup
 * @param {number} timeoutMs - milliseconds to wait in total
 * @returns {Promise<Object>} results mapping containerId -> { statusCode, exitCode }
 */
async function waitForContainerGroup(containerGroup, timeoutMs) {
  logger.info(`Waiting for container group ${containerGroup.submissionId}`);

  const results = {};
  const startTime = Date.now();

  const executionContainers = containerGroup.containers.filter(
    (c) => c.role === "sidecar" || c.role === "tester"
  );
  if (executionContainers.length === 0)
    throw new Error("No execution container found in group");

  for (const containerInfo of executionContainers) {
    const remainingTime = timeoutMs - (Date.now() - startTime);
    if (remainingTime <= 0)
      throw new Error("Container group execution timeout");

    const container = docker.getContainer(containerInfo.dockerContainerId);

    try {
      const result = await Promise.race([
        container.wait(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), remainingTime)
        ),
      ]);

      results[containerInfo.containerId] = {
        statusCode: result.StatusCode,
        exitCode: result.StatusCode,
      };
    } catch (error) {
      results[containerInfo.containerId] = {
        statusCode: -1,
        error: error.message,
        timedOut: true,
      };
    }
  }

  return results;
}

module.exports = {
  createContainerGroup,
  startContainerGroup,
  monitorContainerTerminations,
  terminateContainer,
  waitForContainerGroup,
};
