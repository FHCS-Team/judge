/**
 * Image management
 */
const { docker, logger } = require("./index");

/**
 * Pull a Docker image from a registry.
 * @param {string} imageName - Name of the image to pull (e.g., 'ubuntu:latest').
 * @returns {Promise<boolean>} Resolves to true if the image is pulled successfully.
 * @throws {Error} If imageName is not provided or the pull fails.
 */
const pullImage = async (imageName) => {
  if (!imageName) throw new Error("imageName is required");
  try {
    const stream = await docker.pull(imageName);
    await new Promise((resolve, reject) => {
      docker.modem.followProgress(stream, (err, output) => {
        if (err) return reject(err);
        resolve(output);
      });
    });
    logger.debug({ image: imageName }, "image pulled");
    return true;
  } catch (err) {
    logger.error({ err, imageName }, "failed to pull image");
    throw err;
  }
};

/**
 * Remove a Docker image from the local Docker host.
 * @param {string} imageName - Name or ID of the image to remove (e.g., 'ubuntu:latest' or image ID).
 * @returns {Promise<boolean>} Resolves to true if the image is removed successfully.
 * @throws {Error} If imageName is not provided or the removal fails.
 */
const removeImage = async (imageName) => {
  if (!imageName) throw new Error("imageName is required");
  try {
    const image = docker.getImage(imageName);
    await image.remove({ force: true });
    logger.debug({ image: imageName }, "image removed");
    return true;
  } catch (err) {
    logger.error({ err, imageName }, "failed to remove image");
    throw err;
  }
};

module.exports = {
  pullImage,
  removeImage,
};
