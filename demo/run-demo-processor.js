const path = require("path");
const logger = require("../src/utils/logger");
const { runJob } = require("../src/processor");

async function runDemo() {
  logger.info("starting processor demo run");

  // Point at the sample package shipped in mocks/packages
  const pkg = path.resolve(
    __dirname,
    "..",
    "mocks",
    "packages",
    "db-optimization",
    "submission",
  );

  const job = {
    id: `demo-${Date.now()}`,
    packagePath: pkg,
    // evalCmd: '/workspace/hooks/post/01_test_queries.sh' // optional override
  };

  try {
    const result = await runJob(job);
    logger.info(
      { resultPath: `data/artifacts/job-${job.id}` },
      "demo finished",
    );
    console.log("Result summary:", result.status);
    console.log(
      "Result written to:",
      require("path").resolve(
        "data",
        "artifacts",
        `job-${job.id}`,
        "result.json",
      ),
    );
  } catch (err) {
    logger.error({ err }, "demo run failed");
    process.exitCode = 1;
  }
}

module.exports = { runDemo };

if (require.main === module) {
  runDemo();
}
