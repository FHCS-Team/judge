const path = require("path");
const fs = require("fs");
const util = require("util");
const crypto = require("crypto");

const logger = require("./utils/logger");
const {
  createContainer,
  startContainer,
  stopContainer,
  removeContainer,
  buildImage,
} = require("./docker/container");
const { executeCommand } = require("./docker/exec");
const { createNetwork, removeNetwork } = require("./docker/network");
const { docker } = require("./docker/index");
const { validateProblemConfig } = require("./types/schemaRegistry");
const { ArchiveManager } = require("./utils/archive");
const { Downloader } = require("./utils/downloader");

/**
 * Judge Processor - implements the FHCS Judge workflow
 *
 * Workflow steps (see docs/workflow.md):
 * 1. Submit problem package (received via AMQP messages)
 * 2. Validate package
 * 3. Build problem images (both build and eval stages)
 * 4. Submit submission (received via AMQP messages)
 * 5. Build evaluation containers
 * 6. Run evaluation
 * 7. Execute hooks
 * 8. Collect results
 * 9. Report results
 */

class JudgeProcessor {
  constructor(options = {}) {
    this.dataDir = options.dataDir || path.resolve(process.cwd(), "data");
    this.tempDir = options.tempDir || path.resolve(this.dataDir, "temp");
    this.problemsDir = path.resolve(this.dataDir, "problems");
    this.submissionsDir = path.resolve(this.dataDir, "submissions");
    this.artifactsDir = path.resolve(this.dataDir, "artifacts");

    // Ensure directories exist
    this.ensureDirectories();
  }

  async ensureDirectories() {
    const dirs = [
      this.dataDir,
      this.tempDir,
      this.problemsDir,
      this.submissionsDir,
      this.artifactsDir,
    ];
    for (const dir of dirs) {
      await fs.promises.mkdir(dir, { recursive: true });
    }
  }

  /**
   * Step 1 & 2: Submit and validate problem package
   * @param {Object} packageData - Problem package data from AMQP message
   * @param {string} packageData.problem_id - Problem identifier
   * @param {string} packageData.archive_url - URL to download package archive
   * @param {Buffer|string} packageData.archive_data - Direct archive data (alternative to URL)
   */
  async submitProblemPackage(packageData) {
    const { problem_id, archive_url, archive_data } = packageData;

    logger.info(
      { problem_id, archive_url: !!archive_url, archive_data: !!archive_data },
      "Processing problem package submission",
    );

    const problemDir = path.resolve(this.problemsDir, problem_id);

    try {
      // Download or extract package
      if (archive_url) {
        const downloader = new Downloader();
        const archiveFile = path.resolve(
          this.tempDir,
          `${problem_id}-${Date.now()}.tar.gz`,
        );
        await downloader.downloadFile(archive_url, archiveFile);

        const archiver = new ArchiveManager();
        await archiver.extractArchive(archiveFile, problemDir);
        await fs.promises.unlink(archiveFile); // cleanup
      } else if (archive_data) {
        const archiver = new ArchiveManager();
        await archiver.extractBuffer(archive_data, problemDir);
      } else {
        throw new Error("Either archive_url or archive_data must be provided");
      }

      // Validate package structure and config
      await this.validateProblemPackage(problemDir);

      logger.info(
        { problem_id, problemDir },
        "Problem package validated and stored",
      );
      return { status: "success", problem_id, problemDir };
    } catch (error) {
      logger.error(
        { problem_id, error: error.message },
        "Failed to process problem package",
      );
      throw error;
    }
  }

  /**
   * Step 2: Validate problem package structure and configuration
   * @param {string} problemDir - Path to extracted problem package
   */
  async validateProblemPackage(problemDir) {
    // Check if config.json exists
    const configPath = path.resolve(problemDir, "config.json");
    if (!(await this.fileExists(configPath))) {
      throw new Error("Problem package missing config.json");
    }

    // Load and validate config against schema
    const config = JSON.parse(await fs.promises.readFile(configPath, "utf8"));
    const validation = validateProblemConfig(config);
    if (!validation.valid) {
      throw new Error(
        `Invalid problem configuration: ${validation.errors.join(", ")}`,
      );
    }

    // Validate container structure
    for (const container of config.containers) {
      const containerDir = path.resolve(
        problemDir,
        "containers",
        container.container_id,
      );

      // Check required files exist
      const evalDockerfile = path.resolve(containerDir, "Dockerfile.eval");
      const evalEntrypoint = path.resolve(containerDir, "entrypoint.eval.sh");

      if (!(await this.fileExists(evalDockerfile))) {
        throw new Error(
          `Container ${container.container_id} missing Dockerfile.eval`,
        );
      }
      if (!(await this.fileExists(evalEntrypoint))) {
        throw new Error(
          `Container ${container.container_id} missing entrypoint.eval.sh`,
        );
      }
    }

    logger.info({ problemDir }, "Problem package validation passed");
  }

