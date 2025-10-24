// dockerode wrapper, export functions from other docker-related modules
const { pullImage, removeImage, listImages, pushImage } = require("./image");

const {
  createContainer,
  startContainer,
  stopContainer,
  createSnapshot,
  restoreSnapshot,
} = require("./container");

const { execInContainer } = require("./exec");

module.exports = {
  // Image functions
  pullImage,
  removeImage,
  listImages,
  pushImage, // This function requires authentication

  // Container functions
  createContainer,
  startContainer,
  stopContainer,
  createSnapshot,
  restoreSnapshot,

  // Exec functions
  execInContainer,
};
