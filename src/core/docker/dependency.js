const logger = require("../../utils/logger");
const docker = require("./client");

/**
 * Perform a topological sort of containers based on their `depends_on` edges.
 * @param {Array<Object>} containers - array of container configs
 * @returns {Array<Object>} sorted containers
 */
function topologicalSort(containers) {
  const sorted = [];
  const visited = new Set();
  const visiting = new Set();

  function visit(container) {
    if (visited.has(container.container_id)) return;
    if (visiting.has(container.container_id))
      throw new Error(
        `Circular dependency detected: ${container.container_id}`
      );

    visiting.add(container.container_id);
    const deps = container.depends_on || [];
    for (const dep of deps) {
      const depId = typeof dep === "string" ? dep : dep.container_id;
      const depContainer = containers.find((c) => c.container_id === depId);
      if (depContainer) visit(depContainer);
    }

    visiting.delete(container.container_id);
    visited.add(container.container_id);
    sorted.push(container);
  }

  for (const container of containers) visit(container);
  return sorted;
}

/**
 * Wait for a dependency on another container to satisfy a condition.
 * Supported conditions: 'started', 'healthy', 'completed'
 * @param {Object} containerGroup
 * @param {string|Object} dependency
 * @param {Map} startedContainers
 * @returns {Promise<void>}
 */
async function waitForDependency(
  containerGroup,
  dependency,
  startedContainers
) {
  const depContainerId =
    typeof dependency === "string" ? dependency : dependency.container_id;
  const condition =
    typeof dependency === "object" ? dependency.condition : "started";
  const timeout =
    typeof dependency === "object" ? (dependency.timeout || 30) * 1000 : 30000;
  const retries = typeof dependency === "object" ? dependency.retry || 3 : 3;
  const retryInterval =
    typeof dependency === "object"
      ? (dependency.retry_interval || 2) * 1000
      : 2000;

  logger.info(
    `Waiting for dependency ${depContainerId} (condition: ${condition})`
  );

  const depContainer = containerGroup.containers.find(
    (c) => c.containerId === depContainerId
  );
  if (!depContainer)
    throw new Error(`Dependency container ${depContainerId} not found`);

  const depState = startedContainers.get(depContainerId);
  if (!depState)
    throw new Error(`Dependency container ${depContainerId} not yet started`);

  const dockerContainer = docker.getContainer(depContainer.dockerContainerId);
  const startTime = Date.now();

  switch (condition) {
    case "started":
      for (let attempt = 0; attempt < retries; attempt++) {
        try {
          const info = await dockerContainer.inspect();
          if (info.State.Running) {
            logger.info(`Dependency ${depContainerId} is started`);
            return;
          }
        } catch (err) {
          logger.debug(
            `Attempt ${attempt + 1}/${retries} failed:`,
            err.message
          );
        }

        if (Date.now() - startTime > timeout)
          throw new Error(`Timeout waiting for ${depContainerId} to start`);
        await new Promise((resolve) => setTimeout(resolve, retryInterval));
      }
      throw new Error(
        `Container ${depContainerId} failed to start after ${retries} retries`
      );

    case "completed":
      try {
        const result = await Promise.race([
          dockerContainer.wait(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), timeout)
          ),
        ]);

        logger.info(
          `Dependency ${depContainerId} completed with status ${result.StatusCode}`
        );
        return;
      } catch (err) {
        if (err.message === "Timeout")
          throw new Error(`Timeout waiting for ${depContainerId} to complete`);
        throw err;
      }

    case "healthy":
      for (let attempt = 0; attempt < retries; attempt++) {
        try {
          const info = await dockerContainer.inspect();
          if (info.State.Health && info.State.Health.Status === "healthy") {
            logger.info(`Dependency ${depContainerId} is healthy`);
            return;
          }
        } catch (err) {
          logger.debug(
            `Health attempt ${attempt + 1}/${retries} failed:`,
            err.message
          );
        }

        if (Date.now() - startTime > timeout)
          throw new Error(
            `Timeout waiting for ${depContainerId} to become healthy`
          );
        await new Promise((resolve) => setTimeout(resolve, retryInterval));
      }
      throw new Error(
        `Container ${depContainerId} failed to become healthy after ${retries} retries`
      );

    default:
      logger.warn(
        `Unknown dependency condition: ${condition}, treating as 'started'`
      );
      return waitForDependency(
        containerGroup,
        {
          container_id: depContainerId,
          condition: "started",
          timeout: timeout / 1000,
        },
        startedContainers
      );
  }
}

module.exports = {
  topologicalSort,
  waitForDependency,
};
