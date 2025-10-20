/**
 * Judgehost API Server
 * Main entry point for the judgehost application
 */

const express = require("express");
const logger = require("../utils/logger");
const config = require("../config");
const { initializeProcessor } = require("../core/processor");
const { getQueueStatus } = require("../core/queue");
const { cleanupStaleNetworks } = require("../core/docker/network");

// Periodic cleanup of stale networks (every 15 minutes)
const NETWORK_CLEANUP_INTERVAL = 15 * 60 * 1000; // 15 minutes
setInterval(async () => {
  try {
    logger.debug("Running scheduled network cleanup...");
    const cleaned = await cleanupStaleNetworks(60); // Clean networks older than 60 minutes
    if (cleaned > 0) {
      logger.info(`Scheduled cleanup removed ${cleaned} stale networks`);
    }
  } catch (error) {
    logger.error("Error during scheduled network cleanup:", error);
  }
}, NETWORK_CLEANUP_INTERVAL);

// Run initial cleanup on startup
(async () => {
  try {
    logger.info("Running initial network cleanup on startup...");
    const cleaned = await cleanupStaleNetworks(30); // Clean networks older than 30 minutes
    if (cleaned > 0) {
      logger.info(`Startup cleanup removed ${cleaned} stale networks`);
    }
  } catch (error) {
    logger.error("Error during startup network cleanup:", error);
  }
})();

// Create express app
const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS middleware
if (config.api.corsEnabled) {
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", config.api.corsOrigin);
    res.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, OPTIONS"
    );
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }

    next();
  });
}

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// Import routes
const problemsRouter = require("./routes/problems");
const submissionsRouter = require("./routes/submissions");
const resultsRouter = require("./routes/results");
const healthRouter = require("./routes/health");

// Mount routes
app.use(`${config.api.basePath}/problems`, problemsRouter);
app.use(`${config.api.basePath}/submissions`, submissionsRouter);
app.use(`${config.api.basePath}/results`, resultsRouter);
app.use(`${config.api.basePath}/health`, healthRouter);

// Queue status endpoint
app.get(`${config.api.basePath}/queue`, (req, res) => {
  try {
    const status = getQueueStatus();
    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    logger.error("Error getting queue status:", error);
    res.status(500).json({
      success: false,
      error: "queue_status_failed",
      message: error.message,
    });
  }
});

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    name: "Judgehost",
    version: "0.1.0",
    status: "running",
    endpoints: {
      problems: `${config.api.basePath}/problems`,
      submissions: `${config.api.basePath}/submissions`,
      results: `${config.api.basePath}/results`,
      queue: `${config.api.basePath}/queue`,
      health: `${config.api.basePath}/health`,
    },
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "not_found",
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error("Unhandled error:", err);
  res.status(500).json({
    success: false,
    error: "internal_error",
    message: err.message,
  });
});

initializeProcessor();

// Start server
const PORT = config.api.port;
const HOST = config.api.host;

app.listen(PORT, HOST, () => {
  logger.info(`Judgehost server running on http://${HOST}:${PORT}`);
  logger.info(`API base path: ${config.api.basePath}`);
  logger.info(`Max workers: ${config.resources.maxWorkers}`);
  logger.info(`Queue max size: ${config.queue.maxSize}`);
});

module.exports = app;
