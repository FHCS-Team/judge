/**
 * DOMserver Client
 * Handles communication with the DOMserver API for submitting evaluation results
 */

const { createClient, defaultInstance } = require("./axios");
const logger = require("./logger");
const config = require("../config");

/**
 * Create DOMserver client instance
 */
function createDOMServerClient() {
  if (!config.domserver.enabled) {
    logger.warn("DOMserver integration is disabled");
    return null;
  }

  if (!config.domserver.url) {
    logger.error("DOMserver URL is not configured");
    return null;
  }

  const auth = {
    username: config.domserver.username,
    password: config.domserver.password,
  };

  // Use axios util to create a client with consistent interceptors and logging
  const client = createClient({
    baseURL: `${config.domserver.url}/api/${config.domserver.apiVersion}`,
    timeout: config.domserver.timeoutMs,
    auth,
    headers: {
      "Content-Type": "application/json",
      "X-Judgehost-Version": require("../../package.json").version || "1.0.0",
    },
  });

  return client;
}

// Singleton instance
let clientInstance = null;

// Track submissions already posted to DOMserver in-process to prevent duplicates
// Key: submission_id, Value: true when a POST has been attempted
const postedSubmissions = new Set();

/**
 * Get DOMserver client instance
 */
function getClient() {
  if (!clientInstance) {
    clientInstance = createDOMServerClient();
  }
  return clientInstance;
}

/**
 * Build the public URL for judgehost resources
 * @param {string} path - Resource path
 * @returns {string} Full URL
 */
function buildPublicUrl(path) {
  const baseUrl =
    config.domserver.publicUrl ||
    `http://${config.api.host}:${config.api.port}`;
  return `${baseUrl}${path}`;
}

/**
 * Submit evaluation result to DOMserver
 * @param {Object} result - Evaluation result
 * @param {string} result.submission_id - Submission identifier
 * @param {string} result.problem_id - Problem identifier
 * @param {string} result.status - Evaluation status
 * @param {string} result.start_time - Start timestamp
 * @param {string} result.end_time - End timestamp
 * @param {Array} result.rubrics - Rubric results
 * @param {Object} result.error - Error details (if failed)
 * @param {number} [judgeTaskId] - Judge task ID assigned by DOMserver
 * @returns {Promise<Object>} Submission response
 */
async function submitResult(result, judgeTaskId = null) {
  const client = getClient();

  if (!client) {
    logger.warn("DOMserver client not available, skipping result submission");
    return { success: false, reason: "client_not_available" };
  }

  if (!config.domserver.submitResults) {
    logger.info("Result submission to DOMserver is disabled");
    return { success: false, reason: "submission_disabled" };
  }

  // Guard against duplicate posts per process lifecycle if enabled
  if (result?.submission_id) {
    if (postedSubmissions.has(result.submission_id)) {
      logger.warn("Skipping DOMserver submission: already posted once", {
        submission_id: result.submission_id,
      });
      return { success: false, reason: "already_posted" };
    }
    postedSubmissions.add(result.submission_id);
  }

  try {
    const {
      submission_id,
      problem_id,
      problem_config,
      status,
      start_time,
      end_time,
      rubrics,
      error,
    } = result;

    // Calculate execution time
    const startTime = new Date(start_time);
    const endTime = new Date(end_time);
    const executionTimeSeconds = (endTime - startTime) / 1000;

    // Calculate total scores
    const totalScore = rubrics.reduce((sum, r) => sum + (r.score || 0), 0);
    const maxScore = rubrics.reduce((sum, r) => sum + (r.max_score || 0), 0);
    const overallPercentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;

    // Build artifacts URLs
    const artifactsUrls = {};

    // Add standard metrics if available
    const metricsUrl = buildPublicUrl(`/api/results/${submission_id}/metrics`);
    artifactsUrls.metrics = metricsUrl;

    // Build the request payload
    const payload = {
      judge_task_id: judgeTaskId,
      submission_id,
      problem_id,
      status,
      started_at: start_time,
      completed_at: end_time,
      execution_time_seconds: executionTimeSeconds,
      total_score: totalScore,
      max_score: maxScore,
      percentage: overallPercentage,
      rubrics: rubrics.map((r) => ({
        rubric_id: r.rubric_id,
        name: r.name,
        rubric_type: r.rubric_type,
        score: r.score || 0,
        max_score: r.max_score,
        percentage:
          r.percentage || (r.max_score > 0 ? (r.score / r.max_score) * 100 : 0),
        status: r.status || "DONE",
        message: r.message || "",
        details: r.details || {},
      })),
      logs_url: buildPublicUrl(`/api/results/${submission_id}/logs`),
      artifacts_urls: artifactsUrls,
      metadata: {
        judgehost_version: require("../../package.json").version || "1.0.0",
        judgehost_hostname: config.domserver.hostname,
        docker_version: process.env.DOCKER_VERSION || "unknown",
        node_version: process.version,
        platform: process.platform,
        arch: process.arch,
        problem_version: problem_config?.version || "unknown",
        problem_name: problem_config?.problem_name || problem_id,
        project_type: problem_config?.project_type || "unknown",
        evaluation_method: "containerized_hooks",
        timestamp: new Date().toISOString(),
      },
    };

    // Add error details if status is failed or error
    if ((status === "failed" || status === "error") && error) {
      payload.error = {
        message: error.message || "Unknown error",
        code: error.code || "EVALUATION_ERROR",
        details: error.details || {},
      };
    }

    // Add custom metrics if available
    if (result.metrics) {
      payload.metrics = result.metrics;
    }

    logger.info("Submitting result to DOMserver via POST", {
      submission_id,
      problem_id,
      status,
      totalScore,
      maxScore,
      percentage: overallPercentage.toFixed(2),
      rubrics_count: rubrics.length,
      rubrics: rubrics.map((r) => ({
        id: r.rubric_id,
        name: r.name,
        score: r.score,
        max: r.max_score,
        pct:
          r.percentage ||
          (r.max_score > 0 ? ((r.score / r.max_score) * 100).toFixed(2) : 0),
      })),
    });

    // Submit with retry logic
    const response = await submitWithRetry(client, payload);

    logger.info("Result submitted successfully to DOMserver", {
      submission_id,
      result_id: response.data?.data?.result_id,
    });

    return {
      success: true,
      result_id: response.data?.data?.result_id,
      response: response.data,
    };
  } catch (error) {
    logger.error("Failed to submit result to DOMserver", {
      submission_id: result.submission_id,
      error: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });

    return {
      success: false,
      error: {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
      },
    };
  }
}

