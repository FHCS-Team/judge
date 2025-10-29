const logger = require("../src/utils/logger");
const fs = require("fs");
const path = require("path");

// Load processor module and monkey-patch buildProblemImages to avoid Docker
const processorModule = require("../src/processor");
if (!processorModule || !processorModule.JudgeProcessor) {
  console.error("JudgeProcessor not found in ../src/processor");
  process.exit(1);
}

// Replace buildProblemImages with a demo stub that simulates builds
processorModule.JudgeProcessor.prototype.buildProblemImages = async function (
  problem_id,
) {
  logger.info(
    { problem_id },
    "Demo: buildProblemImages (monkey-patched) called",
  );
  // Simulate some work and return a plausible result object
  await new Promise((r) => setTimeout(r, 500));
  const result = {
    problem_id,
    built: true,
    images: {},
  };

  // Read problem config to infer container ids if possible
  try {
    const problemDir = path.resolve(this.problemsDir, problem_id);
    const configPath = path.join(problemDir, "config.json");
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      for (const c of config.containers || []) {
        // Simulate image tag
        const tag = `${problem_id}_${c.container_id}:demo`;
        result.images[c.container_id] = { tag, status: "built" };
      }
    } else {
      // Generic fallback
      result.images["eval"] = {
        tag: `${problem_id}_eval:demo`,
        status: "built",
      };
    }
  } catch (e) {
    logger.warn(
      "Demo: failed to read config.json or build simulated images",
      e && e.message ? e.message : e,
    );
  }

  logger.info({ problem_id, result }, "Demo: buildProblemImages returning");
  return result;
};

(async () => {
  const JudgeProcessor = processorModule.JudgeProcessor;
  const processor = new JudgeProcessor();

  const packagePayload = {
    package_id: "demo-pkg-1",
    problem_id: "sq3",
    package_url: "http://localhost:8000/problem/sq3/package",
    checksum: null,
    metadata: {},
  };

  logger.info(
    { packagePayload },
    "Demo: submitting problem package (will download from external server)",
  );

  try {
    // submitProblemPackage expects archive_url or archive_data; onProblemReceived maps package_url->archive_url
    await processor.submitProblemPackage({
      problem_id: packagePayload.problem_id,
      archive_url: packagePayload.package_url,
      package_id: packagePayload.package_id,
      checksum: packagePayload.checksum,
      metadata: packagePayload.metadata,
    });

    logger.info(
      "submitProblemPackage completed, now invoking buildProblemImages (monkey-patched)",
    );

    const buildResult = await processor.buildProblemImages(
      packagePayload.problem_id,
    );
    console.log("Build result:", JSON.stringify(buildResult, null, 2));

    // Show problem directory contents
    const problemDir = path.resolve(
      processor.problemsDir,
      packagePayload.problem_id,
    );
    if (fs.existsSync(problemDir)) {
      const files = fs.readdirSync(problemDir);
      console.log("Problem directory files:", files);
    } else {
      console.log("Problem directory not found:", problemDir);
    }
  } catch (err) {
    console.error("Demo failed:", err && err.message ? err.message : err);
  }
})();
