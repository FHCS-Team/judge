describe("src/docker/index.js", () => {
  test("exports docker, containers, and logger", () => {
    const idx = require("../../../src/docker/index");
    expect(idx).toHaveProperty("docker");
    expect(idx).toHaveProperty("containers");
    expect(typeof idx.containers).toBe("object");
    expect(idx).toHaveProperty("logger");
    expect(typeof idx.logger.debug).toBe("function");
  });
});
