const fs = require("fs/promises");
const path = require("path");
const tar = require("tar-fs");
const logger = require("../../utils/logger");
const config = require("../../config");
const docker = require("./client");

/**
 * Create a new evaluation container
 * @param {string} imageId - Docker image ID or name to instantiate
 * @param {string} submissionId - Unique submission identifier used for labels and result mounting
 * @param {Object} problem - Problem configuration object (used for env, resources, mounts)
 * @param {Object} [options] - Optional overrides
 * @param {Array|string} [options.cmd] - Command to run in container
 * @returns {Promise<string>} Resolves with created container id
 */
async function createContainer(imageId, submissionId, problem, options = {}) {
  logger.info(`Creating evaluation container for ${submissionId}`);

  const containerName = `eval-${submissionId}`;

  const envVars = [
    `PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`,
    `SUBMISSION_ID=${submissionId}`,
    `PROBLEM_ID=${problem.problem_id}`,
    `PROBLEM_TYPE=${
      problem.projectType || problem.project_type || "algorithm"
    }`,
    `EVAL_TIMESTAMP=${new Date().toISOString()}`,
    `WORKSPACE_DIR=/workspace`,
    `OUT_DIR=/out`,
    `PROBLEM_DIR=/workspace/problem`,
    `SUBMISSION_DIR=/workspace/submission`,
    `HOOKS_DIR=/hooks`,
    `UTILS_DIR=/utils`,
    `TOOLS_DIR=/tools`,
    ...Object.entries(problem.environment || {}).map(([k, v]) => `${k}=${v}`),
  ];

  const memoryMB =
    options.memoryMB || problem.memoryMB || config.docker.defaultMemoryMB;
  const cpuCores =
    options.cpuCores || problem.cpuCores || config.docker.defaultCpuCores;

  const containerConfig = {
    Image: imageId,
    name: containerName,
    Env: envVars,
    WorkingDir: "/workspace",
    Cmd: options.cmd || undefined,
    HostConfig: {
      NetworkMode: problem.network_enabled ? "bridge" : "none",
      Memory: memoryMB * 1024 * 1024,
      MemorySwap: memoryMB * 1024 * 1024,
      NanoCpus: Math.floor(cpuCores * 1e9),
      ReadonlyRootfs: false,
      SecurityOpt:
        config.security.containerProfile === "restricted"
          ? ["no-new-privileges:true"]
          : [],
      Binds: [
        `${path.join(config.paths.resultsDir, submissionId)}:/out:rw`,
        `${path.join(__dirname, "../../docker")}:/utils:ro`,
        // this utils path needs calibration
        `${path.join(
          config.paths.problemsDir,
          problem.problemId,
          "hooks"
        )}:/hooks:ro`,
      ],
      AutoRemove: false,
    },
    Labels: {
      "judgehost.submission_id": submissionId,
      "judgehost.problem_id": problem.problemId,
      "judgehost.created_at": new Date().toISOString(),
    },
  };

  try {
    const container = await docker.createContainer(containerConfig);
    logger.info(`Created container ${container.id} for ${submissionId}`);
    return container.id;
  } catch (error) {
    logger.error(`Failed to create container:`, error);
    throw error;
  }
}

/**
 * Start a previously created container and wait for completion or timeout
 * @param {string} containerId - Docker container id
 * @param {Object} [options]
 * @param {number} [options.timeout] - Milliseconds to wait before forcing stop
 * @returns {Promise<Object>} Execution result { statusCode, logs, stats, timedOut }
 */
async function startContainer(containerId, options = {}) {
  const container = docker.getContainer(containerId);

  logger.info(`Starting container ${containerId}`);

  try {
    await container.start();

    const timeoutMs = options.timeout || config.docker.defaultTimeout;
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(new Error(`Container execution timeout after ${timeoutMs}ms`)),
        timeoutMs
      )
    );

    let timedOut = false;
    const result = await Promise.race([
      container.wait(),
      timeoutPromise.catch((err) => {
        timedOut = true;
        throw err;
      }),
    ]).catch(async (err) => {
      if (timedOut) {
        logger.warn(`Container ${containerId} timed out, stopping...`);
        await container.stop().catch(() => {});
        await container.kill().catch(() => {});
      }
      throw err;
    });

    const logsStream = await container.logs({
      stdout: true,
      stderr: true,
      timestamps: true,
    });
    const logs = logsStream.toString("utf8");
    const stats = await container.stats({ stream: false });

    logger.info(
      `Container ${containerId} finished with status ${result.StatusCode}`
    );

    return { statusCode: result.StatusCode, logs, stats, timedOut: false };
  } catch (error) {
    if (error.message.includes("timeout")) {
      return {
        statusCode: -1,
        logs: await container
          .logs({ stdout: true, stderr: true })
          .then((l) => l.toString("utf8"))
          .catch(() => ""),
        timedOut: true,
        error: error.message,
      };
    }

    logger.error(`Error executing container ${containerId}:`, error);
    throw error;
  }
}

