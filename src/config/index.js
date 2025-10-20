/**
 * Configuration system for judgehost
 * Loads environment variables with sensible defaults
 */

const path = require("path");

// Load environment variables from .env file if present
try {
  require("dotenv").config();
} catch (e) {
  // dotenv not installed or no .env file - continue with process.env
}

/**
 * Helper function to resolve paths (converts relative paths to absolute)
 * @param {string} pathStr - The path to resolve
 * @returns {string} - Absolute path
 */
function resolvePath(pathStr) {
  if (!pathStr) return pathStr;

  // If it's already absolute, return as-is
  if (path.isAbsolute(pathStr)) {
    return pathStr;
  }

  // Resolve relative to the project root (where package.json is)
  return path.resolve(process.cwd(), pathStr);
}

const config = {
  // Node environment
  nodeEnv: process.env.NODE_ENV || "development",

  // Docker configuration
  docker: {
    host: process.env.DOCKER_HOST || "unix:///var/run/docker.sock",
    apiVersion: process.env.DOCKER_API_VERSION || undefined, // Auto-detect

    // Default resource limits
    defaultMemoryMB: parseInt(
      process.env.JUDGEHOST_CONTAINER_MAX_MEMORY_MB || "4096",
      10
    ),
    defaultCpuCores: parseFloat(
      process.env.JUDGEHOST_CONTAINER_MAX_CPU_CORES || "4.0"
    ),
    defaultDiskMB: parseInt(
      process.env.JUDGEHOST_CONTAINER_MAX_DISK_MB || "10240",
      10
    ),
    defaultTimeout:
      parseInt(process.env.JUDGEHOST_DEFAULT_TIMEOUT_SECONDS || "600", 10) *
      1000, // Convert to ms

    // Network
    networkBridgeName:
      process.env.NETWORK_BRIDGE_NAME || "judgehost-eval-network",
    networkSubnet: process.env.NETWORK_SUBNET || "172.20.0.0/16",

    // Cleanup
    cleanupContainersAfterEval:
      process.env.CLEANUP_CONTAINERS_AFTER_EVAL !== "false",
    cleanupImagesOlderThanDays: parseInt(
      process.env.CLEANUP_IMAGES_OLDER_THAN_DAYS || "7",
      10
    ),
    cacheDockerImages: process.env.CACHE_DOCKER_IMAGES !== "false",
  },

  // Resource limits
  resources: {
    maxWorkers: parseInt(process.env.JUDGEHOST_MAX_WORKERS || "3", 10),
    maxMemoryMB: parseInt(process.env.JUDGEHOST_MAX_MEMORY_MB || "8192", 10),
    maxCpuCores: parseFloat(process.env.JUDGEHOST_MAX_CPU_CORES || "8.0"),
  },

  // Queue configuration
  queue: {
    maxSize: parseInt(process.env.JUDGEHOST_MAX_QUEUE_SIZE || "100", 10),
    persistence: process.env.JUDGEHOST_QUEUE_PERSISTENCE === "true",
    dbPath:
      process.env.JUDGEHOST_QUEUE_DB_PATH || "/var/lib/judgehost/queue.db",
    rateLimitEnabled: process.env.JUDGEHOST_RATE_LIMIT_ENABLED === "true",
    rateLimitPerTeam: parseInt(
      process.env.JUDGEHOST_RATE_LIMIT_PER_TEAM || "10",
      10
    ),
  },

  // File system paths
  paths: {
    workDir: resolvePath(process.env.JUDGEHOST_WORK_DIR || "/tmp/judgehost"),
    problemsDir: resolvePath(
      process.env.JUDGEHOST_PROBLEMS_DIR || "/var/lib/judgehost/problems"
    ),
    submissionsDir: resolvePath(
      process.env.JUDGEHOST_SUBMISSIONS_DIR || "/var/lib/judgehost/submissions"
    ),
    resultsDir: resolvePath(
      process.env.JUDGEHOST_RESULTS_DIR || "/var/lib/judgehost/results"
    ),
    logsDir: resolvePath(
      process.env.JUDGEHOST_LOGS_DIR || "/var/log/judgehost"
    ),
  },

  // API server configuration
  api: {
    port: parseInt(process.env.API_PORT || "3000", 10),
    host: process.env.API_HOST || "0.0.0.0",
    basePath: process.env.API_BASE_PATH || "/api",
    maxUploadSizeMB: parseInt(process.env.API_MAX_UPLOAD_SIZE_MB || "500", 10),

    // CORS
    corsEnabled: process.env.API_CORS_ENABLED === "true",
    corsOrigin: process.env.API_CORS_ORIGIN || "*",

    // Authentication
    authEnabled: process.env.API_AUTH_ENABLED !== "false", // Default true
    authType: process.env.API_AUTH_TYPE || "basic",
    authUsername: process.env.API_AUTH_USERNAME,
    authPassword: process.env.API_AUTH_PASSWORD,
    authToken: process.env.API_AUTH_TOKEN,
  },

  // DOMserver configuration for result submission
  domserver: {
    enabled: process.env.DOMSERVER_ENABLED === "true",
    url: process.env.DOMSERVER_URL || "",
    apiVersion: process.env.DOMSERVER_API_VERSION || "v4",
    username: process.env.DOMSERVER_USERNAME || "",
    password: process.env.DOMSERVER_PASSWORD || "",
    hostname: process.env.JUDGEHOST_HOSTNAME || require("os").hostname(),

    // Result submission settings
    submitResults: process.env.DOMSERVER_SUBMIT_RESULTS !== "false",
    submitOnComplete: process.env.DOMSERVER_SUBMIT_ON_COMPLETE !== "false",

    // Retry settings (currently not used; single-post behavior only)
    retryEnabled: process.env.DOMSERVER_RETRY_ENABLED === "true",
    retryMaxAttempts: parseInt(
      process.env.DOMSERVER_RETRY_MAX_ATTEMPTS || "3",
      10
    ),
    retryDelayMs: parseInt(process.env.DOMSERVER_RETRY_DELAY_MS || "1000", 10),
    retryBackoffMultiplier: parseFloat(
      process.env.DOMSERVER_RETRY_BACKOFF_MULTIPLIER || "2.0"
    ),

    // Timeout settings
    timeoutMs: parseInt(process.env.DOMSERVER_TIMEOUT_MS || "30000", 10),

    // Public URL for this judgehost (for logs/artifacts URLs)
    publicUrl: process.env.JUDGEHOST_PUBLIC_URL || "",
  },

  // Security
  security: {
    containerProfile: process.env.CONTAINER_SECURITY_PROFILE || "restricted",
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || "info",
    format: process.env.LOG_FORMAT || "json",
    consoleEnabled: process.env.LOG_CONSOLE_ENABLED !== "false",
    fileEnabled: process.env.LOG_FILE_ENABLED !== "false",
    fileMaxSizeMB: parseInt(process.env.LOG_FILE_MAX_SIZE_MB || "100", 10),
    fileMaxFiles: parseInt(process.env.LOG_FILE_MAX_FILES || "10", 10),
  },

  // Git integration
  git: {
    defaultTimeoutSeconds: parseInt(
      process.env.GIT_DEFAULT_TIMEOUT_SECONDS || "300",
      10
    ),
    maxRepoSizeMB: parseInt(process.env.GIT_MAX_REPO_SIZE_MB || "100", 10),
    shallowClone: process.env.GIT_SHALLOW_CLONE !== "false",
  },

  // Monitoring
  monitoring: {
    metricsEnabled: process.env.METRICS_ENABLED !== "false",
    metricsPort: parseInt(process.env.METRICS_PORT || "9090", 10),
    metricsPath: process.env.METRICS_PATH || "/metrics",
    healthcheckEnabled: process.env.HEALTHCHECK_ENABLED !== "false",
    healthcheckPort: parseInt(process.env.HEALTHCHECK_PORT || "3001", 10),
  },

  // Development/debugging
  debug: {
    debugMode: process.env.DEBUG_MODE === "true",
    mockDocker: process.env.MOCK_DOCKER === "true",
  },
};

