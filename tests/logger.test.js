/**
 * Tests for logger utility
 */

const logger = require("../src/utils/logger");

describe("Logger", () => {
  // Capture console output
  let consoleOutput = [];
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  beforeEach(() => {
    consoleOutput = [];
    console.log = (msg) => consoleOutput.push({ level: "log", msg });
    console.error = (msg) => consoleOutput.push({ level: "error", msg });
    console.warn = (msg) => consoleOutput.push({ level: "warn", msg });
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
  });

  describe("Log Levels", () => {
    it("should have error method", () => {
      expect(logger.error).toBeDefined();
      expect(typeof logger.error).toBe("function");
    });

    it("should have warn method", () => {
      expect(logger.warn).toBeDefined();
      expect(typeof logger.warn).toBe("function");
    });

    it("should have info method", () => {
      expect(logger.info).toBeDefined();
      expect(typeof logger.info).toBe("function");
    });

    it("should have debug method", () => {
      expect(logger.debug).toBeDefined();
      expect(typeof logger.debug).toBe("function");
    });
  });

  describe("Logging Output", () => {
    it("should log error messages", () => {
      logger.error("Test error message");
      expect(consoleOutput.length).toBeGreaterThan(0);
      expect(consoleOutput[0].level).toBe("error");
    });

    it("should log warning messages", () => {
      logger.warn("Test warning message");
      expect(consoleOutput.length).toBeGreaterThan(0);
    });

    it("should log info messages", () => {
      logger.info("Test info message");
      expect(consoleOutput.length).toBeGreaterThan(0);
    });
  });

  describe("Message Formatting", () => {
    it("should format messages with multiple arguments", () => {
      logger.info("Test", "with", "multiple", "args");
      expect(consoleOutput.length).toBeGreaterThan(0);
    });

    it("should handle object logging", () => {
      logger.info({ test: "object", nested: { value: 123 } });
      expect(consoleOutput.length).toBeGreaterThan(0);
    });

    it("should handle error objects", () => {
      const error = new Error("Test error");
      logger.error(error);
      expect(consoleOutput.length).toBeGreaterThan(0);
    });
  });
});
