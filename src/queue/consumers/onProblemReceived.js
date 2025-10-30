const logger = require("#utils/logger.js");
const { JudgeProcessor } = require("../../processor");

// Reuse single processor instance across messages
const processor = new JudgeProcessor();

/**
 * Handle problem/package events from the message queue.
 * Expected header: headers['x-event-type'] === 'judge.problem.created'
 * Expected content (JSON): { package_id, problem_id, package_url, checksum, metadata }
 * @param {import("amqplib").Message} msg
 */
module.exports = async function onProblemReceived(msg) {
  if (!msg || !msg.properties) return false;

  // Determine event type from several possible locations (routing key,
  // headers, or content.channel) because different publishers may use
  // different formats. Accept multiple event names used by upstream.
  const { getEventType } = require("../message");
  const eventType = getEventType(msg);
  if (
    ![
      "judge.problem.created",
      "judge.package",
      "judge.problem",
      "judge.package.created",
    ].includes(eventType)
  )
    return false;

  let payload;
  try {
    const raw =
      msg.content && msg.content.toString ? msg.content.toString() : null;
    payload = raw ? JSON.parse(raw) : null;
    if (payload && typeof payload === "object") {
      if (payload.payload && typeof payload.payload === "object")
        payload = payload.payload;
      else if (payload.data && typeof payload.data === "object")
        payload = payload.data;
      else if (payload.message && typeof payload.message === "object")
        payload = payload.message;
    }
  } catch (err) {
    logger.warn("onProblemReceived: failed to parse message content");
    logger.debug(err && err.message ? err.message : err);
    return false;
  }

  // Accept a few different possible field names from upstream
  let {
    package_id,
    problem_id,
    package_url,
    checksum,
    metadata,
    package_path,
    problem_code,
    code,
    archive_url,
  } = payload || {};
  // coerce ids to strings
  package_id = package_id != null ? String(package_id) : package_id;
  problem_id = problem_id != null ? String(problem_id) : problem_id;
  // Accept upstream field `code` as the canonical problem code
  problem_code =
    (problem_code != null ? String(problem_code) : problem_code) ||
    (code != null ? String(code) : code);

  // Determine a final archive URL. Prefer explicit fields, fallbacks to constructed URL
  let final_package_url = package_url || archive_url || null;
  // If package_path is actually a full URL, prefer it
  if (
    !final_package_url &&
    package_path &&
    String(package_path).match(/^https?:\/\//i)
  ) {
    final_package_url = package_path;
  }
  // If still not present, try to construct from base + /problem/{problem_code|problem_id}/package
  if (!final_package_url) {
    const idForUrl = problem_code || problem_id;
    if (idForUrl) {
      try {
        const pkgBase =
          process.env.PACKAGE_BASE_URL ||
          (require("../../config/axios").defaults || {}).baseURL ||
          process.env.AXIOS_BASE_URL ||
          `http://localhost:${process.env.PORT || 3000}`;
        const joinBase = String(pkgBase).replace(/\/$/, "");
        final_package_url = `${joinBase}/problem/${encodeURIComponent(idForUrl)}/package`;
      } catch (e) {
        logger.debug(
          { err: e && e.message ? e.message : String(e) },
          "onProblemReceived: failed to construct package URL",
        );
      }
    }
  }

  // If problem_id is missing but problem_code exists, use that as the identifier
  if (!problem_id && problem_code) {
    problem_id = problem_code;
  }

  // If package_id isn't provided, derive one from problem_code or generate a fallback
  if (!package_id) {
    package_id = problem_code || `pkg-${Date.now()}`;
    logger.debug(
      { derived_package_id: package_id },
      "onProblemReceived: derived package_id",
    );
  }

  if (!problem_id || !final_package_url) {
    logger.warn("onProblemReceived: missing required fields in payload", {
      package_id,
      problem_id,
      package_url: final_package_url,
    });
    try {
      logger.debug({
        raw:
          msg.content && msg.content.toString ? msg.content.toString() : null,
        parsed: payload,
      });
    } catch (e) {
      logger.debug(
        "onProblemReceived: failed to stringify message content for debug",
      );
    }
    return false;
  }

  logger.info(
    `Problem package received: package=${package_id} problem=${problem_id}`,
  );
  logger.debug({ payload });

  // Map external package event fields to processor submitProblemPackage API
  const packageData = {
    problem_id,
    archive_url: final_package_url,
    checksum: checksum,
    metadata: metadata,
    package_id,
  };

  // Process asynchronously so the consumer can ack quickly
  (async () => {
    const MAX_ATTEMPTS = parseInt(process.env.PACKAGE_FETCH_RETRIES || "5", 10);
    const INITIAL_DELAY_MS = parseInt(
      process.env.PACKAGE_FETCH_RETRY_DELAY_MS || "1000",
      10,
    );

    function sleep(ms) {
      return new Promise((r) => setTimeout(r, ms));
    }

    let attempt = 0;
    while (true) {
      attempt += 1;
      try {
        await processor.submitProblemPackage(packageData);
        logger.info(
          `Problem package processed: package=${package_id} problem=${problem_id}`,
        );
        break;
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        // If we've exhausted attempts, log and exit
        if (attempt >= MAX_ATTEMPTS) {
          try {
            logger.error(
              {
                err: message,
                package_id,
                problem_id,
                attempt,
              },
              "Error processing problem package (final attempt)",
            );
          } catch (e) {
            // swallow
          }
          break;
        }

        // Retryable errors: missing file (404) or network errors. Use a simple heuristic.
        if (/status code 404|ECONNREFUSED|ENOTFOUND|timeout/i.test(message)) {
          const delay = Math.min(INITIAL_DELAY_MS * 2 ** (attempt - 1), 30000);
          logger.warn(
            { package_id, problem_id, attempt, delay, err: message },
            `Package not yet available, will retry in ${delay}ms (attempt ${attempt}/${MAX_ATTEMPTS})`,
          );
          await sleep(delay);
          continue;
        }

        // Non-retryable error: log and stop retrying
        try {
          logger.error(
            {
              err: message,
              package_id,
              problem_id,
              attempt,
            },
            "Error processing problem package (non-retryable)",
          );
        } catch (e) {}
        break;
      }
    }
  })();

  return true;
};
