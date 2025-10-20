/**
 * @file Problem model - Type definitions for problem packages
 */

/**
 * Build step configuration for parameterized container builds
 * @typedef {Object} BuildStep
 * @property {string} type - Step type: 'run', 'copy', 'env', 'workdir', 'expose', 'arg', 'healthcheck', 'shell', etc.
 * @property {string} [command] - Shell command for 'run' type
 * @property {string} [source] - Source path for 'copy' type
 * @property {string} [destination] - Destination path for 'copy' type
 * @property {Object} [env] - Environment variables for 'env' type
 * @property {string} [path] - Working directory for 'workdir' type
 * @property {number|Array<number>} [ports] - Port(s) to expose for 'expose' type
 * @property {Object} [args] - Build arguments for 'arg' type
 * @property {Object} [health] - Health check configuration for 'healthcheck' type
 * @property {Array<string>} [shell_form] - Shell form for 'shell' type
 */

/**
 * Container configuration for problems
 * @typedef {Object} ContainerConfig
 * @property {string} container_id - Unique identifier for this container
 * @property {string} container_name - Human-readable name
 * @property {string} [base_image] - Base Docker image (e.g., 'node:18-alpine')
 * @property {string} [role] - Container role: 'submission', 'tester', 'database', 'cache', 'service'
 * @property {Array<BuildStep>} [build_steps] - Parameterized build steps
 * @property {Object} [environment] - Environment variables
 * @property {Object} [resource_limits] - Container-specific resource limits
 * @property {string} [resource_limits.memory] - Memory limit (e.g., '512m')
 * @property {number} [resource_limits.cpus] - CPU count
 * @property {number} [resource_limits.timeout] - Execution timeout in seconds
 * @property {Array<string>} [ports] - Exposed ports
 * @property {Array<string>} [volumes] - Volume mounts
 * @property {string} [network_mode] - Network mode: 'internal', 'bridge', 'none'
 * @property {Array<string>} [depends_on] - Container dependencies
 * @property {string} [command] - Override container command
 * @property {string} [entrypoint] - Override container entrypoint
 * @property {boolean} [accepts_submission] - Whether this container accepts submission code
 * @property {string} [submission_package_id] - ID of submission package to mount
 * @property {Object} [health_check] - Health check configuration
 * @property {string} [health_check.command] - Health check command
 * @property {number} [health_check.interval] - Check interval in seconds
 * @property {number} [health_check.timeout] - Check timeout in seconds
 * @property {number} [health_check.retries] - Number of retries
 */

/**
 * Submission package mapping
 * @typedef {Object} SubmissionPackageMapping
 * @property {string} package_id - Unique identifier for submission package
 * @property {string} package_name - Human-readable name (e.g., 'frontend', 'backend')
 * @property {string} target_container_id - Container ID that accepts this package
 * @property {string} [mount_path] - Path where submission should be mounted
 * @property {boolean} [required] - Whether this package is required
 */

/**
 * Problem configuration from config.json
 * @typedef {Object} ProblemConfig
 * @property {string} problem_id - Unique identifier for the problem
 * @property {string} problem_name - Human-readable name
 * @property {string} [description] - Problem description
 * @property {string} project_type - Type of project (e.g., 'web', 'cli', 'api', 'full-stack')
 * @property {Array<ContainerConfig>} containers - Container configurations (required)
 * @property {Array<SubmissionPackageMapping>} [submission_packages] - Submission package mappings
 * @property {Object} [resource_limits] - Default resource limits
 * @property {string} [resource_limits.memory] - Memory limit (e.g., '4g')
 * @property {number} [resource_limits.cpus] - CPU count
 * @property {number} [resource_limits.timeout] - Execution timeout in seconds
 * @property {Array<RubricConfig>} rubrics - Evaluation rubrics
 * @property {Object} [metadata] - Additional problem metadata
 */

/**
 * Rubric configuration
 * @typedef {Object} RubricConfig
 * @property {string} rubric_id - Unique rubric identifier
 * @property {string} rubric_name - Human-readable rubric name
 * @property {string} rubric_type - Type: 'binary', 'numeric', 'percentage', 'custom'
 * @property {number} max_score - Maximum possible score
 * @property {number} [weight] - Weight in total score calculation (default: 1)
 * @property {string} [description] - Rubric description
 * @property {Object} [criteria] - Evaluation criteria details
 */

/**
 * Problem package structure
 * @typedef {Object} ProblemPackage
 * @property {string} problemId - Unique problem identifier
 * @property {string} problemName - Human-readable name
 * @property {string} imageName - Built Docker image name
 * @property {ProblemConfig} config - Problem configuration
 * @property {string} packagePath - Path to problem package directory
 * @property {Date} registeredAt - Registration timestamp
 * @property {Date} [lastUpdated] - Last update timestamp
 * @property {Object} [metadata] - Additional metadata
 */

/**
 * Problem registration request
 * @typedef {Object} ProblemRegistrationRequest
 * @property {string} package_source - Source type: 'file', 'url', 'git'
 * @property {string} [package_url] - URL for 'url' source type
 * @property {string} [git_url] - Git repository URL for 'git' source
 * @property {string} [git_branch] - Git branch name (default: main)
 * @property {string} [git_commit] - Specific commit SHA
 * @property {Object} [file] - Multer file object for 'file' source
 * @property {string} [checksum] - SHA256 checksum for verification
 */

/**
 * Problem info response
 * @typedef {Object} ProblemInfo
 * @property {string} problem_id - Unique identifier
 * @property {string} problem_name - Human-readable name
 * @property {string} image_name - Docker image name
 * @property {string} project_type - Project type
 * @property {Array<RubricConfig>} rubrics - Evaluation rubrics
 * @property {Object} resource_limits - Resource limits
 * @property {Date} registered_at - Registration timestamp
 * @property {Object} [metadata] - Additional metadata
 */

module.exports = {};
