/**
 * Network management
 */
const { docker, logger } = require("./index");

/**
 * Create a new Docker network.
 * @param {string|import("dockerode").NetworkCreateOptions} nameOrOptions - Network name or Dockerode network creation options.
 * @returns {Promise<Object>} Resolves to the network inspect info object.
 * @throws {Error} If network creation fails.
 */
const createNetwork = async (nameOrOptions = {}) => {
  try {
    let networkOptions;

    if (typeof nameOrOptions === "string") {
      networkOptions = {
        Name: nameOrOptions,
        CheckDuplicate: true,
        Driver: "bridge",
      };
    } else {
      networkOptions = nameOrOptions;
    }

    const network = await docker.createNetwork(networkOptions);
    const info = await network.inspect();
    logger.debug({ id: info.Id, name: info.Name }, "network created");
    return info;
  } catch (err) {
    logger.error({ err, options: nameOrOptions }, "failed to create network");
    throw err;
  }
};

/**
 * Remove a Docker network by ID.
 * @param {string} networkId - The ID of the network to remove.
 * @returns {Promise<boolean>} Resolves to true if the network is removed successfully.
 * @throws {Error} If removal fails.
 */
const removeNetwork = async (networkId) => {
  try {
    const network = docker.getNetwork(networkId);
    await network.remove();
    logger.debug({ id: networkId }, "network removed");
    return true;
  } catch (err) {
    logger.error({ err, networkId }, "failed to remove network");
    throw err;
  }
};

/**
 * List all Docker networks.
 * @returns {Promise<Object[]>} Resolves to an array of Docker network objects.
 * @throws {Error} If listing fails.
 */
const getNetworks = async () => {
  try {
    return await docker.listNetworks();
  } catch (err) {
    logger.error({ err }, "failed to list networks");
    throw err;
  }
};

/**
 * Inspect a Docker network by ID.
 * @param {string} networkId - The ID of the network to inspect.
 * @returns {Promise<Object>} Resolves to the network inspect info object.
 * @throws {Error} If inspection fails.
 */
const getNetworkById = async (networkId) => {
  try {
    const network = docker.getNetwork(networkId);
    return await network.inspect();
  } catch (err) {
    logger.error({ err, networkId }, "failed to inspect network");
    throw err;
  }
};

module.exports = {
  createNetwork,
  removeNetwork,
  getNetworks,
  getNetworkById,
};