  /**
   * Step 3: Build problem images for both build and eval stages
   * @param {string} problem_id - Problem identifier
   */
  async buildProblemImages(problem_id) {
    const problemDir = path.resolve(this.problemsDir, problem_id);
    const configPath = path.resolve(problemDir, "config.json");
    const config = JSON.parse(await fs.promises.readFile(configPath, "utf8"));

    // Use the actual problem_id from config for image tagging
    const actualProblemId = config.problem_id || problem_id;

    const buildResults = {};

    logger.info({ problem_id: actualProblemId }, "Building problem images");

    for (const container of config.containers) {
      const containerId = container.container_id;
      const containerDir = path.resolve(problemDir, "containers", containerId);

      // Handle legacy structure where containers are at root level
      let actualContainerDir = containerDir;
      if (!(await this.fileExists(containerDir))) {
        // Try looking for directory matching container_id at package root
        const legacyContainerDir = path.resolve(problemDir, containerId);
        if (await this.fileExists(legacyContainerDir)) {
          actualContainerDir = legacyContainerDir;
        }
      }

      buildResults[containerId] = {
        build_stage: null,
        eval_stage: null,
      };

      // Build stage (optional)
      const buildDockerfile = path.resolve(
        actualContainerDir,
        "Dockerfile.build",
      );
      if (await this.fileExists(buildDockerfile)) {
        const buildContext = container.build_stage?.context
          ? path.resolve(problemDir, container.build_stage.context)
          : actualContainerDir;
        const buildTag = `judge-${actualProblemId}-${containerId}-build:latest`;

        try {
          await buildImage(buildTag, buildDockerfile, buildContext);
          buildResults[containerId].build_stage = {
            status: "success",
            tag: buildTag,
            dockerfile: buildDockerfile,
            context: buildContext,
          };
          logger.info(
            { containerId, buildTag },
            "Build stage image built successfully",
          );
        } catch (error) {
          buildResults[containerId].build_stage = {
            status: "error",
            error: error.message,
          };
          logger.error(
            { containerId, error: error.message },
            "Build stage image build failed",
          );
        }
      }

      // Eval stage (required) - try different dockerfile names
      let evalDockerfile = path.resolve(actualContainerDir, "Dockerfile.eval");
      if (!(await this.fileExists(evalDockerfile))) {
        // Fallback to regular Dockerfile
        evalDockerfile = path.resolve(actualContainerDir, "Dockerfile");
        if (!(await this.fileExists(evalDockerfile))) {
          // Try dockerfile_path from config
          if (container.dockerfile_path) {
            evalDockerfile = path.resolve(
              problemDir,
              container.dockerfile_path,
            );
          }
        }
      }

      if (await this.fileExists(evalDockerfile)) {
        const evalContext = container.eval_stage?.context
          ? path.resolve(problemDir, container.eval_stage.context)
          : actualContainerDir;
        const evalTag = `judge-${actualProblemId}-${containerId}-eval:latest`;

        try {
          await buildImage(evalTag, evalDockerfile, evalContext);
          buildResults[containerId].eval_stage = {
            status: "success",
            tag: evalTag,
            dockerfile: evalDockerfile,
            context: evalContext,
          };
          logger.info(
            { containerId, evalTag },
            "Eval stage image built successfully",
          );
        } catch (error) {
          buildResults[containerId].eval_stage = {
            status: "error",
            error: error.message,
          };
          logger.error(
            { containerId, error: error.message },
            "Eval stage image build failed",
          );
          throw error; // Eval stage is required
        }
      } else {
        const error = `No Dockerfile found for container ${containerId}`;
        buildResults[containerId].eval_stage = {
          status: "error",
          error,
        };
        logger.error({ containerId }, error);
        throw new Error(error);
      }
    }

    return buildResults;
  }

