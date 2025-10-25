describe("src/docker/network.js", () => {
  let mockDocker;
  let mockLogger;
  let networkModule;

  beforeEach(() => {
    jest.resetModules();
    mockLogger = { debug: jest.fn(), error: jest.fn() };

    mockDocker = {
      createNetwork: jest.fn(),
      getNetwork: jest.fn(),
      listNetworks: jest.fn(),
    };

    jest.doMock("../../../src/docker/index", () => ({
      docker: mockDocker,
      logger: mockLogger,
    }));

    networkModule = require("../../../src/docker/network");
  });

  afterEach(() => jest.clearAllMocks());

  test("createNetwork returns inspect info and logs", async () => {
    const info = { Id: "nid1" };
    const mockNetwork = { inspect: jest.fn().mockResolvedValue(info) };
    mockDocker.createNetwork.mockResolvedValue(mockNetwork);

    const res = await networkModule.createNetwork({ Name: "n" });
    expect(res).toBe(info);
    expect(mockLogger.debug).toHaveBeenCalledWith(
      { id: info.Id },
      "network created",
    );
  });

  test("removeNetwork removes and returns true", async () => {
    const id = "nid-rm";
    const mockNetwork = { remove: jest.fn().mockResolvedValue(undefined) };
    mockDocker.getNetwork.mockReturnValue(mockNetwork);

    const res = await networkModule.removeNetwork(id);
    expect(res).toBe(true);
    expect(mockLogger.debug).toHaveBeenCalledWith({ id }, "network removed");
  });

  test("getNetworks returns array from docker.listNetworks", async () => {
    const arr = [{ Id: "a" }];
    mockDocker.listNetworks.mockResolvedValue(arr);
    const res = await networkModule.getNetworks();
    expect(res).toBe(arr);
  });

  test("getNetworkById inspects and returns network info", async () => {
    const id = "nid-get";
    const info = { Id: id };
    const mockNetwork = { inspect: jest.fn().mockResolvedValue(info) };
    mockDocker.getNetwork.mockReturnValue(mockNetwork);

    const res = await networkModule.getNetworkById(id);
    expect(res).toBe(info);
  });
});
