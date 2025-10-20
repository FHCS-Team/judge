/**
 * @file Submission model - Type definitions for submission handling
 */

/**
 * Submission package source
 * @typedef {Object} SubmissionPackageSource
 * @property {string} package_id - Identifier matching problem's submission_packages config
 * @property {string} package_source - Source type: 'file', 'url', 'git'
 * @property {string} [package_url] - URL for 'url' source type
 * @property {string} [git_url] - Git repository URL for 'git' source
 * @property {string} [git_branch] - Git branch name (default: main)
 * @property {string} [git_commit] - Specific commit SHA
 * @property {Object} [file] - Multer file object for 'file' source
 * @property {string} [checksum] - SHA256 checksum for verification
 */

/**
 * Submission request (backward compatible with single package)
 * @typedef {Object} SubmissionRequest
 * @property {string} problem_id - Problem to evaluate against
 * @property {string} team_id - Team identifier
 *
 * Single-package mode (backward compatible):
 * @property {string} [package_source] - Source type: 'file', 'url', 'git'
 * @property {string} [package_url] - URL for 'url' source type
 * @property {string} [git_url] - Git repository URL for 'git' source
 * @property {string} [git_branch] - Git branch name (default: main)
 * @property {string} [git_commit] - Specific commit SHA
 * @property {Object} [file] - Multer file object for 'file' source
 * @property {string} [checksum] - SHA256 checksum for verification
 *
 * Multi-package mode:
 * @property {Array<SubmissionPackageSource>} [packages] - Multiple submission packages
 *
 * Common fields:
 * @property {number} [priority] - Job priority (1-10, default: 5)
 * @property {string} [callback_url] - Webhook URL for results
 * @property {Object} [metadata] - Additional submission metadata
 */

/**
 * Submission job (internal representation)
 * @typedef {Object} SubmissionJob
 * @property {string} submissionId - Unique submission identifier
 * @property {string} problemId - Problem identifier
 * @property {string} teamId - Team identifier
 * @property {number} priority - Job priority (1-10)
 *
 * Single-package mode (backward compatible):
 * @property {string} [packageSource] - Source type: 'file', 'url', 'git'
 * @property {string} [packageUrl] - URL for download
 * @property {string} [gitUrl] - Git repository URL
 * @property {string} [gitBranch] - Git branch
 * @property {string} [gitCommit] - Git commit SHA
 * @property {string} [localPath] - Local file path
 * @property {string} [checksum] - SHA256 checksum
 *
 * Multi-package mode:
 * @property {Array<SubmissionPackageSource>} [packages] - Multiple submission packages
 *
 * Common fields:
 * @property {string} [callbackUrl] - Webhook URL
 * @property {string} submissionDir - Working directory path
 * @property {Date} submittedAt - Submission timestamp
 * @property {Object} [metadata] - Additional metadata
 */

/**
 * Submission status
 * @typedef {Object} SubmissionStatus
 * @property {string} submission_id - Unique identifier
 * @property {string} status - Status: 'queued', 'running', 'completed', 'failed', 'cancelled'
 * @property {string} [current_stage] - Current processing stage
 * @property {number} [progress] - Progress percentage (0-100)
 * @property {Date} submitted_at - Submission timestamp
 * @property {Date} [started_at] - Processing start timestamp
 * @property {Date} [completed_at] - Completion timestamp
 * @property {string} [error] - Error message if failed
 * @property {number} [queue_position] - Position in queue if queued
 * @property {Object} [metadata] - Additional metadata
 */

/**
 * Evaluation stages
 * @typedef {string} EvaluationStage
 * @enum {string}
 */
const EvaluationStage = {
  QUEUED: "queued",
  DOWNLOADING: "downloading_submission",
  BUILDING: "building_evaluation_image",
  DEPLOYING: "deploying",
  RUNNING_PRE_HOOKS: "running_pre_hooks",
  RUNNING_POST_HOOKS: "running_post_hooks",
  COLLECTING_RESULTS: "collecting_results",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
};

module.exports = {
  EvaluationStage,
};