  /**
   * Step 4: Submit submission package
   * @param {Object} submissionData - Submission data from AMQP message
   */
  async submitSubmission(submissionData) {
    const { submission_id, problem_id, archive_url, archive_data, team_id } =
      submissionData;

    logger.info(
      { submission_id, problem_id, team_id },
      "Processing submission",
    );

    const submissionDir = path.resolve(
      this.submissionsDir,
      problem_id,
      submission_id,
    );

    try {
      await fs.promises.mkdir(submissionDir, { recursive: true });

      // Download or extract submission
      if (archive_url) {
        const downloader = new Downloader();
        const archiveFile = path.resolve(
          this.tempDir,
          `${submission_id}-${Date.now()}.tar.gz`,
        );
        await downloader.downloadFile(archive_url, archiveFile);

        const archiver = new ArchiveManager();
        await archiver.extractArchive(archiveFile, submissionDir);
        await fs.promises.unlink(archiveFile);
      } else if (archive_data) {
        const archiver = new ArchiveManager();
        await archiver.extractBuffer(archive_data, submissionDir);
      } else {
        throw new Error("Either archive_url or archive_data must be provided");
      }

      logger.info(
        { submission_id, problem_id, submissionDir },
        "Submission stored",
      );
      return { status: "success", submission_id, problem_id, submissionDir };
    } catch (error) {
      logger.error(
        { submission_id, problem_id, error: error.message },
        "Failed to process submission",
      );
      throw error;
    }
  }

  /**
   * Steps 5-9: Run complete evaluation pipeline
   * @param {Object} evaluationRequest - Evaluation request
   */
  async runEvaluation(evaluationRequest) {
    const { submission_id, problem_id, team_id } = evaluationRequest;
    const evaluationId = `eval-${submission_id}-${Date.now()}`;

    logger.info(
      { evaluationId, submission_id, problem_id },
      "Starting evaluation",
    );

    const problemDir = path.resolve(this.problemsDir, problem_id);
    const submissionDir = path.resolve(
      this.submissionsDir,
      problem_id,
      submission_id,
    );
    const artifactsDir = path.resolve(this.artifactsDir, evaluationId);

    // Ensure directories exist
    await fs.promises.mkdir(artifactsDir, { recursive: true });

    const configPath = path.resolve(problemDir, "config.json");
    const config = JSON.parse(await fs.promises.readFile(configPath, "utf8"));

    const result = {
      evaluation_id: evaluationId,
      submission_id,
      problem_id,
      team_id,
      status: "running",
      started_at: new Date().toISOString(),
      containers: {},
      rubrics: {},
      metadata: {},
    };

    let networkName = null;
    let runningContainers = [];

    try {
      // Step 5: Create evaluation network if multi-container
      if (config.containers.length > 1) {
        networkName = `judge-eval-${evaluationId}`;
        await createNetwork(networkName);
        logger.info({ networkName }, "Created evaluation network");
      }

      // Step 6: Run evaluation containers
      const containerResults = await this.runEvaluationContainers(
        config,
        problemDir,
        submissionDir,
        artifactsDir,
        networkName,
        evaluationId,
      );

      result.containers = containerResults.containers;
      runningContainers = containerResults.runningContainers;

      // Step 7: Execute hooks and collect results
      await this.executeHooks(config, runningContainers, artifactsDir);

      // Step 8: Collect evaluation artifacts and generate rubric results
      await this.collectResults(config, artifactsDir, result);

      result.status = "completed";
      result.completed_at = new Date().toISOString();
    } catch (error) {
      result.status = "failed";
      result.error = error.message;
      result.failed_at = new Date().toISOString();
      logger.error({ evaluationId, error: error.message }, "Evaluation failed");
    } finally {
      // Cleanup: Stop containers and remove network
      await this.cleanup(runningContainers, networkName);
    }

    // Step 9: Write final result
    await this.writeEvaluationResult(artifactsDir, result);

    logger.info(
      { evaluationId, status: result.status },
      "Evaluation completed",
    );
    return result;
  }

