/**
 * @file Result model - Type definitions for evaluation results
 */

/**
 * Rubric score result
 * @typedef {Object} RubricScore
 * @property {string} rubric_id - Rubric identifier
 * @property {string} rubric_name - Rubric name
 * @property {string} rubric_type - Type: 'binary', 'numeric', 'percentage', 'custom'
 * @property {number} score - Achieved score
 * @property {number} max_score - Maximum possible score
 * @property {number} percentage - Score percentage (0-100)
 * @property {boolean} [passed] - Pass/fail status for binary rubrics
 * @property {string} [message] - Evaluation message
 * @property {Object} [details] - Additional rubric-specific details
 * @property {Array<Object>} [test_cases] - Individual test case results
 */

/**
 * Evaluation result
 * @typedef {Object} EvaluationResult
 * @property {string} submission_id - Submission identifier
 * @property {string} problem_id - Problem identifier
 * @property {string} team_id - Team identifier
 * @property {string} status - Final status: 'success', 'failed', 'timeout', 'error'
 * @property {Date} evaluated_at - Evaluation completion timestamp
 * @property {boolean} timed_out - Whether execution timed out
 * @property {Object<string, RubricScore>} rubric_scores - Scores by rubric_id
 * @property {number} total_score - Sum of all rubric scores
 * @property {number} max_score - Sum of all max rubric scores
 * @property {number} percentage - Overall percentage (0-100)
 * @property {string} [logs] - Execution logs
 * @property {Array<string>} [artifacts] - Generated artifact files
 * @property {ExecutionMetrics} [metrics] - Resource usage metrics
 * @property {Object} [metadata] - Additional result metadata
 */

/**
 * Execution metrics
 * @typedef {Object} ExecutionMetrics
 * @property {number} execution_time - Total execution time in seconds
 * @property {number} [memory_used] - Peak memory usage in bytes
 * @property {number} [cpu_time] - CPU time used in seconds
 * @property {number} [disk_read] - Disk bytes read
 * @property {number} [disk_write] - Disk bytes written
 * @property {number} [network_rx] - Network bytes received
 * @property {number} [network_tx] - Network bytes transmitted
 */

/**
 * Result query options
 * @typedef {Object} ResultQueryOptions
 * @property {boolean} [include_logs] - Include full logs in response
 * @property {boolean} [include_artifacts] - Include artifact list
 * @property {boolean} [include_metrics] - Include resource metrics
 * @property {boolean} [include_rubric_details] - Include detailed rubric info
 */

/**
 * Artifact file info
 * @typedef {Object} ArtifactInfo
 * @property {string} filename - Artifact filename
 * @property {number} size - File size in bytes
 * @property {string} mime_type - MIME type
 * @property {Date} created_at - Creation timestamp
 * @property {string} download_url - URL to download artifact
 */

/**
 * Webhook notification payload
 * @typedef {Object} WebhookPayload
 * @property {string} event - Event type: 'evaluation.completed', 'evaluation.failed'
 * @property {string} submission_id - Submission identifier
 * @property {string} problem_id - Problem identifier
 * @property {string} team_id - Team identifier
 * @property {string} status - Final status
 * @property {Date} timestamp - Event timestamp
 * @property {Object} result - Evaluation result summary
 * @property {number} result.total_score - Total score achieved
 * @property {number} result.max_score - Maximum possible score
 * @property {number} result.percentage - Overall percentage
 * @property {boolean} result.timed_out - Whether execution timed out
 * @property {string} [result.error] - Error message if failed
 */

module.exports = {};