// Validate required configurations
function validateConfig() {
  const errors = [];

  // Check if auth is enabled but credentials not provided
  if (config.api.authEnabled && config.api.authType === "basic") {
    if (!config.api.authUsername || !config.api.authPassword) {
      errors.push(
        "API_AUTH_USERNAME and API_AUTH_PASSWORD required when API_AUTH_TYPE=basic"
      );
    }
  }

  if (config.api.authEnabled && config.api.authType === "token") {
    if (!config.api.authToken) {
      errors.push("API_AUTH_TOKEN required when API_AUTH_TYPE=token");
    }
  }

  // Check resource limits are reasonable
  if (config.resources.maxWorkers < 1) {
    errors.push("JUDGEHOST_MAX_WORKERS must be at least 1");
  }

  if (config.queue.maxSize < 1) {
    errors.push("JUDGEHOST_MAX_QUEUE_SIZE must be at least 1");
  }

  return errors;
}

// Helper to get dockerode options
function getDockerOptions() {
  const options = {};

  if (config.docker.host.startsWith("unix://")) {
    options.socketPath = config.docker.host.replace("unix://", "");
  } else if (config.docker.host.startsWith("tcp://")) {
    const url = new URL(config.docker.host);
    options.host = url.hostname;
    options.port = parseInt(url.port, 10);
  } else {
    options.socketPath = config.docker.host;
  }

  if (config.docker.apiVersion) {
    options.version = config.docker.apiVersion;
  }

  return options;
}

// Validate on load (in production)
if (config.nodeEnv === "production") {
  const errors = validateConfig();
  if (errors.length > 0) {
    console.error("Configuration validation failed:");
    errors.forEach((err) => console.error(`  - ${err}`));
    process.exit(1);
  }
}

module.exports = {
  ...config,
  validateConfig,
  getDockerOptions,
};
