/**
 * Hook Execution Module
 * Executes hooks inside Docker containers
 */

const logger = require("../../utils/logger");
const dockerClient = require("./client");

/**
 * Execute a hook script inside a container
 * @param {string} containerName - Container name or ID
 * @param {string} hookPath - Path to hook script inside container (e.g., /workspace/hooks/pre/01_setup.sh)
 * @param {Object} [options] - Execution options
 * @param {number} [options.timeout] - Timeout in seconds (default: 300)
 * @param {Object} [options.env] - Additional environment variables
 * @returns {Promise<Object>} Execution result
 */
async function executeHook(containerName, hookPath, options = {}) {
  const { timeout = 300, env = {} } = options;

  logger.info(`Executing hook: ${hookPath} in container: ${containerName}`);

  const startTime = Date.now();

  try {
    const container = dockerClient.getContainer(containerName);

    // Prepare exec command
    const execOptions = {
      Cmd: ["/bin/sh", hookPath],
      AttachStdout: true,
      AttachStderr: true,
      Env: Object.entries(env).map(([key, value]) => `${key}=${value}`),
    };

    // Create exec instance
    const exec = await container.exec(execOptions);

    // Start exec and collect output
    const stream = await exec.start({
      hijack: true,
      stdin: false,
    });

    let stdout = "";
    let stderr = "";

    // Set up timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Hook execution timeout after ${timeout}s`));
      }, timeout * 1000);
    });

    // Collect output
    const outputPromise = new Promise((resolve, reject) => {
      // Docker multiplexes stdout/stderr in a single stream
      // First byte indicates stream type: 1=stdout, 2=stderr
      stream.on("data", (chunk) => {
        // Demultiplex Docker stream format
        let offset = 0;
        while (offset < chunk.length) {
          const header = chunk.slice(offset, offset + 8);
          if (header.length < 8) break;

          const streamType = header[0];
          const size = header.readUInt32BE(4);
          const data = chunk.slice(offset + 8, offset + 8 + size).toString();

          if (streamType === 1) {
            stdout += data;
          } else if (streamType === 2) {
            stderr += data;
          }

          offset += 8 + size;
        }
      });

      stream.on("end", resolve);
      stream.on("error", reject);
    });

    // Wait for output or timeout
    await Promise.race([outputPromise, timeoutPromise]);

    // Get exit code
    const inspectData = await exec.inspect();
    const exitCode = inspectData.ExitCode;

    const duration = Date.now() - startTime;

    const result = {
      success: exitCode === 0,
      exitCode,
      stdout,
      stderr,
      duration,
      hookPath,
    };

    if (exitCode === 0) {
      logger.info(`Hook completed successfully: ${hookPath} (${duration}ms)`);
    } else {
      logger.error(
        `Hook failed: ${hookPath} (exit code: ${exitCode}, ${duration}ms)`
      );
      logger.error(`Hook stderr: ${stderr}`);
    }

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;

    logger.error(`Hook execution error: ${hookPath}`, {
      error: error.message,
      duration,
    });

    return {
      success: false,
      exitCode: -1,
      stdout: "",
      stderr: error.message,
      duration,
      hookPath,
      error: error.message,
    };
  }
}

/**
 * Execute multiple hooks sequentially
 * @param {string} containerName - Container name or ID
 * @param {Array<string>} hookPaths - Array of hook paths to execute
 * @param {Object} [options] - Execution options
 * @returns {Promise<Array>} Array of execution results
 */
async function executeHooksSequentially(
  containerName,
  hookPaths,
  options = {}
) {
  const results = [];

  for (const hookPath of hookPaths) {
    const result = await executeHook(containerName, hookPath, options);
    results.push(result);

    // Stop if hook failed (unless continueOnError is true)
    if (!result.success && !options.continueOnError) {
      logger.warn(`Hook failed, stopping execution: ${hookPath}`);
      break;
    }
  }

  return results;
}

/**
 * Execute pre-hooks for container initialization
 * @param {string} containerName - Container name or ID
 * @param {Array<string>} hookPaths - Array of pre-hook paths
 * @param {Object} [options] - Execution options
 * @returns {Promise<Object>} Execution summary
 */
async function executePreHooks(containerName, hookPaths, options = {}) {
  logger.info(`Executing ${hookPaths.length} pre-hooks for: ${containerName}`);

  const results = await executeHooksSequentially(
    containerName,
    hookPaths,
    options
  );

  const summary = {
    total: hookPaths.length,
    succeeded: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  };

  logger.info(
    `Pre-hooks completed: ${summary.succeeded}/${summary.total} succeeded`
  );

  return summary;
}

/**
 * Execute post-hooks for evaluation
 * @param {string} containerName - Container name or ID
 * @param {Array<string>} hookPaths - Array of post-hook paths
 * @param {Object} [options] - Execution options
 * @returns {Promise<Object>} Execution summary
 */
async function executePostHooks(containerName, hookPaths, options = {}) {
  logger.info(`Executing ${hookPaths.length} post-hooks for: ${containerName}`);

  // Post-hooks should continue even if one fails (collect all evaluations)
  const results = await executeHooksSequentially(containerName, hookPaths, {
    ...options,
    continueOnError: true,
  });

  const summary = {
    total: hookPaths.length,
    succeeded: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    results,
  };

  logger.info(
    `Post-hooks completed: ${summary.succeeded}/${summary.total} succeeded`
  );

  return summary;
}

/**
 * Wait for container to be healthy
 * @param {string} containerName - Container name or ID
 * @param {Object} [options] - Wait options
 * @param {number} [options.timeout] - Timeout in seconds (default: 60)
 * @param {number} [options.interval] - Check interval in seconds (default: 2)
 * @returns {Promise<boolean>} True if healthy
 */
async function waitForHealthy(containerName, options = {}) {
  const { timeout = 60, interval = 2 } = options;

  logger.info(`Waiting for container to be healthy: ${containerName}`);

  const startTime = Date.now();
  const timeoutMs = timeout * 1000;
  const intervalMs = interval * 1000;

  while (Date.now() - startTime < timeoutMs) {
    try {
      const container = dockerClient.getContainer(containerName);
      const info = await container.inspect();

      // Check health status
      if (info.State.Health) {
        const health = info.State.Health.Status;
        logger.debug(`Container health status: ${health}`);

        if (health === "healthy") {
          logger.info(`Container is healthy: ${containerName}`);
          return true;
        }

        if (health === "unhealthy") {
          logger.error(`Container is unhealthy: ${containerName}`);
          return false;
        }
      } else {
        // No health check defined, check if running
        if (info.State.Running) {
          logger.info(
            `Container is running (no health check): ${containerName}`
          );
          return true;
        }
      }

      // Wait before next check
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    } catch (error) {
      logger.error(`Error checking container health: ${error.message}`);
      return false;
    }
  }

  logger.error(`Timeout waiting for container health: ${containerName}`);
  return false;
}

/**
 * Execute periodic health check hook
 * @param {string} containerName - Container name or ID
 * @param {string} hookPath - Path to health check hook
 * @returns {Promise<boolean>} True if healthy
 */
async function executeHealthCheck(containerName, hookPath) {
  const result = await executeHook(containerName, hookPath, {
    timeout: 30,
  });

  return result.success;
}

module.exports = {
  executeHook,
  executeHooksSequentially,
  executePreHooks,
  executePostHooks,
  waitForHealthy,
  executeHealthCheck,
};
