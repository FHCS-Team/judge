describe("src/docker/image.js", () => {
  let mockDocker;
  let mockLogger;
  let imageModule;

  beforeEach(() => {
    jest.resetModules();
    mockLogger = { debug: jest.fn(), error: jest.fn() };

    mockDocker = {
      pull: jest.fn(),
      getImage: jest.fn(),
      modem: {
        followProgress: jest.fn((stream, cb) => cb(null, [])),
      },
    };

    jest.doMock("../../../src/docker/index", () => ({
      docker: mockDocker,
      logger: mockLogger,
    }));

    imageModule = require("../../../src/docker/image");
  });

  afterEach(() => jest.clearAllMocks());

  test("pullImage throws when imageName missing", async () => {
    await expect(imageModule.pullImage()).rejects.toThrow(
      "imageName is required",
    );
  });

  test("pullImage calls docker.pull and resolves true", async () => {
    const stream = {};
    mockDocker.pull.mockResolvedValue(stream);

    const res = await imageModule.pullImage("ubuntu:latest");
    expect(res).toBe(true);
    expect(mockDocker.pull).toHaveBeenCalledWith("ubuntu:latest");
    expect(mockLogger.debug).toHaveBeenCalledWith(
      { image: "ubuntu:latest" },
      "image pulled",
    );
  });

  test("pullImage logs and rethrows on pull error", async () => {
    const err = new Error("pull fail");
    mockDocker.pull.mockRejectedValue(err);
    await expect(imageModule.pullImage("x")).rejects.toBe(err);
    expect(mockLogger.error).toHaveBeenCalled();
  });

  test("removeImage throws when imageName missing", async () => {
    await expect(imageModule.removeImage()).rejects.toThrow(
      "imageName is required",
    );
  });

  test("removeImage removes image and returns true", async () => {
    const mockImage = { remove: jest.fn().mockResolvedValue(undefined) };
    mockDocker.getImage.mockReturnValue(mockImage);

    const res = await imageModule.removeImage("img:tag");
    expect(res).toBe(true);
    expect(mockImage.remove).toHaveBeenCalledWith({ force: true });
    expect(mockLogger.debug).toHaveBeenCalledWith(
      { image: "img:tag" },
      "image removed",
    );
  });

  test("removeImage logs and rethrows on error", async () => {
    const err = new Error("rm fail");
    const mockImage = { remove: jest.fn().mockRejectedValue(err) };
    mockDocker.getImage.mockReturnValue(mockImage);

    await expect(imageModule.removeImage("img")).rejects.toBe(err);
    expect(mockLogger.error).toHaveBeenCalled();
  });
});
