/**
 * TODO: docker exec logic
 */

const { docker, logger } = require("./index");
const stream = require("stream");

/**
 * Execute a command inside a running Docker container.
 * @param {string} containerId - The ID of the container to execute the command in.
 * @param {string|string[]} command - The command to execute. Can be a string (shell command) or an array of arguments (exec form).
 * @param {import("dockerode").ExecCreateOptions} [execOptions={}] - Dockerode exec options.
 * @returns {Promise<{ExitCode: number, stdout: string, stderr: string}>} Resolves with the exit code, stdout, and stderr output.
 * @throws {Error} If required parameters are missing or execution fails.
 *
 * If command is a string, it will be run as a shell command (['/bin/sh', '-c', command]).
 * If command is an array, it will be passed directly as the exec command.
 */
const executeCommand = async (containerId, command, execOptions = {}) => {
  if (!containerId) throw new Error("containerId is required");
  if (!command) throw new Error("command is required");

  const cmdArray = Array.isArray(command)
    ? command
    : ["/bin/sh", "-c", String(command)];

  try {
    const container = docker.getContainer(containerId);
    const exec = await container.exec({
      Cmd: cmdArray,
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
      ...execOptions,
    });
    const execStream = await exec.start({ Detach: false });

    // collect output
    const stdoutChunks = [];
    const stderrChunks = [];

    // dockerode returns a multiplexed stream when Tty=false
    await new Promise((resolve, reject) => {
      docker.modem.demuxStream(
        execStream,
        new stream.Writable({
          write(chunk, enc, cb) {
            stdoutChunks.push(chunk);
            cb();
          },
        }),
        new stream.Writable({
          write(chunk, enc, cb) {
            stderrChunks.push(chunk);
            cb();
          },
        }),
      );

      execStream.on("end", resolve);
      execStream.on("error", reject);
    });

    // Inspect exec to get exit code
    const execInspect = await exec.inspect();

    const stdout = Buffer.concat(stdoutChunks).toString("utf8");
    const stderr = Buffer.concat(stderrChunks).toString("utf8");

    logger.debug(
      { containerId, cmd: cmdArray, exitCode: execInspect.ExitCode },
      "exec finished",
    );

    return {
      ExitCode: execInspect.ExitCode,
      stdout,
      stderr,
    };
  } catch (err) {
    logger.error({ err, containerId, command }, "exec failed");
    throw err;
  }
};

module.exports = {
  executeCommand,
};
