const logger = require("../../../src/utils/logger");

describe("logger", () => {
  test("exports a pino-like logger with level method and basic functions", () => {
    expect(typeof logger).toBe("object");
    // pino instance typically has level and child functions
    expect(typeof logger.level).toBe("string");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.warn).toBe("function");
  });
});
