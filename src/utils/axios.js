const axios = require("axios");
const logger = require("./logger");

/**
 * Create a pre-configured axios client.
 * @param {Object} opts - Options to configure the client
 * @param {string} [opts.baseURL]
 * @param {number} [opts.timeout]
 * @param {Object} [opts.auth]
 * @param {Object} [opts.headers]
 * @returns {AxiosInstance}
 */
function createClient(opts = {}) {
  const client = axios.create({
    baseURL: opts.baseURL || process.env.AXIOS_BASE_URL || "",
    timeout: typeof opts.timeout === "number" ? opts.timeout : 10000,
    auth: opts.auth,
    headers: opts.headers,
  });

  // Basic logging interceptors to assist debugging across usages.
  client.interceptors.request.use(
    (requestConfig) => {
      logger.debug("HTTP request", {
        method: requestConfig.method?.toUpperCase(),
        url: requestConfig.baseURL
          ? `${requestConfig.baseURL}${requestConfig.url}`
          : requestConfig.url,
      });
      return requestConfig;
    },
    (error) => {
      logger.error("HTTP request error", { message: error.message, error });
      return Promise.reject(error);
    }
  );

  client.interceptors.response.use(
    (response) => {
      logger.debug("HTTP response", {
        status: response.status,
        url: response.config?.url,
      });
      return response;
    },
    (error) => {
      logger.error("HTTP response error", {
        message: error.message,
        status: error.response?.status,
        url: error.config?.url,
        data: error.response?.data,
      });
      return Promise.reject(error);
    }
  );

  return client;
}

// Default instance for simple uses — keep module backward-compatible by
// exporting the axios instance as the module export and attaching the
// factory as a property.
const defaultInstance = createClient();

module.exports = defaultInstance;
module.exports.createClient = createClient;
