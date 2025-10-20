/**
 * @file API models - Type definitions for API requests and responses
 */

/**
 * Standard API response wrapper
 * @typedef {Object} ApiResponse
 * @property {boolean} success - Whether the request succeeded
 * @property {string} [message] - Human-readable message
 * @property {*} [data] - Response data
 * @property {ApiError} [error] - Error details if failed
 */

/**
 * API error details
 * @typedef {Object} ApiError
 * @property {string} code - Error code
 * @property {string} message - Error message
 * @property {Object} [details] - Additional error details
 * @property {string} [stack] - Stack trace (only in development)
 */

/**
 * Health check response
 * @typedef {Object} HealthResponse
 * @property {string} status - System status: 'healthy', 'degraded', 'unhealthy'
 * @property {string} version - Application version
 * @property {number} uptime_seconds - System uptime in seconds
 * @property {Object} queue - Queue statistics
 * @property {number} queue.size - Total jobs in queue
 * @property {number} queue.running - Running jobs
 * @property {number} queue.available_workers - Idle workers
 * @property {Object} evaluations - Active evaluation info
 * @property {number} evaluations.active - Active evaluations count
 * @property {Object<string, number>} evaluations.states - Count by stage
 * @property {Object} resources - System resources
 * @property {number} resources.memory_used - Used memory in bytes
 * @property {number} resources.memory_total - Total memory in bytes
 * @property {number} resources.cpu_count - Number of CPU cores
 */

/**
 * Pagination parameters
 * @typedef {Object} PaginationParams
 * @property {number} [page] - Page number (default: 1)
 * @property {number} [limit] - Items per page (default: 20)
 * @property {string} [sort] - Sort field
 * @property {string} [order] - Sort order: 'asc' or 'desc'
 */

/**
 * Paginated response
 * @typedef {Object} PaginatedResponse
 * @property {Array<*>} items - Page items
 * @property {Object} pagination - Pagination metadata
 * @property {number} pagination.page - Current page
 * @property {number} pagination.limit - Items per page
 * @property {number} pagination.total - Total items
 * @property {number} pagination.pages - Total pages
 * @property {boolean} pagination.has_next - Has next page
 * @property {boolean} pagination.has_prev - Has previous page
 */

/**
 * List problems query parameters
 * @typedef {Object} ListProblemsQuery
 * @property {string} [project_type] - Filter by project type
 * @property {string} [search] - Search in problem name/id
 * @property {PaginationParams} [pagination] - Pagination options
 */

/**
 * List submissions query parameters
 * @typedef {Object} ListSubmissionsQuery
 * @property {string} [problem_id] - Filter by problem
 * @property {string} [team_id] - Filter by team
 * @property {string} [status] - Filter by status
 * @property {Date} [submitted_after] - Filter by submission date
 * @property {Date} [submitted_before] - Filter by submission date
 * @property {PaginationParams} [pagination] - Pagination options
 */

/**
 * Validation error
 * @typedef {Object} ValidationError
 * @property {string} field - Field name that failed validation
 * @property {string} message - Validation error message
 * @property {*} [value] - Invalid value provided
 */

module.exports = {};
