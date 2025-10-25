const path = require("path");
const fs = require("fs");
const util = require("util");
const childProcess = require("child_process");
const exec = util.promisify(childProcess.exec);

const logger = require("./utils/logger");
const {
  createContainer,
  startContainer,
  stopContainer,
  removeContainer,
} = require("./docker/container");
const { executeCommand } = require("./docker/exec");
const { docker } = require("./docker/index");

/**
 * Run a shell command, returning stdout/stderr and exit code.
 */
async function execShell(cmd, opts = {}) {
  logger.info({ cmd }, "execShell");
  try {
    const res = await exec(cmd, { maxBuffer: 10 * 1024 * 1024, ...opts });
    return { code: 0, stdout: res.stdout, stderr: res.stderr };
  } catch (err) {
    return {
      code: err.code != null ? err.code : 1,
      stdout: err.stdout || "",
      stderr: err.stderr || String(err),
    };
  }
}

/**
 * Minimal processor that builds a docker image from a package directory,
 * starts a container with the workspace mounted, runs evaluation commands,
 * collects artifacts and writes a result.json.
 *
 * job: { id?, packagePath, imageTag?, evalCmd? }
 */
async function runJob(job = {}) {
  if (!job || !job.packagePath)
    throw new Error("job.packagePath is required (path to package folder)");

  const id = job.id || Date.now();
  const repoRoot = path.resolve(__dirname, "..");
  const artifactsRoot = path.resolve(repoRoot, "data", "artifacts");
  const workspaceRoot = path.resolve(artifactsRoot, `job-${id}`);

  // ensure artifacts root exists (creates data/ and data/artifacts)
  await fs.promises.mkdir(artifactsRoot, { recursive: true });
  await fs.promises.mkdir(workspaceRoot, { recursive: true });

  const pkgPath = path.resolve(job.packagePath);
  logger.info({ id, pkgPath, workspaceRoot }, "prepared workspace root");

  // discover containers
  const containers = [];
  const entries = await fs.promises.readdir(pkgPath, { withFileTypes: true });
  const rootHasDockerfile = entries.some(
    (e) => e.isFile() && e.name === "Dockerfile",
  );
  const rootHasStage = entries.some(
    (e) => e.isFile() && /^stage\d+\.config\.json$/.test(e.name),
  );
  if (rootHasDockerfile || rootHasStage)
    containers.push({ id: path.basename(pkgPath), path: pkgPath });
  for (const ent of entries) {
    if (ent.isDirectory()) {
      const subPath = path.join(pkgPath, ent.name);
      const subEntries = await fs.promises.readdir(subPath).catch(() => []);
      if (
        subEntries.includes("Dockerfile") ||
        subEntries.some((n) => /^stage\d+\.config\.json$/.test(n))
      ) {
        containers.push({ id: ent.name, path: subPath });
      }
    }
  }

  logger.info(
    { containers: containers.map((c) => c.id) },
    "found containers in package",
  );

  const result = { id, containers: {}, status: "unknown" };
  if (containers.length === 0) {
    result.status = "no_containers_found";
    await writeResult(workspaceRoot, result);
    return result;
  }

  const builtImages = {};

  // build stage1 for each container
  for (const c of containers) {
    const containerResult = { stages: {} };
    result.containers[c.id] = containerResult;

    const files = await fs.promises.readdir(c.path).catch(() => []);
    const stageFiles = files
      .filter((n) => /^stage\d+\.config\.json$/.test(n))
      .sort();
    containerResult.stageFiles = stageFiles;

    const stage1 = stageFiles.find((f) => f.startsWith("stage1"));
    if (stage1) {
      const imageTag = job.imageTag || `judge-job-${id}-${c.id}-stage1:latest`;
      logger.info(
        { container: c.id, imageTag, context: c.path },
        "building stage1 image",
      );
      const buildCmd = `docker build -t ${imageTag} ${c.path}`;
      const buildRes = await execShell(buildCmd);
      containerResult.stages["1"] = {
        type: "build",
        code: buildRes.code,
        stdout: buildRes.stdout,
        stderr: buildRes.stderr,
      };
      if (buildRes.code === 0) builtImages[c.id] = imageTag;
    }
  }

  // run subsequent stages
  for (const c of containers) {
    const containerResult = result.containers[c.id];
    const stageFiles = containerResult.stageFiles || [];
    for (const sf of stageFiles) {
      const m = sf.match(/^stage(\d+)\.config\.json$/);
      if (!m) continue;
      const stageNum = Number(m[1]);
      if (stageNum <= 1) continue;

      const cfg = JSON.parse(
        await fs.promises.readFile(path.join(c.path, sf), "utf8"),
      );
      const runDir = path.join(workspaceRoot, c.id, `stage${stageNum}`);
      await fs.promises.mkdir(runDir, { recursive: true });

      const imageTag = builtImages[c.id];
      if (!imageTag) {
        containerResult.stages[String(stageNum)] = {
          status: "skipped",
          reason: "no_built_image",
        };
        continue;
      }

      const cmds = job.stageCommands || {};
      const containerCmds = cmds[c.id] || {};
      const cmd = containerCmds[String(stageNum)];
      if (!cmd) {
        containerResult.stages[String(stageNum)] = {
          status: "skipped",
          reason: "no_stage_command",
        };
        continue;
      }

      const mountTarget = cfg.submission_mount || "/workspace";

      // If this stage requires networking, start the required service
      // containers (database + submission) attached to a dedicated network,
      // run the submission hook, capture logs and then cleanup.
      if (cfg.network && cfg.network.enabled) {
        const netNameTemplate =
          cfg.network.network_name || `judge-net-${id}-${c.id}`;
        const submissionId =
          job.submission_id ||
          job.submissionId ||
          (job.submissions && job.submissions[0] && job.submissions[0].id) ||
          id;
        const netName = netNameTemplate.replace(
          /{{\s*submission_id\s*}}/,
          submissionId,
        );

        try {
          await docker
            .createNetwork({
              Name: netName,
              CheckDuplicate: true,
              Driver: "bridge",
            })
            .catch(() => {});
        } catch (e) {
          logger.debug({ err: String(e), netName }, "network create failed");
        }

        const allowed = (cfg.network.allowed_containers || []).slice();
        if (!allowed.includes(c.id)) allowed.push(c.id);

        const started = {};
        try {
          for (const contId of allowed) {
            const contDef = containers.find((x) => x.id === contId);
            if (!contDef) {
              logger.warn({ contId }, "allowed container not found in package");
              continue;
            }
            const img = builtImages[contId];
            if (!img) {
              logger.warn(
                { contId },
                "no built image for allowed container, skipping",
              );
              continue;
            }

            // choose stage config for this container
            const contFiles = await fs.promises
              .readdir(contDef.path)
              .catch(() => []);
            const contStageFile =
              contFiles.find((n) => /^stage2\.config\.json$/.test(n)) ||
              contFiles.find((n) => /^stage1\.config\.json$/.test(n));
            const contCfg = contStageFile
              ? JSON.parse(
                  await fs.promises.readFile(
                    path.join(contDef.path, contStageFile),
                    "utf8",
                  ),
                )
              : {};

            // prepare binds: submission gets runDir + package; services may get data volumes
            const binds = [];
            const submissionIdLocal = submissionId;
            if (contId === c.id) {
              // create persistent volume for submission
              const volName = `vol_${id}_${c.id}_${submissionIdLocal}`;
              try {
                await docker.createVolume({ Name: volName });
              } catch (e) {}
              const mountPoint = contCfg.submission_mount || mountTarget;
              binds.push(`${volName}:${mountPoint}`);
              // bind runDir for artifact collection
              binds.push(`${runDir}:/workspace`);
              binds.push(`${contDef.path}:/package:ro`);
            } else {
              const dataPath =
                contCfg.environment &&
                (contCfg.environment.PGDATA || contCfg.environment.DATA_DIR);
              if (dataPath) {
                const volName = `vol_${id}_${contId}_${submissionIdLocal}`;
                try {
                  await docker.createVolume({ Name: volName });
                } catch (e) {}
                binds.push(`${volName}:${dataPath}`);
              }
            }

            const createOpts = {
              Image: img,
              Tty: false,
              HostConfig: {
                Binds: binds,
                NetworkMode: netName,
                AutoRemove: false,
              },
              Cmd: ["/bin/sh", "-c", "while sleep 3600; do :; done"],
              Env: Object.entries(contCfg.environment || {}).map(
                ([k, v]) => `${k}=${v}`,
              ),
            };

            const contInstanceId = await createContainer(createOpts);
            await startContainer(contInstanceId);
            started[contId] = contInstanceId;
          }

          const submissionContainerId = started[c.id];
          if (!submissionContainerId)
            throw new Error("submission container not started");

          const execRes = await executeCommand(submissionContainerId, cmd);

          // collect logs from containers
          for (const [contId, contInstanceId] of Object.entries(started)) {
            try {
              const cont = docker.getContainer(contInstanceId);
              const rawLogs = await cont.logs({
                stdout: true,
                stderr: true,
                timestamps: false,
              });
              await fs.promises.writeFile(
                path.join(runDir, `${contId}.container.log`),
                rawLogs.toString("utf8"),
                "utf8",
              );
            } catch (e) {
              logger.debug(
                { err: String(e), contId },
                "failed to collect container logs",
              );
            }
          }

          const logPath = path.join(runDir, "execution.log");
          const logContent = `stdout:\n${execRes.stdout}\n\nstderr:\n${execRes.stderr}\nexitCode:${execRes.ExitCode}\n`;
          await fs.promises.writeFile(logPath, logContent, "utf8");

          const artifacts = (await listFilesRecursive(runDir)).map((p) =>
            path.relative(runDir, p),
          );
          containerResult.stages[String(stageNum)] = {
            type: "exec",
            exitCode: execRes.ExitCode,
            stdout: execRes.stdout,
            stderr: execRes.stderr,
            artifacts,
          };
        } catch (err) {
          containerResult.stages[String(stageNum)] = {
            status: "error",
            error: String(err),
          };
        } finally {
          for (const contInstanceId of Object.values(started)) {
            try {
              await stopContainer(contInstanceId).catch(() => {});
              await removeContainer(contInstanceId).catch(() => {});
            } catch (e) {}
          }
          try {
            const net = docker.getNetwork(netName);
            await net.remove().catch(() => {});
          } catch (e) {}
        }
      } else {
        // non-networked single container execution
        let containerId;
        try {
          const createOptions = {
            Image: imageTag,
            Tty: false,
            HostConfig: {
              Binds: [`${runDir}:${mountTarget}`, `${c.path}:/package:ro`],
              AutoRemove: false,
            },
            Cmd: ["/bin/sh", "-c", "while sleep 3600; do :; done"],
          };
          containerId = await createContainer(createOptions);
          await startContainer(containerId);

          logger.info(
            { container: c.id, stage: stageNum, cmd, containerId },
            "running stage command",
          );
          const execRes = await executeCommand(containerId, cmd);

          const logPath = path.join(runDir, "execution.log");
          const logContent = `stdout:\n${execRes.stdout}\n\nstderr:\n${execRes.stderr}\nexitCode:${execRes.ExitCode}\n`;
          await fs.promises.writeFile(logPath, logContent, "utf8");

          const artifacts = (await listFilesRecursive(runDir)).map((p) =>
            path.relative(runDir, p),
          );
          containerResult.stages[String(stageNum)] = {
            type: "exec",
            exitCode: execRes.ExitCode,
            stdout: execRes.stdout,
            stderr: execRes.stderr,
            artifacts,
          };
        } catch (err) {
          containerResult.stages[String(stageNum)] = {
            status: "error",
            error: String(err),
          };
        } finally {
          if (containerId) {
            try {
              await stopContainer(containerId).catch(() => {});
              await removeContainer(containerId).catch(() => {});
            } catch (e) {}
          }
        }
      }
    }
  }

  result.status = "completed";
  await writeResult(workspaceRoot, result);
  return result;
}

async function writeResult(workspace, result) {
  const outPath = path.join(workspace, "result.json");
  await fs.promises.writeFile(outPath, JSON.stringify(result, null, 2), "utf8");
  logger.info({ outPath }, "wrote result.json");
}

async function listFilesRecursive(dir) {
  const res = [];
  async function walk(d) {
    const entries = await fs.promises.readdir(d, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) await walk(full);
      else res.push(full);
    }
  }
  await walk(dir);
  return res;
}

module.exports = {
  runJob,
};
