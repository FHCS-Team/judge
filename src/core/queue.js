/**
 * Priority-based job queue system for judgehost
 * Implements immutable queue with event-driven architecture
 */

const EventEmitter = require("events");
const logger = require("../utils/logger");
const config = require("../config");

// Job states
const JobState = {
  QUEUED: "queued",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
};

// Priority levels (1-10, 10 = highest priority, 1 = lowest)
const Priority = {
  LOWEST: 1,
  LOW: 3,
  NORMAL: 5,
  HIGH: 7,
  HIGHEST: 10,
};

class Queue extends EventEmitter {
  constructor(options = {}) {
    super();

    this.maxSize = options.maxSize || config.queue.maxSize;
    this.maxWorkers = options.maxWorkers || config.resources.maxWorkers;
    this.autoProcess = options.autoProcess !== false; // Default to true, can be disabled for testing

    // Immutable-style state management
    this.jobs = new Map(); // jobId -> job
    this.queue = []; // Array of job IDs in priority order
    this.runningJobs = new Set(); // Set of running job IDs
    this.workers = new Map(); // workerId -> { jobId, startTime }

    // Rate limiting
    this.rateLimits = new Map(); // teamId -> [timestamps]
    this.rateLimitEnabled = config.queue.rateLimitEnabled;
    this.rateLimitPerTeam = config.queue.rateLimitPerTeam;

    // Stats
    this.stats = {
      totalEnqueued: 0,
      totalCompleted: 0,
      totalFailed: 0,
      totalCancelled: 0,
    };
  }

