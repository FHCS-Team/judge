const fs = require("fs/promises");
const path = require("path");
const logger = require("../../utils/logger");

/**
 * Default stage configuration used when no config files are present.
 */
const DEFAULT_STAGE_CONFIG = {
  network: {
    enabled: false,
    internal_only: false,
    network_name: null,
    allowed_containers: [],
  },
  resource_limits: {
    cpu: "1.0",
    memory: "512M",
    timeout: 300,
  },
  environment: {},
  health_check: null,
  submission_mount: "/workspace",
  accepts_submission: false,
};

/**
 * Load per-container stage configuration with fallback rules:
 *  - Try `stage2.config.json` (evaluation)
 *  - If missing and stage===2, fallback to `stage1.config.json`
 *  - If missing, return default config
 *
 * @param {string} problemPath Absolute path to the unpacked problem package
 * @param {string} containerId Container identifier folder name
 * @param {number} stage Stage number (1 or 2)
 * @returns {Promise<Object>} normalized stage config
 */
async function loadStageConfig(problemPath, containerId, stage = 2) {
  const containerDir = path.join(problemPath, containerId);

  const stage2Path = path.join(containerDir, "stage2.config.json");
  const stage1Path = path.join(containerDir, "stage1.config.json");

  async function readJson(filePath) {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const parsed = JSON.parse(raw);
      return parsed;
    } catch (err) {
      if (err.code === "ENOENT") return null;
      logger.warn(`Error reading config ${filePath}: ${err.message}`);
      return null;
    }
  }

  // try requested stage first
  if (stage === 2) {
    const s2 = await readJson(stage2Path);
    if (s2) return normalizeStageConfig(s2);

    const s1 = await readJson(stage1Path);
    if (s1) return normalizeStageConfig(s1);

    return normalizeStageConfig(DEFAULT_STAGE_CONFIG);
  }

  if (stage === 1) {
    const s1 = await readJson(stage1Path);
    if (s1) return normalizeStageConfig(s1);
    return normalizeStageConfig(DEFAULT_STAGE_CONFIG);
  }

  // unexpected stage -> return defaults
  return normalizeStageConfig(DEFAULT_STAGE_CONFIG);
}

/**
 * Normalize a stage config to expected fields and shapes.
 * This keeps compatibility with snake_case or camelCase keys.
 * @param {Object} raw
 * @returns {Object}
 */
function normalizeStageConfig(raw) {
  if (!raw || typeof raw !== "object")
    return JSON.parse(JSON.stringify(DEFAULT_STAGE_CONFIG));

  const cfg = JSON.parse(JSON.stringify(DEFAULT_STAGE_CONFIG));

  // network
  const network = raw.network || raw.net || {};
  cfg.network.enabled = network.enabled ?? cfg.network.enabled;
  cfg.network.internal_only =
    network.internal_only ?? network.internalOnly ?? cfg.network.internal_only;
  cfg.network.network_name =
    network.network_name ?? network.networkName ?? cfg.network.network_name;
  cfg.network.allowed_containers =
    network.allowed_containers ??
    network.allowedContainers ??
    cfg.network.allowed_containers;

  // resource limits
  const rl = raw.resource_limits || raw.resourceLimits || {};
  cfg.resource_limits.cpu = rl.cpu ?? cfg.resource_limits.cpu;
  cfg.resource_limits.memory = rl.memory ?? cfg.resource_limits.memory;
  cfg.resource_limits.timeout = rl.timeout ?? cfg.resource_limits.timeout;

  // environment
  cfg.environment = raw.environment ?? cfg.environment;

  // health check
  cfg.health_check = raw.health_check ?? raw.healthCheck ?? cfg.health_check;

  cfg.submission_mount =
    raw.submission_mount ?? raw.submissionMount ?? cfg.submission_mount;
  cfg.accepts_submission =
    raw.accepts_submission ?? raw.acceptsSubmission ?? cfg.accepts_submission;

  return cfg;
}

module.exports = {
  loadStageConfig,
  DEFAULT_STAGE_CONFIG,
};