  /**
   * Run evaluation containers with proper mount layout
   */
  async runEvaluationContainers(
    config,
    problemDir,
    submissionDir,
    artifactsDir,
    networkName,
    evaluationId,
  ) {
    const containers = {};
    const runningContainers = [];

    // Sort containers by dependencies
    const sortedContainers = this.topologicalSort(config.containers);

    for (const container of sortedContainers) {
      const containerId = container.container_id;
      const containerTag = `judge-${config.problem_id}-${containerId}-eval:latest`;
      const containerArtifactsDir = path.resolve(artifactsDir, containerId);

      await fs.promises.mkdir(containerArtifactsDir, { recursive: true });

      // Ensure artifacts directory has proper permissions and create logs/rubrics subdirectories
      await fs.promises.chmod(containerArtifactsDir, 0o777);
      const logsDir = path.resolve(containerArtifactsDir, "logs");
      const rubricsDir = path.resolve(containerArtifactsDir, "rubrics");
      await fs.promises.mkdir(logsDir, { recursive: true });
      await fs.promises.mkdir(rubricsDir, { recursive: true });
      await fs.promises.chmod(logsDir, 0o777);
      await fs.promises.chmod(rubricsDir, 0o777);

      // Prepare volume mounts according to container_internal.md
      const mounts = await this.prepareMounts(
        container,
        problemDir,
        submissionDir,
        containerArtifactsDir,
        config,
      );

      // Create container
      const dockerContainerId = await this.createEvaluationContainer(
        containerTag,
        container,
        mounts,
        networkName,
        containerId,
      );

      containers[containerId] = {
        docker_id: dockerContainerId,
        status: "created",
        artifacts_dir: containerArtifactsDir,
      };

      runningContainers.push({
        id: dockerContainerId,
        container_id: containerId,
        config: container,
      });

      // Start container
      await startContainer(dockerContainerId);
      containers[containerId].status = "running";

      // Wait for dependencies if specified
      if (container.depends_on) {
        await this.waitForDependencies(
          dockerContainerId,
          container.depends_on,
          runningContainers,
        );
      }

      logger.info(
        { containerId, docker_id: dockerContainerId },
        "Container started",
      );
    }

    return { containers, runningContainers };
  }

  /**
   * Prepare volume mounts according to container_internal.md specification
   */
  async prepareMounts(
    container,
    problemDir,
    submissionDir,
    artifactsDir,
    config,
  ) {
    const containerId = container.container_id;
    const containerProblemDir = path.resolve(
      problemDir,
      "containers",
      containerId,
    );

    // Handle legacy structure where containers are at root level
    let actualContainerDir = containerProblemDir;
    if (!(await this.fileExists(containerProblemDir))) {
      const legacyContainerDir = path.resolve(problemDir, containerId);
      if (await this.fileExists(legacyContainerDir)) {
        actualContainerDir = legacyContainerDir;
      }
    }

    const sharedDir = path.resolve(problemDir, "shared");

    const mounts = [
      // /workspace/problem (RO) - container-specific files
      `${actualContainerDir}:/workspace/problem:ro`,

      // /workspace/artifacts (RW) - output artifacts
      `${artifactsDir}:/workspace/artifacts:rw`,

      // /workspace/shared (RO) - shared files between containers (if exists)
      ...((await this.fileExists(sharedDir))
        ? [`${sharedDir}:/workspace/shared:ro`]
        : []),
    ];

    // Mount submission directory based on container configuration
    if (container.accepts_submission) {
      // For containers that accept submissions, mount the actual submission
      const mountPath =
        container.mount_submission_at || "/workspace/submission";
      mounts.push(`${submissionDir}:${mountPath}:ro`);
    } else {
      // For containers that don't accept submissions, check if there's a template submission
      const templateSubmissionDir = path.resolve(
        actualContainerDir,
        "submission",
      );
      if (await this.fileExists(templateSubmissionDir)) {
        const mountPath =
          container.mount_submission_at || "/workspace/submission";
        mounts.push(`${templateSubmissionDir}:${mountPath}:ro`);
      }
    }

    // Copy problem config.json to artifacts dir so it's available in /workspace
    const configSource = path.resolve(problemDir, "config.json");
    const configDest = path.resolve(artifactsDir, "config.json");
    await fs.promises.copyFile(configSource, configDest);

    // Add additional mounts if specified in container config
    if (container.additional_mounts) {
      for (const mount of container.additional_mounts) {
        const sourcePath = path.resolve(problemDir, mount.path);
        const targetPath = mount.container_path || `/workspace/${mount.path}`;
        const mode = mount.mode || "ro";

        if (await this.fileExists(sourcePath)) {
          mounts.push(`${sourcePath}:${targetPath}:${mode}`);
        }
      }
    }

    return mounts;
  }

