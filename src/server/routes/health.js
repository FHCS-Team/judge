/**
 * Health Check Route
 * Provides system health and status information
 */

const express = require("express");
const os = require("os");
const config = require("../../config");
const { getQueueStatus } = require("../../core/queue");
const { getProcessor } = require("../../core/processor");

const router = express.Router();

const startTime = Date.now();

router.get("/", (_req, res) => {
  try {
    // Get queue status
    const queueStatus = getQueueStatus();

    // Get active evaluations
    const processor = getProcessor();
    const activeEvaluations = processor.getActiveEvaluations();

    // System info
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const memUsage = process.memoryUsage();
    const systemMem = {
      total: os.totalmem(),
      free: os.freemem(),
      used: os.totalmem() - os.freemem(),
    };

    res.json({
      status: "healthy",
      version: "0.1.0",
      uptime_seconds: uptime,
      timestamp: new Date().toISOString(),
      queue: {
        size: queueStatus.queueSize,
        running: queueStatus.runningJobs,
        available_workers: queueStatus.availableWorkers,
      },
      evaluations: {
        active: activeEvaluations.length,
        states: activeEvaluations.reduce((acc, e) => {
          acc[e.state] = (acc[e.state] || 0) + 1;
          return acc;
        }, {}),
      },
      system: {
        node_version: process.version,
        platform: process.platform,
        arch: process.arch,
        cpu_cores: os.cpus().length,
        memory: {
          process_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
          system_total_mb: Math.round(systemMem.total / 1024 / 1024),
          system_used_mb: Math.round(systemMem.used / 1024 / 1024),
          system_free_mb: Math.round(systemMem.free / 1024 / 1024),
        },
      },
      config: {
        max_workers: config.resources.maxWorkers,
        max_queue_size: config.queue.maxSize,
        docker_host: config.docker.host,
      },
    });
  } catch (error) {
    res.status(503).json({
      status: "unhealthy",
      error: error.message,
    });
  }
});

module.exports = router;
