const path = require("path");
const { runJob } = require("../src/processor");

(async function () {
  try {
    const pkg = path.resolve(
      __dirname,
      "..",
      "mocks",
      "packages",
      "problem-package",
    );
    const job = { id: `demo-${Date.now()}`, packagePath: pkg };
    console.log("Using packagePath:", pkg);
    const result = await runJob(job);
    console.log("Result status:", result.status);
    console.log(
      "Result artifacts path:",
      path.resolve("data", "artifacts", `eval-${job.id}-${Date.now()}`),
    );
  } catch (e) {
    console.error("Run failed:", e && e.message);
    console.error(e && e.stack);
    process.exitCode = 1;
  }
})();
