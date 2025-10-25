/**
 * Container management
 */

const { docker, containers, logger } = require("./index");

/**
 * Create a new Docker container.
 * @param {import("dockerode").ContainerCreateOptions} createOptions - Dockerode container creation options.
 * @returns {Promise<string>} Resolves to the created container's ID.
 * @throws {Error} If required options are missing or creation fails.
 */
const createContainer = async (createOptions) => {
  if (!createOptions || !createOptions.Image)
    throw new Error("createContainer requires options.Image");
  try {
    const container = await docker.createContainer(createOptions);
    const info = await container.inspect();
    containers[info.Id] = {
      id: info.Id,
      name: info.Name,
      image: info.Config && info.Config.Image,
      created: info.Created,
      state: info.State || {},
    };
    logger.debug({ id: info.Id }, "container created");
    return info.Id;
  } catch (err) {
    logger.error({ err, options: createOptions }, "failed to create container");
    throw err;
  }
};

/**
 * Start a Docker container by ID.
 * @param {string} containerId - The ID of the container to start.
 * @returns {Promise<boolean>} Resolves to true if the container is started successfully.
 * @throws {Error} If the container cannot be started.
 */
const startContainer = async (containerId) => {
  try {
    const container = docker.getContainer(containerId);
    await container.start();
    // refresh inspect
    const info = await container.inspect();
    containers[info.Id] = Object.assign(containers[info.Id] || {}, {
      id: info.Id,
      name: info.Name,
      image: info.Config && info.Config.Image,
      state: info.State || {},
    });
    logger.debug({ id: containerId }, "container started");
    return true;
  } catch (err) {
    logger.error({ err, containerId }, "failed to start container");
    throw err;
  }
};

/**
 * Stop a running Docker container by ID.
 * @param {string} containerId - The ID of the container to stop.
 * @param {import("dockerode").ContainerStopOptions} [stopOptions={ t: 5 }] - Dockerode stop options (supports t, signal, abortSignal).
 * @returns {Promise<boolean>} Resolves to true if the container is stopped or already stopped.
 * @throws {Error} If stopping fails for reasons other than already stopped.
 */
const stopContainer = async (containerId, stopOptions = { t: 5 }) => {
  try {
    const container = docker.getContainer(containerId);
    await container.stop(stopOptions);
    const info = await container.inspect();
    containers[info.Id] = Object.assign(containers[info.Id] || {}, {
      state: info.State || {},
    });
    logger.debug({ id: containerId }, "container stopped");
    return true;
  } catch (err) {
    // If container already stopped, ignore
    if (err && /is not running/.test(err.message)) {
      logger.debug({ containerId }, "container already stopped");
      return true;
    }
    logger.error({ err, containerId }, "failed to stop container");
    throw err;
  }
};

/**
 * Remove a Docker container by ID.
 * @param {string} containerId - The ID of the container to remove.
 * @param {import("dockerode").ContainerRemoveOptions} [removeOptions={ force: true, v: true }] - Dockerode remove options (supports force, v, link).
 * @returns {Promise<boolean>} Resolves to true if the container is removed successfully.
 * @throws {Error} If removal fails.
 */
const removeContainer = async (
  containerId,
  removeOptions = { force: true, v: true },
) => {
  try {
    const container = docker.getContainer(containerId);
    await container.remove(removeOptions);
    delete containers[containerId];
    logger.debug({ id: containerId }, "container removed");
    return true;
  } catch (err) {
    logger.error({ err, containerId }, "failed to remove container");
    throw err;
  }
};

module.exports = {
  createContainer,
  startContainer,
  stopContainer,
  removeContainer,
};
