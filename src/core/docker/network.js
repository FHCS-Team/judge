const logger = require("../../utils/logger");
const docker = require("./client");

/**
 * Create an isolated Docker network for a submission.
 * @param {string} networkName - Network name
 * @param {Object} options - Network options
 * @param {boolean} options.internal - Whether to isolate from external networks
 * @param {Object} options.labels - Labels to attach to the network
 * @returns {Promise<string>} network id
 */
async function createNetwork(networkName, options = {}) {
  const { internal = true, labels = {} } = options;

  try {
    logger.info(`Creating network ${networkName}`);

    const network = await docker.createNetwork({
      Name: networkName,
      Driver: "bridge",
      Internal: internal,
      Attachable: false,
      Labels: {
        "judgehost.created_at": new Date().toISOString(),
        ...labels,
      },
      Options: {
        "com.docker.network.bridge.enable_icc": "true",
        "com.docker.network.bridge.enable_ip_masquerade": internal
          ? "false"
          : "true",
      },
    });

    logger.info(`Created network ${networkName} (${network.id})`);
    return network.id;
  } catch (error) {
    logger.error(`Failed to create network ${networkName}:`, error);

    // If subnet pool is exhausted, try to clean up stale networks and retry
    if (error.message && error.message.includes("fully subnetted")) {
      logger.warn(
        "Docker subnet pool exhausted, attempting to clean up stale networks..."
      );

      const cleaned = await cleanupStaleNetworks();
      if (cleaned > 0) {
        logger.info(
          `Cleaned up ${cleaned} stale networks, retrying network creation...`
        );

        // Retry network creation once after cleanup
        try {
          const network = await docker.createNetwork({
            Name: networkName,
            Driver: "bridge",
            Internal: internal,
            Attachable: false,
            Labels: {
              "judgehost.created_at": new Date().toISOString(),
              ...labels,
            },
            Options: {
              "com.docker.network.bridge.enable_icc": "true",
              "com.docker.network.bridge.enable_ip_masquerade": internal
                ? "false"
                : "true",
            },
          });

          logger.info(
            `Created network ${networkName} after cleanup (${network.id})`
          );
          return network.id;
        } catch (retryError) {
          logger.error(
            `Failed to create network ${networkName} after cleanup:`,
            retryError
          );
          throw retryError;
        }
      }
    }

    throw error;
  }
}

/**
 * Remove a network previously created for a submission.
 * @param {string} submissionId
 * @returns {Promise<boolean>} true on success
 */
async function removeNetwork(submissionId) {
  const networkName = `judgehost-eval-${submissionId}`;

  try {
    const network = docker.getNetwork(networkName);
    await network.remove();
    logger.info(`Removed network ${networkName}`);
    return true;
  } catch (error) {
    if (error.statusCode === 404) {
      logger.debug(`Network ${networkName} not found, already removed`);
      return true;
    }
    logger.error(`Failed to remove network ${networkName}:`, error);
    return false;
  }
}

/**
 * Remove a network by exact name
 * @param {string} networkName - Exact network name to remove
 * @returns {Promise<boolean>} true on success
 */
async function removeNetworkByName(networkName) {
  try {
    const network = docker.getNetwork(networkName);
    await network.remove();
    logger.info(`Removed network ${networkName}`);
    return true;
  } catch (error) {
    if (error.statusCode === 404) {
      logger.debug(`Network ${networkName} not found, already removed`);
      return true;
    }
    logger.error(`Failed to remove network ${networkName}:`, error);
    return false;
  }
}

/**
 * Clean up stale evaluation networks
 * Removes networks that are older than a specified age and not in use
 * @param {number} maxAgeMinutes - Maximum age in minutes (default: 60)
 * @returns {Promise<number>} Number of networks cleaned up
 */
async function cleanupStaleNetworks(maxAgeMinutes = 60) {
  try {
    const networks = await docker.listNetworks({
      filters: {
        name: ["eval-"],
        label: ["judgehost.created_at"],
      },
    });

    const threshold = Date.now() - maxAgeMinutes * 60 * 1000;
    let cleaned = 0;

    for (const networkInfo of networks) {
      try {
        const createdAt = networkInfo.Labels?.["judgehost.created_at"];
        if (!createdAt) continue;

        const createdTimestamp = new Date(createdAt).getTime();

        // Skip if network is too recent
        if (createdTimestamp > threshold) continue;

        // Check if network has any connected containers
        const network = docker.getNetwork(networkInfo.Id);
        const details = await network.inspect();

        // Only remove if no containers are connected
        if (
          !details.Containers ||
          Object.keys(details.Containers).length === 0
        ) {
          await network.remove();
          logger.info(`Cleaned up stale network: ${networkInfo.Name}`);
          cleaned++;
        } else {
          logger.debug(
            `Skipping network ${networkInfo.Name} - has ${
              Object.keys(details.Containers).length
            } connected containers`
          );
        }
      } catch (error) {
        if (error.statusCode === 404) {
          // Network already removed
          continue;
        }
        logger.warn(
          `Failed to cleanup network ${networkInfo.Name}: ${error.message}`
        );
      }
    }

    if (cleaned > 0) {
      logger.info(`Cleaned up ${cleaned} stale networks`);
    }

    return cleaned;
  } catch (error) {
    logger.error("Error during network cleanup:", error);
    return 0;
  }
}

/**
 * Clean up all judgehost evaluation networks (use with caution)
 * @returns {Promise<number>} Number of networks removed
 */
async function cleanupAllEvalNetworks() {
  try {
    const networks = await docker.listNetworks({
      filters: {
        name: ["eval-"],
      },
    });

    let cleaned = 0;

    for (const networkInfo of networks) {
      try {
        const network = docker.getNetwork(networkInfo.Id);
        await network.remove();
        logger.info(`Removed network: ${networkInfo.Name}`);
        cleaned++;
      } catch (error) {
        if (error.statusCode === 404) {
          continue;
        }
        logger.warn(
          `Failed to remove network ${networkInfo.Name}: ${error.message}`
        );
      }
    }

    logger.info(`Cleaned up ${cleaned} evaluation networks`);
    return cleaned;
  } catch (error) {
    logger.error("Error during network cleanup:", error);
    return 0;
  }
}

module.exports = {
  createNetwork,
  removeNetwork,
  removeNetworkByName,
  cleanupStaleNetworks,
  cleanupAllEvalNetworks,
};
