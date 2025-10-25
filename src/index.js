const logger = require("./utils/logger");

logger.info("FHCS - JUDGE started!");

// If run directly, kick off a small demo that exercises the processor.
if (require.main === module) {
  // require the demo runner which will call the processor
  (async () => {
    try {
      const demo = require("../demo/run-demo-processor");
      await demo.runDemo();
    } catch (err) {
      logger.error({ err }, "failed to run processor demo");
      process.exitCode = 1;
    }
  })();
}
