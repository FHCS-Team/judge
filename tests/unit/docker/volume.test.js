describe("src/docker/volume.js", () => {
  let mockDocker;
  let mockLogger;
  let volumeModule;

  beforeEach(() => {
    jest.resetModules();
    mockLogger = { debug: jest.fn(), error: jest.fn() };

    mockDocker = {
      createVolume: jest.fn(),
      getVolume: jest.fn(),
      listVolumes: jest.fn(),
    };

    jest.doMock("../../../src/docker/index", () => ({
      docker: mockDocker,
      logger: mockLogger,
    }));

    volumeModule = require("../../../src/docker/volume");
  });

  afterEach(() => jest.clearAllMocks());

  test("createVolume throws when volumeName missing", async () => {
    await expect(volumeModule.createVolume()).rejects.toThrow(
      "volumeName is required",
    );
  });

  test("createVolume creates and returns info", async () => {
    const name = "vol1";
    const info = { Name: name };
    const mockVol = { inspect: jest.fn().mockResolvedValue(info) };
    mockDocker.createVolume.mockResolvedValue(mockVol);

    const res = await volumeModule.createVolume(name, { Labels: { a: "b" } });
    expect(res).toBe(info);
    expect(mockLogger.debug).toHaveBeenCalledWith({ name }, "volume created");
    expect(mockDocker.createVolume).toHaveBeenCalledWith(
      expect.objectContaining({ Name: name }),
    );
  });

  test("removeVolume throws when name missing", async () => {
    await expect(volumeModule.removeVolume()).rejects.toThrow(
      "volumeName is required",
    );
  });

  test("removeVolume removes and returns true", async () => {
    const name = "vol-rm";
    const mockVol = { remove: jest.fn().mockResolvedValue(undefined) };
    mockDocker.getVolume.mockReturnValue(mockVol);

    const res = await volumeModule.removeVolume(name);
    expect(res).toBe(true);
    expect(mockLogger.debug).toHaveBeenCalledWith({ name }, "volume removed");
  });

  test("getVolumes returns empty array when listVolumes returns no Volumes", async () => {
    mockDocker.listVolumes.mockResolvedValue({});
    const res = await volumeModule.getVolumes();
    expect(res).toEqual([]);
  });

  test("getVolumes returns volumes array when present", async () => {
    const list = { Volumes: [{ Name: "v1" }] };
    mockDocker.listVolumes.mockResolvedValue(list);
    const res = await volumeModule.getVolumes();
    expect(res).toEqual(list.Volumes);
  });

  test("getVolumeByName throws when name missing", async () => {
    await expect(volumeModule.getVolumeByName()).rejects.toThrow(
      "volumeName is required",
    );
  });

  test("getVolumeByName inspects and returns info", async () => {
    const name = "v-get";
    const info = { Name: name };
    const mockVol = { inspect: jest.fn().mockResolvedValue(info) };
    mockDocker.getVolume.mockReturnValue(mockVol);

    const res = await volumeModule.getVolumeByName(name);
    expect(res).toBe(info);
  });
});
