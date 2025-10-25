describe("src/docker/container.js", () => {
  let mockDocker;
  let mockContainers;
  let mockLogger;
  let containerModule;

  const resetMocks = () => {
    mockContainers = {};
    mockLogger = {
      debug: jest.fn(),
      error: jest.fn(),
    };
    mockDocker = {
      createContainer: jest.fn(),
      getContainer: jest.fn(),
    };
  };

  beforeEach(() => {
    jest.resetModules();
    resetMocks();

    // Mock the internal docker index module before requiring container.js
    jest.doMock("../../../src/docker/index", () => ({
      docker: mockDocker,
      containers: mockContainers,
      logger: mockLogger,
    }));

    containerModule = require("../../../src/docker/container");
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("createContainer", () => {
    test("resolves and stores container info when docker create/inspect succeed", async () => {
      const info = {
        Id: "cid123",
        Name: "/my-container",
        Config: { Image: "node:14" },
        Created: "2025-01-01T00:00:00Z",
        State: { Status: "created" },
      };

      const mockContainer = {
        inspect: jest.fn().mockResolvedValue(info),
      };

      mockDocker.createContainer.mockResolvedValue(mockContainer);

      const id = await containerModule.createContainer({ Image: "node:14" });

      expect(id).toBe(info.Id);
      expect(mockContainers[info.Id]).toEqual({
        id: info.Id,
        name: info.Name,
        image: info.Config.Image,
        created: info.Created,
        state: info.State,
      });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        { id: info.Id },
        "container created",
      );
    });

    test("throws when Image option missing", async () => {
      await expect(containerModule.createContainer({})).rejects.toThrow(
        "createContainer requires options.Image",
      );
      await expect(containerModule.createContainer()).rejects.toThrow(
        "createContainer requires options.Image",
      );
    });

    test("logs and rethrows when docker.createContainer fails", async () => {
      const err = new Error("create failed");
      mockDocker.createContainer.mockRejectedValue(err);

      await expect(
        containerModule.createContainer({ Image: "a" }),
      ).rejects.toBe(err);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe("startContainer", () => {
    test("starts container, refreshes inspect, and returns true on success", async () => {
      const info = {
        Id: "cid-start",
        Name: "/started",
        Config: { Image: "alpine:3.18" },
        State: { Status: "running" },
      };

      const mockCont = {
        start: jest.fn().mockResolvedValue(undefined),
        inspect: jest.fn().mockResolvedValue(info),
      };

      mockDocker.getContainer.mockReturnValue(mockCont);

      const res = await containerModule.startContainer(info.Id);
      expect(res).toBe(true);
      expect(mockContainers[info.Id]).toMatchObject({
        id: info.Id,
        name: info.Name,
        image: info.Config.Image,
        state: info.State,
      });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        { id: info.Id },
        "container started",
      );
    });

    test("rethrows and logs when start fails", async () => {
      const id = "cid-fail-start";
      const mockCont = {
        start: jest.fn().mockRejectedValue(new Error("start fail")),
      };
      mockDocker.getContainer.mockReturnValue(mockCont);

      await expect(containerModule.startContainer(id)).rejects.toThrow(
        "start fail",
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error), containerId: id }),
        "failed to start container",
      );
    });
  });

  describe("stopContainer", () => {
    test("stops container, updates state, and returns true", async () => {
      const id = "cid-stop";
      const info = { Id: id, State: { Status: "exited" } };
      const mockCont = {
        stop: jest.fn().mockResolvedValue(undefined),
        inspect: jest.fn().mockResolvedValue(info),
      };
      mockDocker.getContainer.mockReturnValue(mockCont);

      const res = await containerModule.stopContainer(id, { t: 3 });
      expect(res).toBe(true);
      expect(mockContainers[id].state).toEqual(info.State);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        { id },
        "container stopped",
      );
      expect(mockCont.stop).toHaveBeenCalledWith({ t: 3 });
    });

    test("forwards default stop options when not provided", async () => {
      const id = "cid-stop-default";
      const info = { Id: id, State: { Status: "stopped" } };
      const mockCont = {
        stop: jest.fn().mockResolvedValue(undefined),
        inspect: jest.fn().mockResolvedValue(info),
      };
      mockDocker.getContainer.mockReturnValue(mockCont);

      const res = await containerModule.stopContainer(id);
      expect(res).toBe(true);
      expect(mockCont.stop).toHaveBeenCalledWith({ t: 5 });
    });

    test("treats 'is not running' error as success", async () => {
      const id = "cid-already-stopped";
      const err = new Error("Container is not running");
      // message must contain 'is not running' to match the regex in implementation
      err.message = "is not running";
      const mockCont = { stop: jest.fn().mockRejectedValue(err) };
      mockDocker.getContainer.mockReturnValue(mockCont);

      const res = await containerModule.stopContainer(id);
      expect(res).toBe(true);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        { containerId: id },
        "container already stopped",
      );
    });

    test("rethrows and logs non-is-not-running errors", async () => {
      const id = "cid-stop-err";
      const err = new Error("unexpected");
      const mockCont = { stop: jest.fn().mockRejectedValue(err) };
      mockDocker.getContainer.mockReturnValue(mockCont);

      await expect(containerModule.stopContainer(id)).rejects.toThrow(
        "unexpected",
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err, containerId: id }),
        "failed to stop container",
      );
    });
  });

  describe("removeContainer", () => {
    test("removes container and deletes from containers map", async () => {
      const id = "cid-rm";
      // pre-populate containers
      mockContainers[id] = { id, name: "x" };
      const mockCont = { remove: jest.fn().mockResolvedValue(undefined) };
      mockDocker.getContainer.mockReturnValue(mockCont);

      const res = await containerModule.removeContainer(id, { force: true });
      expect(res).toBe(true);
      expect(mockContainers[id]).toBeUndefined();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        { id },
        "container removed",
      );
      expect(mockCont.remove).toHaveBeenCalledWith({ force: true });
    });

    test("forwards default remove options when not provided", async () => {
      const id = "cid-rm-default";
      const mockCont = { remove: jest.fn().mockResolvedValue(undefined) };
      mockDocker.getContainer.mockReturnValue(mockCont);

      const res = await containerModule.removeContainer(id);
      expect(res).toBe(true);
      expect(mockCont.remove).toHaveBeenCalledWith({ force: true, v: true });
    });

    test("rethrows and logs on docker remove error", async () => {
      const id = "cid-rm-err";
      const err = new Error("remove fail");
      const mockCont = { remove: jest.fn().mockRejectedValue(err) };
      mockDocker.getContainer.mockReturnValue(mockCont);

      await expect(containerModule.removeContainer(id)).rejects.toThrow(
        "remove fail",
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err, containerId: id }),
        "failed to remove container",
      );
    });
  });
});