  /**
   * Generate unique job ID
   */
  _generateJobId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `job_${timestamp}${random}`;
  }

  /**
   * Check rate limit for team
   */
  _checkRateLimit(teamId) {
    if (!this.rateLimitEnabled || !teamId) {
      return true;
    }

    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute

    // Get recent submissions for this team
    const timestamps = this.rateLimits.get(teamId) || [];

    // Filter to only timestamps within window
    const recentTimestamps = timestamps.filter((ts) => now - ts < windowMs);

    // Check if under limit
    if (recentTimestamps.length >= this.rateLimitPerTeam) {
      return false;
    }

    // Update rate limit tracking
    recentTimestamps.push(now);
    this.rateLimits.set(teamId, recentTimestamps);

    return true;
  }

  /**
   * Enqueue a new job
   * Returns job object or throws error
   */
  enqueue(submission) {
    // Validate submission
    if (!submission.problemId) {
      throw new Error("Submission must have problemId");
    }

    // Check queue size limit
    if (this.queue.length >= this.maxSize) {
      throw new Error(`Queue is full (max size: ${this.maxSize})`);
    }

    // Check rate limit
    if (!this._checkRateLimit(submission.teamId)) {
      throw new Error(`Rate limit exceeded for team ${submission.teamId}`);
    }

    // Clamp priority to valid range (1-10)
    let priority = submission.priority || Priority.NORMAL;
    if (priority < 1) priority = 1;
    if (priority > 10) priority = 10;

    // Create job
    const job = {
      id: submission.submissionId || this._generateJobId(),
      submissionId: submission.submissionId || this._generateJobId(),
      problemId: submission.problemId,
      teamId: submission.teamId,
      priority: priority,
      state: JobState.QUEUED,
      status: JobState.QUEUED, // Add status alias for compatibility

      // Submission details
      packageType: submission.packageType,
      gitUrl: submission.gitUrl,
      gitBranch: submission.gitBranch,
      gitCommit: submission.gitCommit,
      packageUrl: submission.packageUrl,
      archiveChecksum: submission.archiveChecksum,
      // Local file path for uploaded submissions (if any)
      localPath: submission.localPath,
      // For multi-package submissions, include packages array
      packages: submission.packages,

      // Metadata
      metadata: submission.metadata || {},
      notificationUrl: submission.notificationUrl,
      timeoutOverride: submission.timeoutOverride,

      // Timestamps
      enqueuedAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,

      // Results
      result: null,
      error: null,
    };

    // Add to jobs map
    this.jobs.set(job.id, job);

    // Add to queue in priority order
    this._insertByPriority(job.id);

    // Update stats
    this.stats.totalEnqueued++;

    // Emit event
    this.emit("job:queued", job);

    logger.info(`Job ${job.id} enqueued (priority: ${job.priority})`);

    // Try to start processing if workers available and auto-processing enabled
    if (this.autoProcess) {
      this._processQueue();
    }

    return { ...job }; // Return copy
  }

  /**
   * Insert job ID into queue maintaining priority order
   * Higher priority numbers come first (10 = highest, 1 = lowest)
   * Ties broken by enqueue time (FIFO)
   */
  _insertByPriority(jobId) {
    const job = this.jobs.get(jobId);

    // Find insertion point
    let insertIndex = this.queue.length; // Default to end
    for (let i = 0; i < this.queue.length; i++) {
      const queuedJob = this.jobs.get(this.queue[i]);

      // Higher priority number = higher priority, goes first
      if (job.priority > queuedJob.priority) {
        insertIndex = i;
        break;
      }
    }

    // Insert at position
    this.queue.splice(insertIndex, 0, jobId);
  }

  /**
   * Process queue - start jobs if workers available
   */
  _processQueue() {
    // Check if we can start more jobs
    while (this.runningJobs.size < this.maxWorkers && this.queue.length > 0) {
      const jobId = this.queue.shift();
      const job = this.jobs.get(jobId);

      if (!job || job.state !== JobState.QUEUED) {
        continue;
      }

      // Start job
      this._startJob(jobId);
    }
  }

  /**
   * Manually trigger queue processing (for manual control or testing)
   */
  processQueue() {
    this._processQueue();
  }

  /**
   * Start processing a job
   */
  _startJob(jobId) {
    const job = this.jobs.get(jobId);

    // Update job state
    job.state = JobState.RUNNING;
    job.status = JobState.RUNNING; // Add status alias for compatibility
    job.startedAt = new Date().toISOString();

    // Add to running jobs
    this.runningJobs.add(jobId);

    // Assign to worker
    const workerId = `worker_${Date.now()}_${Math.random()
      .toString(36)
      .substring(7)}`;
    this.workers.set(workerId, {
      jobId,
      startTime: Date.now(),
    });

    // Emit event
    this.emit("job:started", { ...job });

    logger.info(`Job ${jobId} started on worker ${workerId}`);
  }

  /**
   * Mark job as completed
   */
  completeJob(jobId, result) {
    const job = this.jobs.get(jobId);

    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    if (job.state !== JobState.RUNNING) {
      throw new Error(`Job ${jobId} is not running (state: ${job.state})`);
    }

    // Update job
    job.state = JobState.COMPLETED;
    job.status = JobState.COMPLETED; // Add status alias for compatibility
    job.completedAt = new Date().toISOString();
    job.result = result;

    // Remove from running jobs
    this.runningJobs.delete(jobId);

    // Find and remove worker assignment
    for (const [workerId, worker] of this.workers.entries()) {
      if (worker.jobId === jobId) {
        this.workers.delete(workerId);
        break;
      }
    }

    // Update stats
    this.stats.totalCompleted++;

    // Emit event with job and result as separate arguments
    this.emit("job:completed", { ...job }, result);

    logger.info(`Job ${jobId} completed`);

    // Process next job in queue
    this._processQueue();

    return { ...job };
  }

  /**
   * Mark job as failed
   */
  failJob(jobId, error) {
    const job = this.jobs.get(jobId);

    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    // Update job
    job.state = JobState.FAILED;
    job.status = JobState.FAILED; // Add status alias for compatibility
    job.completedAt = new Date().toISOString();
    job.error = error;

    // Remove from running jobs if it was running
    this.runningJobs.delete(jobId);

    // Find and remove worker assignment
    for (const [workerId, worker] of this.workers.entries()) {
      if (worker.jobId === jobId) {
        this.workers.delete(workerId);
        break;
      }
    }

    // Update stats
    this.stats.totalFailed++;

    // Emit event with job and error as separate arguments
    this.emit("job:failed", { ...job }, error);

    logger.error(`Job ${jobId} failed:`, error);

    // Process next job in queue
    this._processQueue();

    return { ...job };
  }

  /**
   * Cancel a job
   */
  cancelJob(jobId) {
    const job = this.jobs.get(jobId);

    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    if (job.state === JobState.COMPLETED || job.state === JobState.FAILED) {
      throw new Error(`Cannot cancel job ${jobId} - already ${job.state}`);
    }

    // Update job
    const previousState = job.state;
    job.state = JobState.CANCELLED;
    job.status = JobState.CANCELLED; // Add status alias for compatibility
    job.completedAt = new Date().toISOString();

    // Remove from queue if queued
    if (previousState === JobState.QUEUED) {
      const index = this.queue.indexOf(jobId);
      if (index !== -1) {
        this.queue.splice(index, 1);
      }
    }

    // Remove from running jobs if running
    if (previousState === JobState.RUNNING) {
      this.runningJobs.delete(jobId);

      // Find and remove worker assignment
      for (const [workerId, worker] of this.workers.entries()) {
        if (worker.jobId === jobId) {
          this.workers.delete(workerId);
          break;
        }
      }
    }

    // Update stats
    this.stats.totalCancelled++;

    // Emit event
    this.emit("job:cancelled", { ...job });

    logger.info(`Job ${jobId} cancelled`);

    // Process next job in queue if we freed a worker
    if (previousState === JobState.RUNNING) {
      this._processQueue();
    }

    return { ...job };
  }

  /**
   * Get job by ID
   */
  getJob(jobId) {
    const job = this.jobs.get(jobId);
    return job ? { ...job } : null;
  }

  /**
   * Get all jobs (optionally filtered by state)
   * Returns jobs in priority order for queued jobs
   */
  getJobs(state = null) {
    if (state === JobState.QUEUED) {
      // Return queued jobs in queue order (priority order)
      return this.queue.map((jobId) => {
        const job = this.jobs.get(jobId);
        return { ...job };
      });
    }

    const jobs = Array.from(this.jobs.values());

    if (state) {
      return jobs
        .filter((job) => job.state === state)
        .map((job) => ({ ...job }));
    }

    // For all jobs or mixed states, return queued jobs first (in priority order),
    // then other jobs in insertion order
    const queuedJobs = this.queue.map((jobId) => ({ ...this.jobs.get(jobId) }));
    const otherJobs = jobs
      .filter((job) => job.state !== JobState.QUEUED)
      .map((job) => ({ ...job }));

    return [...queuedJobs, ...otherJobs];
  }

  /**
   * Get queue status
   */
  getStatus() {
    return {
      queueSize: this.queue.length,
      runningJobs: this.runningJobs.size,
      availableWorkers: this.maxWorkers - this.runningJobs.size,
      totalJobs: this.jobs.size,
      stats: { ...this.stats },
      queue: this.queue.map((jobId) => {
        const job = this.jobs.get(jobId);
        return {
          id: job.id,
          problemId: job.problemId,
          priority: job.priority,
          enqueuedAt: job.enqueuedAt,
        };
      }),
    };
  }

  /**
   * Get queue statistics (test-compatible format)
   */
  getStats() {
    const queuedJobs = this.queue.length;
    const runningJobs = this.runningJobs.size;
    const completedJobs = Array.from(this.jobs.values()).filter(
      (job) => job.state === JobState.COMPLETED
    ).length;
    const failedJobs = Array.from(this.jobs.values()).filter(
      (job) => job.state === JobState.FAILED
    ).length;

    return {
      total: this.jobs.size,
      queued: queuedJobs,
      running: runningJobs,
      completed: completedJobs,
      failed: failedJobs,
      availableWorkers: this.maxWorkers - runningJobs,
      maxWorkers: this.maxWorkers,
      ...this.stats,
    };
  }

  /**
   * Get all jobs (alias for getJobs for test compatibility)
   */
  getAllJobs() {
    return this.getJobs();
  }

  /**
   * Get position of job in queue
   */
  getQueuePosition(jobId) {
    const index = this.queue.indexOf(jobId);
    return index === -1 ? null : index + 1; // 1-indexed
  }

  /**
   * Estimate wait time for job
   */
  estimateWaitTime(jobId) {
    const position = this.getQueuePosition(jobId);

    if (position === null) {
      return null; // Not in queue
    }

    // Simple estimation: assume each job takes average completion time
    // In real implementation, this could be more sophisticated
    const avgJobTimeMs = 300000; // 5 minutes average
    const estimatedMs = (position * avgJobTimeMs) / this.maxWorkers;

    return Math.ceil(estimatedMs / 1000); // Return seconds
  }
}

