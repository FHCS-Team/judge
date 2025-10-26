const logger = require("./utils/logger");

logger.info("FHCS - JUDGE started!");

/**
 * Start the main JUDGE process. This function is intentionally light-weight
 * so `src/processor.js` can remain a pure module. Callers can require this
 * module and invoke `start()` to begin the main flow. Options may include
 * { demo: true } to run the demo pipeline.
 */
async function start(options = {}) {
  logger.info({ options }, "starting main flow");

  if (options.demo) {
    // require demo lazily so importing `src/index.js` doesn't pull demo code
    try {
      const demo = require("../demo/run-demo-processor");
      await demo.runDemo();
    } catch (err) {
      logger.error({ err }, "failed to run demo from start()");
      throw err;
    }
  }

  // future startup tasks (servers, message consumers, metrics) go here
}

module.exports = {
  start,
};
