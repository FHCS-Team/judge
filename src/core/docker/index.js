/**
 * High-level docker module re-exporting client, images, containers and network helpers.
 * Consumers should require this file for convenience e.g. `require('./docker')`.
 */
const client = require("./client");
const images = require("./images");
const containers = require("./containers");
const network = require("./network");
const dependency = require("./dependency");
const group = require("./group");
const stage = require("./configStage");

module.exports = {
  // raw client access
  client,

  // images
  ...images,

  // containers
  ...containers,

  // low-level network helpers
  ...network,

  // dependency helpers (topological sort, dependency waits)
  ...dependency,

  // group orchestration (start/monitor/terminate/wait)
  ...group,

  // stage config loader
  ...stage,

  // convenience alias
  getDockerContainer: (id) => client.getContainer(id),
};
