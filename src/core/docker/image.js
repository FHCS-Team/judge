const path = require("path");
const fs = require("fs/promises");
const logger = require("../../utils/logger");
const dockerClient = require("./client");

/**
 * Build a Docker image from a directory containing a Dockerfile
 * @param {string} contextPath - Path to build context (directory containing Dockerfile)
 * @param {string} imageName - Name and tag for the image (e.g., "problem-two-sum:latest")
 * @param {Object} options - Build options
 * @param {number} [options.buildTimeout] - Build timeout in milliseconds
 * @param {Object} [options.buildArgs] - Build arguments
 * @returns {Promise<string>} Image name
 */
async function buildImage(contextPath, imageName, options = {}) {
  const { buildTimeout = 600000, buildArgs = {} } = options;

  logger.info(`Building Docker image: ${imageName}`, {
    contextPath,
    imageName,
    buildTimeout,
  });

  try {
    const docker = dockerClient.getClient();

    // Verify Dockerfile exists
    const dockerfilePath = path.join(contextPath, "Dockerfile");
    await fs.access(dockerfilePath);

    // Create tar stream from context
    const tar = require("tar-fs");
    const tarStream = tar.pack(contextPath);

    // Build image
    const stream = await docker.buildImage(tarStream, {
      t: imageName,
      buildargs: buildArgs,
      labels: {
        "judgehost.type": "problem",
        "judgehost.built_at": new Date().toISOString(),
      },
    });

    // Wait for build to complete with timeout
    await new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Build timeout after ${buildTimeout}ms`));
      }, buildTimeout);

      docker.modem.followProgress(
        stream,
        (err, res) => {
          clearTimeout(timeoutId);
          if (err) {
            reject(err);
          } else {
            resolve(res);
          }
        },
        (event) => {
          if (event.stream) {
            logger.debug(`Docker build: ${event.stream.trim()}`);
          }
          if (event.error) {
            logger.error(`Docker build error: ${event.error}`);
          }
        }
      );
    });

    logger.info(`Successfully built Docker image: ${imageName}`);
    return imageName;
  } catch (error) {
    logger.error(`Failed to build Docker image ${imageName}:`, error);
    throw error;
  }
}

/**
 * Backwards-compatible adapter for image building. Prefer centralized
 * containerBuilder for all builds to avoid duplication.
 */

/**
 * Build a problem image from a packaged problem directory.
 * Delegates to buildImage.
 * @param {string} problemId
 * @param {string} problemPackagePath
 * @param {Object} [options]
 * @returns {Promise<string>} image name
 */
async function buildProblemImage(problemId, problemPackagePath, options = {}) {
  const imageName = `problem-${problemId}:latest`;
  return buildImage(problemPackagePath, imageName, options);
}

/**
 * Build a named container image from a context path.
 * @param {string} problemId
 * @param {string} containerId
 * @param {string} containerPath
 * @param {Object} [options]
 * @returns {Promise<string>} image name
 */
async function buildContainerImage(
  problemId,
  containerId,
  containerPath,
  options = {}
) {
  const imageName = `judgehost-${problemId}-${containerId}:latest`;
  return buildImage(containerPath, imageName, options);
}

/**
 * Build a submission image on top of an existing problem image.
 * @param {string} problemImage - base problem image
 * @param {string} submissionId
 * @param {string} submissionPath
 * @param {Object} [options]
 * @returns {Promise<string>} image name
 */
async function buildSubmissionImage(
  problemImage,
  submissionId,
  submissionPath,
  options = {}
) {
  const imageName = `submission-${submissionId}:latest`;

  try {
    const docker = dockerClient.getClient();

    // Create a Dockerfile that extends the problem image
    const dockerfileContent = `
FROM ${problemImage}
COPY . /submission
WORKDIR /submission
`;

    const dockerfilePath = path.join(submissionPath, "Dockerfile.submission");
    await fs.writeFile(dockerfilePath, dockerfileContent);

    // Build the submission image
    const result = await buildImage(submissionPath, imageName, options);

    // Cleanup temporary Dockerfile
    await fs.rm(dockerfilePath, { force: true }).catch(() => {});

    return result;
  } catch (err) {
    logger.error("Error in buildSubmissionImage:", err);
    throw err;
  } finally {
    // best-effort cleanup: if a temporary working dir was provided, try to remove
    if (options.tempDir) {
      await fs
        .rm(path.resolve(options.tempDir), { recursive: true, force: true })
        .catch(() => {});
    }
  }
}

module.exports = {
  buildImage,
  buildProblemImage,
  buildContainerImage,
  buildSubmissionImage,
};
