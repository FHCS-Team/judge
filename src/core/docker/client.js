const Docker = require("dockerode");
const config = require("../../config");

/**
 * Docker client instance shared by docker modules.
 * @type {import('dockerode')}
 */
const docker = new Docker(config.getDockerOptions());

/**
 * Get the Docker client instance
 * @returns {import('dockerode')}
 */
function getClient() {
  return docker;
}

module.exports = docker;
module.exports.getClient = getClient;
