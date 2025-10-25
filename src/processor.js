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
  const workspace = path.resolve(artifactsRoot, `job-${id}`);

  await fs.promises.mkdir(workspace, { recursive: true });

  // copy package into workspace (use cp -a for simplicity and to preserve executables)
  const pkgPath = path.resolve(job.packagePath);
  logger.info({ id, pkgPath, workspace }, "preparing workspace");
  const copyCmd = `cp -a ${pkgPath}/. ${workspace}/`;
  const copyRes = await execShell(copyCmd);
  if (copyRes.code !== 0) {
    const err = new Error(`failed to copy package: ${copyRes.stderr}`);
    throw err;
  }

  // build image
  const imageTag = job.imageTag || `judge-job-${id}:latest`;
  logger.info({ id, imageTag }, "building docker image");
  const buildCmd = `docker build -t ${imageTag} ${workspace}`;
  const buildRes = await execShell(buildCmd);

  const result = {
    id,
    imageTag,
    build: {
      code: buildRes.code,
      stdout: buildRes.stdout,
      stderr: buildRes.stderr,
    },
    steps: [],
    artifacts: [],
    status: "unknown",
  };

  if (buildRes.code !== 0) {
    result.status = "build_failed";
    await writeResult(workspace, result);
    return result;
  }

  // create container and mount workspace to /workspace
  const createOptions = {
    Image: imageTag,
    Tty: false,
    HostConfig: {
      Binds: [`${workspace}:/workspace`],
      AutoRemove: false,
    },
    Cmd: ["/bin/sh", "-c", "while sleep 3600; do :; done"],
  };

  let containerId;
  try {
    containerId = await createContainer(createOptions);
    await startContainer(containerId);

    // determine evaluation command
    let evalCmd = job.evalCmd;
    // if package contains a common hook, run it
    const postHook = path.join(
      workspace,
      "hooks",
      "post",
      "01_test_queries.sh",
    );
    try {
      await fs.promises.access(postHook, fs.constants.X_OK);
      evalCmd = evalCmd || `/workspace/hooks/post/01_test_queries.sh`;
    } catch (e) {
      // no hook; fallback to a default command that writes a marker
      evalCmd =
        evalCmd || `sh -c 'echo "EVALUATION_OK" > /workspace/evaluation.txt'`;
    }

    logger.info({ containerId, evalCmd }, "running evaluation command");
    const execRes = await executeCommand(containerId, evalCmd);
    result.steps.push({
      name: "evaluation",
      exitCode: execRes.ExitCode,
      stdout: execRes.stdout,
      stderr: execRes.stderr,
    });

    result.status = execRes.ExitCode === 0 ? "success" : "failed";
  } catch (err) {
    logger.error({ err, containerId }, "error during container run");
    result.status = "error";
    result.error = String(err);
  } finally {
    if (containerId) {
      try {
        await stopContainer(containerId).catch(() => {});
        await removeContainer(containerId).catch(() => {});
      } catch (err) {
        // ignore
      }
    }
  }

  // gather artifacts (list files under workspace)
  const artifacts = await listFilesRecursive(workspace);
  result.artifacts = artifacts.map((p) => path.relative(workspace, p));

  // write result.json into workspace
  await writeResult(workspace, result);

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
