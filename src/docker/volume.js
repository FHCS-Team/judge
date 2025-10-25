/**
 * Volume and mounting logic
 */
const { docker, logger } = require("./index");

/**
 * Create a new Docker volume.
 * @param {string} volumeName - Name of the volume to create.
 * @param {import("dockerode").VolumeCreateOptions} [volumeOptions={}] - Dockerode volume creation options.
 * @returns {Promise<Object>} Resolves to the volume inspect info object.
 * @throws {Error} If volumeName is not provided or creation fails.
 */
const createVolume = async (volumeName, volumeOptions = {}) => {
  if (!volumeName) throw new Error("volumeName is required");
  try {
    const volume = await docker.createVolume(
      Object.assign({ Name: volumeName }, volumeOptions),
    );
    const info = await volume.inspect();
    logger.debug({ name: volumeName }, "volume created");
    return info;
  } catch (err) {
    logger.error({ err, volumeName }, "failed to create volume");
    throw err;
  }
};

/**
 * Remove a Docker volume by name.
 * @param {string} volumeName - Name of the volume to remove.
 * @returns {Promise<boolean>} Resolves to true if the volume is removed successfully.
 * @throws {Error} If volumeName is not provided or removal fails.
 */
const removeVolume = async (volumeName) => {
  if (!volumeName) throw new Error("volumeName is required");
  try {
    const volume = docker.getVolume(volumeName);
    await volume.remove();
    logger.debug({ name: volumeName }, "volume removed");
    return true;
  } catch (err) {
    logger.error({ err, volumeName }, "failed to remove volume");
    throw err;
  }
};

/**
 * List all Docker volumes.
 * @returns {Promise<Object[]>} Resolves to an array of Docker volume objects.
 * @throws {Error} If listing fails.
 */
const getVolumes = async () => {
  try {
    const list = await docker.listVolumes();
    return list.Volumes || [];
  } catch (err) {
    logger.error({ err }, "failed to list volumes");
    throw err;
  }
};

/**
 * Inspect a Docker volume by name.
 * @param {string} volumeName - Name of the volume to inspect.
 * @returns {Promise<Object>} Resolves to the volume inspect info object.
 * @throws {Error} If volumeName is not provided or inspection fails.
 */
const getVolumeByName = async (volumeName) => {
  if (!volumeName) throw new Error("volumeName is required");
  try {
    const volume = docker.getVolume(volumeName);
    return await volume.inspect();
  } catch (err) {
    logger.error({ err, volumeName }, "failed to inspect volume");
    throw err;
  }
};

module.exports = {
  createVolume,
  removeVolume,
  getVolumes,
  getVolumeByName,
};