/**
 * Retrieve container logs (stdout/stderr)
 * @param {string} containerId
 * @returns {Promise<string>} Logs as a UTF-8 string
 */
async function getLogs(containerId) {
  const container = docker.getContainer(containerId);

  try {
    const logsStream = await container.logs({
      stdout: true,
      stderr: true,
      timestamps: true,
    });
    return logsStream.toString("utf8");
  } catch (error) {
    logger.error(`Error getting logs for container ${containerId}:`, error);
    throw error;
  }
}

/**
 * Stop a running container gracefully
 * @param {string} containerId
 * @param {number} [timeout] - seconds to wait before killing
 * @returns {Promise<void>}
 */
async function stopContainer(containerId, timeout = 10) {
  const container = docker.getContainer(containerId);

  try {
    logger.info(`Stopping container ${containerId}`);
    await container.stop({ t: timeout });
    logger.info(`Stopped container ${containerId}`);
  } catch (error) {
    if (error.statusCode === 304) {
      logger.debug(`Container ${containerId} already stopped`);
    } else {
      logger.error(`Error stopping container ${containerId}:`, error);
      throw error;
    }
  }
}

/**
 * Remove a container and optionally its image
 * @param {string} containerId
 * @param {boolean} [removeImage=false]
 * @returns {Promise<boolean>} true on success
 */
async function cleanup(containerId, removeImage = false) {
  const container = docker.getContainer(containerId);

  try {
    const info = await container.inspect().catch(() => null);

    if (info) {
      if (info.State.Running) {
        await stopContainer(containerId);
      }

      logger.info(`Removing container ${containerId}`);
      await container.remove({ force: true });

      if (removeImage && info.Image) {
        try {
          const image = docker.getImage(info.Image);
          logger.info(`Removing image ${info.Image}`);
          await image.remove({ force: true });
        } catch (err) {
          logger.warn(`Could not remove image ${info.Image}:`, err.message);
        }
      }
    }

    logger.info(`Cleaned up container ${containerId}`);
    return true;
  } catch (error) {
    logger.error(`Error cleaning up container ${containerId}:`, error);
    return false;
  }
}

/**
 * List judgehost-managed containers
 * @returns {Promise<Array>} Array of container info objects
 */
async function listContainers() {
  try {
    const containers = await docker.listContainers({
      all: true,
      filters: { label: ["judgehost.submission_id"] },
    });
    return containers;
  } catch (error) {
    logger.error("Error listing containers:", error);
    throw error;
  }
}

/**
 * Copy files out of a container path to a host path
 * @param {string} containerId
 * @param {string} containerPath - path inside the container
 * @param {string} hostPath - destination on the host
 * @returns {Promise<boolean>} true on success
 */
async function copyFromContainer(containerId, containerPath, hostPath) {
  const stream = require("stream");
  const { promisify } = require("util");
  const pipeline = promisify(stream.pipeline);

  try {
    const container = docker.getContainer(containerId);
    const tarStream = await container.getArchive({ path: containerPath });
    const extract = tar.extract(hostPath);
    await pipeline(tarStream, extract);

    logger.info(
      `Copied ${containerPath} from container ${containerId} to ${hostPath}`
    );
    return true;
  } catch (error) {
    logger.error(`Error copying from container ${containerId}:`, error.message);
    return false;
  }
}

/**
 * Remove old containers older than `days`
 * @param {number} [days=7]
 * @returns {Promise<number>} number of containers removed
 */
async function cleanupOldContainers(days = 7) {
  try {
    const containers = await listContainers();
    const threshold = Date.now() - days * 24 * 60 * 60 * 1000;

    let cleaned = 0;

    for (const containerInfo of containers) {
      const createdAt = new Date(containerInfo.Created * 1000).getTime();

      if (createdAt < threshold) {
        logger.info(`Cleaning up old container ${containerInfo.Id}`);
        await cleanup(containerInfo.Id, true);
        cleaned++;
      }
    }

    logger.info(`Cleaned up ${cleaned} old containers`);
    return cleaned;
  } catch (error) {
    logger.error("Error cleaning up old containers:", error);
    throw error;
  }
}

module.exports = {
  createEvaluationContainer: createContainer,
  executeContainer: startContainer,
  getContainerLogs: getLogs,
  stopContainer,
  cleanup,
  listJudgehostContainers: listContainers,
  copyFromContainer,
  cleanupOldContainers,
};