  /**
   * Create evaluation container with proper configuration
   */
  async createEvaluationContainer(
    image,
    containerConfig,
    mounts,
    networkName,
    alias,
  ) {
    // Check if entrypoint exists in the container directory
    let cmd = ["/workspace/entrypoint.eval.sh"];

    // For legacy packages or containers without entrypoint, use sleep to keep container running
    const problemMount = mounts.find((m) => m.includes("/workspace/problem"));
    if (problemMount) {
      const problemDir = problemMount.split(":")[0];
      const entrypointPath = path.resolve(problemDir, "entrypoint.eval.sh");
      if (!(await this.fileExists(entrypointPath))) {
        cmd = ["sleep", "3600"]; // Keep container alive for 1 hour
      }
    }

    const createOptions = {
      Image: image,
      WorkingDir: "/workspace",
      Cmd: cmd,
      Env: this.prepareEnvironment(containerConfig),
      ExposedPorts: containerConfig.port
        ? { [`${containerConfig.port}/tcp`]: {} }
        : undefined,
      HostConfig: {
        Binds: mounts,
        AutoRemove: false,
        Memory: this.parseMemoryLimit(
          containerConfig.eval_stage?.resource_limits?.memory,
        ),
        CpuShares: this.parseCpuLimit(
          containerConfig.eval_stage?.resource_limits?.cpus,
        ),
        NetworkMode: networkName || "bridge",
        PortBindings: containerConfig.port
          ? {
              [`${containerConfig.port}/tcp`]: [{ HostPort: "0" }],
            }
          : undefined,
      },
      NetworkingConfig: networkName
        ? {
            EndpointsConfig: {
              [networkName]: {
                Aliases: [alias],
              },
            },
          }
        : undefined,
      Healthcheck: containerConfig.health_check
        ? {
            Test: containerConfig.health_check.command,
            Interval:
              (containerConfig.health_check.interval || 30) * 1000000000, // nanoseconds
            Timeout: (containerConfig.health_check.timeout || 30) * 1000000000,
            Retries: containerConfig.health_check.retries || 3,
            StartPeriod:
              (containerConfig.health_check.start_period || 0) * 1000000000,
          }
        : undefined,
    };

    const dockerContainer = await createContainer(createOptions);
    return dockerContainer;
  }

  /**
   * Execute hooks (pre, post, periodic) as defined in the problem package
   */
  async executeHooks(config, runningContainers, artifactsDir) {
    const hooksConfig = config.hooks_config || {};

    for (const containerInfo of runningContainers) {
      const {
        id: dockerId,
        container_id: containerId,
        config: containerConfig,
      } = containerInfo;
      const containerArtifactsDir = path.resolve(artifactsDir, containerId);

      // Execute pre hooks
      await this.executeContainerHooks(
        dockerId,
        "pre",
        containerArtifactsDir,
        hooksConfig,
      );

      // Execute post hooks
      await this.executeContainerHooks(
        dockerId,
        "post",
        containerArtifactsDir,
        hooksConfig,
      );

      // Periodic hooks would be handled separately in a background process
    }
  }

