/**
 * @file Job model - Type definitions for queue job management
 */

/**
 * Job in the queue
 * @typedef {Object} Job
 * @property {string} id - Unique job identifier (same as submissionId)
 * @property {string} submissionId - Submission identifier
 * @property {string} problemId - Problem identifier
 * @property {string} teamId - Team identifier
 * @property {number} priority - Priority level (1-10, higher = more important)
 * @property {string} status - Job status: 'queued', 'running', 'completed', 'failed', 'cancelled'
 * @property {Date} createdAt - Job creation timestamp
 * @property {Date} [startedAt] - Job execution start timestamp
 * @property {Date} [completedAt] - Job completion timestamp
 * @property {string} [workerId] - Worker processing this job
 * @property {string} [currentStage] - Current evaluation stage
 * @property {number} [progress] - Progress percentage (0-100)
 * @property {string} [error] - Error message if failed
 * @property {Object} submissionData - Full submission job data
 * @property {number} [retryCount] - Number of retry attempts
 * @property {Object} [metadata] - Additional job metadata
 */

/**
 * Queue statistics
 * @typedef {Object} QueueStats
 * @property {number} total - Total jobs in queue
 * @property {number} queued - Jobs waiting to be processed
 * @property {number} running - Jobs currently being processed
 * @property {number} completed - Completed jobs (may be pruned)
 * @property {number} failed - Failed jobs (may be pruned)
 * @property {number} availableWorkers - Number of idle workers
 * @property {number} maxWorkers - Maximum worker count
 * @property {Object<string, number>} byPriority - Job count by priority level
 * @property {Object<string, number>} byTeam - Job count by team
 */

/**
 * Queue configuration
 * @typedef {Object} QueueConfig
 * @property {number} maxSize - Maximum queue size
 * @property {number} maxWorkers - Maximum concurrent workers
 * @property {number} maxJobsPerTeam - Maximum jobs per team
 * @property {number} [pruneInterval] - Interval to prune completed jobs (ms)
 * @property {number} [jobRetention] - How long to keep completed jobs (ms)
 */

/**
 * Worker state
 * @typedef {Object} WorkerState
 * @property {string} workerId - Unique worker identifier
 * @property {string} status - Status: 'idle', 'busy'
 * @property {string} [currentJobId] - Job being processed
 * @property {Date} [startedAt] - When current job started
 * @property {number} [jobsProcessed] - Total jobs processed by this worker
 */

/**
 * Job event types
 * @typedef {string} JobEvent
 * @enum {string}
 */
const JobEvent = {
  QUEUED: "job:queued",
  STARTED: "job:started",
  PROGRESS: "job:progress",
  COMPLETED: "job:completed",
  FAILED: "job:failed",
  CANCELLED: "job:cancelled",
  STAGE_CHANGED: "job:stage_changed",
};

/**
 * Job progress update
 * @typedef {Object} JobProgress
 * @property {string} jobId - Job identifier
 * @property {string} stage - Current stage
 * @property {number} progress - Progress percentage (0-100)
 * @property {string} [message] - Progress message
 * @property {Date} timestamp - Update timestamp
 */

module.exports = {
  JobEvent,
};
