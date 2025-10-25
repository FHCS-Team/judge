const { PassThrough } = require("stream");

describe("src/docker/exec.js", () => {
  let mockDocker;
  let mockLogger;
  let execModule;

  beforeEach(() => {
    jest.resetModules();
    mockLogger = { debug: jest.fn(), error: jest.fn() };

    // mock docker and its modem
    mockDocker = {
      getContainer: jest.fn(),
      modem: {
        demuxStream: jest.fn((stream, out, err) => {
          // simple demux: pipe incoming data to stdout
          stream.on("data", (chunk) => out.write(chunk));
        }),
      },
    };

    jest.doMock("../../../src/docker/index", () => ({
      docker: mockDocker,
      logger: mockLogger,
    }));

    execModule = require("../../../src/docker/exec");
  });

  afterEach(() => jest.clearAllMocks());

  test("throws when containerId or command missing", async () => {
    await expect(execModule.executeCommand()).rejects.toThrow(
      "containerId is required",
    );
    await expect(execModule.executeCommand("cid")).rejects.toThrow(
      "command is required",
    );
  });

  test("executes string command and returns stdout/stderr and exit code", async () => {
    const containerId = "cid-exec-1";

    // mock exec object
    const execObj = {
      start: jest.fn().mockImplementation(() => {
        const s = new PassThrough();
        // simulate output and end on next tick
        process.nextTick(() => {
          s.write(Buffer.from("out-data"));
          s.end();
        });
        return Promise.resolve(s);
      }),
      inspect: jest.fn().mockResolvedValue({ ExitCode: 0 }),
    };

    const mockContainer = { exec: jest.fn().mockResolvedValue(execObj) };
    mockDocker.getContainer.mockReturnValue(mockContainer);

    const res = await execModule.executeCommand(containerId, "echo hi");

    expect(res.ExitCode).toBe(0);
    expect(res.stdout).toContain("out-data");
    expect(mockLogger.debug).toHaveBeenCalledWith(
      { containerId, cmd: ["/bin/sh", "-c", "echo hi"], exitCode: 0 },
      "exec finished",
    );
  });

  test("executes array command and passes execOptions", async () => {
    const containerId = "cid-exec-2";
    const cmdArray = ["/bin/ls", "-la"];

    const execObj = {
      start: jest.fn().mockImplementation(() => {
        const s = new PassThrough();
        process.nextTick(() => {
          s.write(Buffer.from("ls-out"));
          s.end();
        });
        return Promise.resolve(s);
      }),
      inspect: jest.fn().mockResolvedValue({ ExitCode: 1 }),
    };

    const mockContainer = { exec: jest.fn().mockResolvedValue(execObj) };
    mockDocker.getContainer.mockReturnValue(mockContainer);

    const res = await execModule.executeCommand(containerId, cmdArray, {
      Env: ["A=B"],
    });

    expect(res.ExitCode).toBe(1);
    expect(res.stdout).toContain("ls-out");
    // ensure container.exec was called with merged options
    expect(mockContainer.exec).toHaveBeenCalledWith(
      expect.objectContaining({
        Cmd: cmdArray,
        AttachStdout: true,
        AttachStderr: true,
      }),
    );
  });

  test("logs and rethrows on errors", async () => {
    const containerId = "cid-exec-err";
    const mockContainer = {
      exec: jest.fn().mockRejectedValue(new Error("exec fail")),
    };
    mockDocker.getContainer.mockReturnValue(mockContainer);

    await expect(execModule.executeCommand(containerId, "x")).rejects.toThrow(
      "exec fail",
    );
    expect(mockLogger.error).toHaveBeenCalled();
  });
});