// Singleton instance
let queueInstance = null;

/**
 * Get queue instance (singleton)
 */
function getQueue() {
  if (!queueInstance) {
    queueInstance = new Queue();
  }
  return queueInstance;
}

/**
 * Enqueue a submission
 */
function enqueue(submission) {
  return getQueue().enqueue(submission);
}

/**
 * Get queue status
 */
function getQueueStatus() {
  return getQueue().getStatus();
}

/**
 * Get job by ID
 */
function getJob(jobId) {
  return getQueue().getJob(jobId);
}

/**
 * Complete a job
 */
function completeJob(jobId, result) {
  return getQueue().completeJob(jobId, result);
}

/**
 * Fail a job
 */
function failJob(jobId, error) {
  return getQueue().failJob(jobId, error);
}

/**
 * Cancel a job
 */
function cancelJob(jobId) {
  return getQueue().cancelJob(jobId);
}

/**
 * Queue events emitter
 */
const queueEvents = {
  on: (event, handler) => getQueue().on(event, handler),
  once: (event, handler) => getQueue().once(event, handler),
  off: (event, handler) => getQueue().off(event, handler),
};

module.exports = {
  Queue,
  JobState,
  Priority,
  getQueue,
  enqueue,
  getQueueStatus,
  getJob,
  completeJob,
  failJob,
  cancelJob,
  queueEvents,
};