  /**
   * Execute hooks of a specific type for a container
   */
  async executeContainerHooks(dockerId, hookType, artifactsDir, hooksConfig) {
    const problemHooksDir = `/workspace/problem/hooks/${hookType}`;
    const workingHooksDir = `/workspace/tmp/hooks/${hookType}`;

    try {
      // First, copy hooks from problem directory to working directory to make them writable
      await executeCommand(
        dockerId,
        `mkdir -p ${workingHooksDir} && cp -r ${problemHooksDir}/* ${workingHooksDir}/ 2>/dev/null || true`,
      );

      // List hook files from working directory
      const listResult = await executeCommand(
        dockerId,
        `find ${workingHooksDir} -name "*.sh" -type f 2>/dev/null | sort`,
      );
      if (listResult.ExitCode !== 0) {
        logger.debug({ dockerId, hookType }, "No hooks directory found");
        return;
      }

      const hookFiles = listResult.stdout
        .trim()
        .split("\n")
        .filter((f) => f);

      for (const hookFile of hookFiles) {
        const hookName = path.basename(hookFile);
        logger.info({ dockerId, hookType, hookName }, "Executing hook");

        try {
          const result = await executeCommand(
            dockerId,
            `chmod +x ${hookFile} && ${hookFile}`,
            {
              timeout: (hooksConfig.timeout_seconds || 30) * 1000,
              WorkingDir: "/workspace",
            },
          );

          // Save hook results
          const hookResult = {
            hook_name: hookName,
            hook_type: hookType,
            exit_code: result.ExitCode,
            stdout: result.stdout,
            stderr: result.stderr,
            executed_at: new Date().toISOString(),
          };

          // Create logs directory if it doesn't exist
          const logsDir = path.resolve(artifactsDir, "logs");
          await fs.promises.mkdir(logsDir, { recursive: true });

          const hookResultFile = path.resolve(
            logsDir,
            `hook_${hookType}_${hookName.replace(".sh", "")}.json`,
          );
          await fs.promises.writeFile(
            hookResultFile,
            JSON.stringify(hookResult, null, 2),
          );

          logger.info(
            { dockerId, hookType, hookName, exitCode: result.ExitCode },
            "Hook executed",
          );
        } catch (hookError) {
          logger.error(
            { dockerId, hookType, hookName, error: hookError.message },
            "Hook execution failed",
          );

          if (!hooksConfig.continue_on_error) {
            throw hookError;
          }
        }
      }
    } catch (error) {
      logger.error(
        { dockerId, hookType, error: error.message },
        "Hook execution error",
      );
      if (!hooksConfig.continue_on_error) {
        throw error;
      }
    }
  }

  /**
   * Collect evaluation results and generate rubric scores
   */
  async collectResults(config, artifactsDir, result) {
    // Collect container logs and artifacts
    for (const containerId of Object.keys(result.containers)) {
      const containerArtifactsDir = path.resolve(artifactsDir, containerId);
      const containerResult = result.containers[containerId];

      try {
        // Collect container logs
        const dockerContainer = docker.getContainer(containerResult.docker_id);
        const logs = await dockerContainer.logs({
          stdout: true,
          stderr: true,
          timestamps: true,
        });

        const logFile = path.resolve(containerArtifactsDir, "container.log");
        await fs.promises.writeFile(logFile, logs);

        // List artifacts produced
        const artifacts = await this.listArtifacts(containerArtifactsDir);
        containerResult.artifacts = artifacts;
      } catch (error) {
        logger.error(
          { containerId, error: error.message },
          "Failed to collect container results",
        );
      }
    }

    // Process rubrics
    if (config.rubrics) {
      for (const rubric of config.rubrics) {
        const rubricResult = await this.processRubric(rubric, artifactsDir);
        result.rubrics[rubric.rubric_id] = rubricResult;
      }
    }

    // Calculate total score
    const rubricScores = Object.values(result.rubrics);
    result.total_score = rubricScores.reduce(
      (sum, r) => sum + (r.score || 0),
      0,
    );
    result.max_score = rubricScores.reduce(
      (sum, r) => sum + (r.max_score || 0),
      0,
    );
    result.percentage =
      result.max_score > 0 ? (result.total_score / result.max_score) * 100 : 0;
  }

  /**
   * Process individual rubric and calculate score
   */
  async processRubric(rubric, artifactsDir) {
    // Look for rubric output in all container artifacts directories
    let rubricOutputFile = null;
    const outputFileName =
      rubric.output_file || `rubric_${rubric.rubric_id}.json`;

    // Check in the main artifacts directory first
    const mainRubricPath = path.resolve(artifactsDir, outputFileName);
    if (await this.fileExists(mainRubricPath)) {
      rubricOutputFile = mainRubricPath;
    } else {
      // Check in container-specific artifacts/rubrics directories
      const containerDirs = await fs.promises.readdir(artifactsDir, {
        withFileTypes: true,
      });
      for (const dir of containerDirs) {
        if (dir.isDirectory()) {
          const containerRubricPath = path.resolve(
            artifactsDir,
            dir.name,
            "rubrics",
            outputFileName,
          );
          if (await this.fileExists(containerRubricPath)) {
            rubricOutputFile = containerRubricPath;
            break;
          }
        }
      }
    }

    let rubricResult = {
      rubric_id: rubric.rubric_id,
      rubric_name: rubric.rubric_name,
      rubric_type: rubric.rubric_type,
      max_score: rubric.max_score,
      score: 0,
      status: "not_found",
      output_file: outputFileName,
    };

    try {
      if (rubricOutputFile) {
        const rubricData = JSON.parse(
          await fs.promises.readFile(rubricOutputFile, "utf8"),
        );
        rubricResult = { ...rubricResult, ...rubricData, status: "completed" };
        logger.info(
          {
            rubric_id: rubric.rubric_id,
            score: rubricResult.score,
            max_score: rubric.max_score,
          },
          "Rubric processed",
        );
      } else {
        logger.warn(
          { rubric_id: rubric.rubric_id, output_file: outputFileName },
          "Rubric output file not found",
        );
      }
    } catch (error) {
      logger.error(
        { rubric_id: rubric.rubric_id, error: error.message },
        "Failed to process rubric",
      );
      rubricResult.status = "error";
      rubricResult.error = error.message;
    }

    return rubricResult;
  }

