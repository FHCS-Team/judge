/**
 * Tests for configuration module
 */

const config = require("../src/config");

describe("Configuration", () => {
  describe("Default Configuration", () => {
    it("should have default values", () => {
      expect(config.docker).toBeDefined();
      expect(config.paths).toBeDefined();
      expect(config.api).toBeDefined();
      expect(config.queue).toBeDefined();
      expect(config.resources).toBeDefined();
    });

    it("should have docker configuration", () => {
      expect(config.docker.host).toBeDefined();
      expect(config.docker.defaultMemoryMB).toBeGreaterThan(0);
      expect(config.docker.defaultCpuCores).toBeGreaterThan(0);
    });

    it("should have path configuration", () => {
      expect(config.paths.workDir).toBeDefined();
      expect(config.paths.problemsDir).toBeDefined();
      expect(config.paths.submissionsDir).toBeDefined();
      expect(config.paths.resultsDir).toBeDefined();
    });

    it("should have API configuration", () => {
      expect(config.api.port).toBeGreaterThan(0);
      expect(config.api.port).toBeLessThan(65536);
      expect(config.api.host).toBeDefined();
    });

    it("should have queue configuration", () => {
      expect(config.queue.maxSize).toBeGreaterThan(0);
      expect(config.queue.rateLimitPerTeam).toBeGreaterThan(0);
    });

    it("should have resource limits", () => {
      expect(config.resources.maxWorkers).toBeGreaterThan(0);
      expect(config.resources.maxMemoryMB).toBeGreaterThan(0);
      expect(config.resources.maxCpuCores).toBeGreaterThan(0);
    });
  });

  describe("validateConfig", () => {
    it("should have validateConfig function", () => {
      expect(config.validateConfig).toBeDefined();
      expect(typeof config.validateConfig).toBe("function");
    });

    it("should return array of validation errors", () => {
      const errors = config.validateConfig();
      expect(Array.isArray(errors)).toBe(true);
    });
  });

  describe("getDockerOptions", () => {
    it("should return docker options", () => {
      const options = config.getDockerOptions();

      if (config.docker.host.startsWith("unix://")) {
        expect(options.socketPath).toBeDefined();
      } else if (config.docker.host.startsWith("tcp://")) {
        expect(options.host).toBeDefined();
        expect(options.port).toBeDefined();
      }
    });

    it("should handle unix socket paths", () => {
      const options = config.getDockerOptions();

      if (config.docker.host.startsWith("unix://")) {
        expect(options.socketPath).toContain("/var/run/docker.sock");
      }
    });
  });

  describe("Environment Variables", () => {
    it("should respect DOCKER_HOST if set", () => {
      expect(config.docker.host).toBeTruthy();
    });

    it("should respect NODE_ENV", () => {
      expect(config.nodeEnv).toBeDefined();
    });

    it("should have appropriate log level", () => {
      expect(config.logging).toBeDefined();
    });
  });
});