/**
 * Submit result with retry logic
 * @param {Object} client - Axios client instance
 * @param {Object} payload - Request payload
 * @param {number} attempt - Current attempt number
 * @returns {Promise<Object>} Response
 */
async function submitWithRetry(client, payload, attempt = 1) {
  const hostname = config.domserver.hostname;
  const judgeTaskId = payload.judge_task_id || "unknown";

  try {
    const response = await client({
      method: "post",
      url: `/judgehosts/add-judging-run/${hostname}/${payload.submission_id}`,
      data: payload,
      headers: {
        "Content-Type": "application/json",
        "X-Judgehost-Version": require("../../package.json").version || "1.0.0",
      },
    });
    return response;
  } catch (error) {
    // Single-post-only: do not retry at all
    throw error;

    if (canRetry) {
      const delayMs = calculateRetryDelay(attempt);
      logger.warn(
        `Retrying result submission (attempt ${attempt + 1}/${
          config.domserver.retryMaxAttempts
        })`,
        {
          submission_id: payload.submission_id,
          delay_ms: delayMs,
          error: error.message,
        }
      );

      await sleep(delayMs);
      return submitWithRetry(client, payload, attempt + 1);
    }

    throw error;
  }
}

/**
 * Check if error is retryable
 * @param {Error} error - Error object
 * @returns {boolean} Whether error is retryable
 */
function isRetryableError(error) {
  // Retry on network errors
  if (!error.response) {
    return true;
  }

  // Retry on specific HTTP status codes
  const status = error.response.status;
  const retryableStatuses = [408, 429, 500, 502, 503, 504];

  return retryableStatuses.includes(status);
}

/**
 * Calculate retry delay with exponential backoff
 * @param {number} attempt - Current attempt number
 * @returns {number} Delay in milliseconds
 */
function calculateRetryDelay(attempt) {
  const baseDelay = config.domserver.retryDelayMs;
  const multiplier = config.domserver.retryBackoffMultiplier;

  return Math.floor(baseDelay * Math.pow(multiplier, attempt - 1));
}

/**
 * Sleep helper
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Notify DOMserver of judgehost availability
 * @returns {Promise<Object>} Response
 */
async function notifyAvailability() {
  const client = getClient();

  if (!client) {
    return { success: false, reason: "client_not_available" };
  }

  try {
    const hostname = config.domserver.hostname;
    const response = await client.post(`/judgehosts/${hostname}/heartbeat`, {
      hostname,
      status: "available",
      timestamp: new Date().toISOString(),
      version: require("../../package.json").version || "1.0.0",
      capabilities: {
        max_workers: config.resources.maxWorkers,
        max_memory_mb: config.resources.maxMemoryMB,
        max_cpu_cores: config.resources.maxCpuCores,
      },
    });

    return {
      success: true,
      response: response.data,
    };
  } catch (error) {
    logger.error("Failed to notify DOMserver of availability", {
      error: error.message,
      status: error.response?.status,
    });

    return {
      success: false,
      error: error.message,
    };
  }
}

module.exports = {
  getClient,
  submitResult,
  notifyAvailability,
  buildPublicUrl,
};