  /**
   * Cleanup containers and network
   */
  async cleanup(runningContainers, networkName) {
    // Stop and remove containers
    for (const containerInfo of runningContainers) {
      try {
        await stopContainer(containerInfo.id);
        await removeContainer(containerInfo.id);
        logger.debug(
          { container_id: containerInfo.container_id },
          "Container cleaned up",
        );
      } catch (error) {
        logger.error(
          { container_id: containerInfo.container_id, error: error.message },
          "Failed to cleanup container",
        );
      }
    }

    // Remove network
    if (networkName) {
      try {
        await removeNetwork(networkName);
        logger.debug({ networkName }, "Network cleaned up");
      } catch (error) {
        logger.error(
          { networkName, error: error.message },
          "Failed to cleanup network",
        );
      }
    }
  }

  /**
   * Write final evaluation result
   */
  async writeEvaluationResult(artifactsDir, result) {
    const resultFile = path.resolve(artifactsDir, "result.json");
    await fs.promises.writeFile(resultFile, JSON.stringify(result, null, 2));
    logger.info({ resultFile }, "Evaluation result written");
  }

  // Utility methods

  async fileExists(filePath) {
    try {
      await fs.promises.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async listArtifacts(dir) {
    try {
      const files = await fs.promises.readdir(dir, { recursive: true });
      return files.filter((f) => !f.endsWith("/"));
    } catch {
      return [];
    }
  }

  topologicalSort(containers) {
    // Simple topological sort based on depends_on
    const sorted = [];
    const visited = new Set();
    const visiting = new Set();

    const visit = (container) => {
      if (visiting.has(container.container_id)) {
        throw new Error(
          `Circular dependency detected involving ${container.container_id}`,
        );
      }
      if (visited.has(container.container_id)) {
        return;
      }

      visiting.add(container.container_id);

      if (container.depends_on) {
        for (const depId of container.depends_on) {
          const dep = containers.find((c) => c.container_id === depId);
          if (dep) {
            visit(dep);
          }
        }
      }

      visiting.delete(container.container_id);
      visited.add(container.container_id);
      sorted.push(container);
    };

    for (const container of containers) {
      visit(container);
    }

    return sorted;
  }

  async waitForDependencies(dockerId, dependencies, runningContainers) {
    for (const depId of dependencies) {
      const dep = runningContainers.find((c) => c.container_id === depId);
      if (!dep) {
        logger.warn(
          { container_id: dockerId, dependency: depId },
          "Dependency not found in running containers",
        );
        continue;
      }

      logger.info(
        { container_id: dockerId, dependency: depId },
        "Waiting for dependency",
      );

      // Try to wait using health check first
      const depContainer = docker.getContainer(dep.id);
      let healthy = false;

      try {
        // Wait for health check if configured
        const depConfig = dep.config;
        if (depConfig.health_check) {
          healthy = await this.waitForHealthCheck(dep.id, 60000);
        }
      } catch (error) {
        logger.debug(
          { dependency: depId, error: error.message },
          "Health check failed, trying connectivity check",
        );
      }

      // Fallback to basic connectivity check
      if (!healthy && dep.config.port) {
        healthy = await this.waitForContainer(dockerId, depId, dep.config.port);
      }

      if (!healthy) {
        logger.warn(
          { container_id: dockerId, dependency: depId },
          "Dependency not ready, continuing anyway",
        );
      }
    }
  }

  async waitForHealthCheck(containerId, timeout = 60000) {
    const start = Date.now();
    const container = docker.getContainer(containerId);

    while (Date.now() - start < timeout) {
      try {
        const info = await container.inspect();
        const health = info.State.Health;

        if (health && health.Status === "healthy") {
          return true;
        }

        if (health && health.Status === "unhealthy") {
          logger.warn({ containerId }, "Container is unhealthy");
          return false;
        }
      } catch (error) {
        logger.debug(
          { containerId, error: error.message },
          "Health check error",
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    return false;
  }

  async waitForContainer(
    fromContainer,
    targetContainerId,
    targetPort = 80,
    timeout = 60000,
  ) {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      try {
        // Try basic connectivity
        const result = await executeCommand(
          fromContainer,
          `timeout 5 bash -c "cat < /dev/tcp/${targetContainerId}/${targetPort}" 2>/dev/null || echo "not_ready"`,
          { timeout: 6000 },
        );

        if (result.ExitCode === 0 && !result.stdout.includes("not_ready")) {
          return true;
        }
      } catch (error) {
        // Continue waiting
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    return false;
  }

  prepareEnvironment(containerConfig) {
    const env = [];

    // Add container-specific environment variables
    if (containerConfig.eval_stage?.environment) {
      for (const [key, value] of Object.entries(
        containerConfig.eval_stage.environment,
      )) {
        env.push(`${key}=${value}`);
      }
    }

    return env;
  }

  parseMemoryLimit(memoryStr) {
    if (!memoryStr) return undefined;

    const match = memoryStr.match(/^(\d+)([kmg]?)b?$/i);
    if (!match) return undefined;

    const [, amount, unit] = match;
    const bytes = parseInt(amount);

    switch (unit.toLowerCase()) {
      case "k":
        return bytes * 1024;
      case "m":
        return bytes * 1024 * 1024;
      case "g":
        return bytes * 1024 * 1024 * 1024;
      default:
        return bytes;
    }
  }

  parseCpuLimit(cpuStr) {
    if (!cpuStr) return undefined;
    return Math.floor(parseFloat(cpuStr) * 1024); // Docker CPU shares
  }
}

/**
 * Legacy compatibility function for existing demos
 */
async function runJob(job = {}) {
  if (!job || !job.packagePath) {
    throw new Error("job.packagePath is required (path to package folder)");
  }

  const processor = new JudgeProcessor();

  // For backwards compatibility, treat packagePath as a problem directory
  // and create a mock submission evaluation
  const problemId = path.basename(job.packagePath);
  const evaluationRequest = {
    submission_id: job.id || `demo-${Date.now()}`,
    problem_id: problemId,
    team_id: "demo-team",
  };

  // Copy package to problems directory first
  const problemDir = path.resolve(processor.problemsDir, problemId);
  await processor.copyDirectory(job.packagePath, problemDir);

  // Build images first
  try {
    await processor.buildProblemImages(problemId);
  } catch (error) {
    logger.error(
      { problemId, error: error.message },
      "Failed to build problem images",
    );
    throw error;
  }

  // Mock submission directory with packagePath contents if submissionPath not provided
  if (!job.submissionPath) {
    const submissionDir = path.resolve(
      processor.submissionsDir,
      problemId,
      evaluationRequest.submission_id,
    );
    await fs.promises.mkdir(submissionDir, { recursive: true });

    // Copy package contents to submission dir for demo purposes
    await processor.copyDirectory(job.packagePath, submissionDir);
  } else {
    // Copy actual submission
    const submissionDir = path.resolve(
      processor.submissionsDir,
      problemId,
      evaluationRequest.submission_id,
    );
    await processor.copyDirectory(job.submissionPath, submissionDir);
  }

  return await processor.runEvaluation(evaluationRequest);
}

/**
 * Copy directory recursively
 */
async function copyDirectory(src, dest) {
  await fs.promises.mkdir(dest, { recursive: true });
  const entries = await fs.promises.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.resolve(src, entry.name);
    const destPath = path.resolve(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else {
      await fs.promises.copyFile(srcPath, destPath);
    }
  }
}

// Add copyDirectory method to JudgeProcessor
JudgeProcessor.prototype.copyDirectory = copyDirectory;

module.exports = {
  JudgeProcessor,
  runJob, // Legacy compatibility
};
