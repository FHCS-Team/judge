/**
 * dockerode wrapper to be internally used by JUDGE modules
 */
const Docker = require("dockerode");
const logger = require("../utils/logger");

/**
 * Dockerode instance, configured from environment.
 * @type {import('dockerode')}
 */
const docker = new Docker();

/**
 * In-memory container registry (id -> meta object).
 * @type {Object.<string, {id: string, name: string, image: string, created?: string, state: Object}>}
 */
const containers = {};

module.exports = {
  docker,
  containers,
  logger,
};
