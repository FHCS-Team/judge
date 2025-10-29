const { InMemoryQueue } = require("../../src/queue");
const {
  registerSubmissionHandler,
} = require("../../src/messaging/handlers/submissionHandler");
const {
  registerResultHandler,
} = require("../../src/messaging/handlers/resultHandler");

async function main() {
  const queue = new InMemoryQueue();

  // Register handlers
  registerSubmissionHandler(queue);
  registerResultHandler(queue);

  // Start queue processing
  queue.start();

  // Prepare a small fake archive buffer (use empty tarball bytes or sample fixture if exists)
  const fs = require("fs");
  let sampleBuf = null;
  try {
    sampleBuf = fs.readFileSync(
      __dirname + "/../../tests/fixtures/sample.tar.gz",
    );
  } catch (e) {
    // If the fixture tarball doesn't exist, create a minimal tar.gz
    // with a migration.sql so evaluation hooks that expect it will succeed.
    try {
      const path = require("path");
      const { execSync } = require("child_process");
      const fixturesDir = path.resolve(__dirname, "../../tests/fixtures");
      const sampleDir = path.join(fixturesDir, "sample_tmp");
      const sampleTar = path.join(fixturesDir, "sample.tar.gz");
      fs.mkdirSync(fixturesDir, { recursive: true });
      // create a small sample dir with migration.sql
      fs.rmSync(sampleDir, { recursive: true, force: true });
      fs.mkdirSync(sampleDir, { recursive: true });
      fs.writeFileSync(
        path.join(sampleDir, "migration.sql"),
        "-- minimal migration for in-memory tests\nCREATE TABLE IF NOT EXISTS sample_table (id SERIAL PRIMARY KEY);\n",
      );
      // create tar.gz using system tar (available in test environment)
      try {
        // create tar.gz with files at archive root (use sample_tmp contents)
        execSync(`tar -C ${sampleDir} -czf ${sampleTar} .`);
        // read the created tarball
        sampleBuf = fs.readFileSync(sampleTar);
      } catch (tarErr) {
        // fallback to empty buffer if tar command fails
        sampleBuf = Buffer.from("");
      } finally {
        // cleanup the temporary sample directory (keep tarball)
        try {
          fs.rmSync(sampleDir, { recursive: true, force: true });
        } catch (_) {}
      }
    } catch (innerErr) {
      sampleBuf = Buffer.from("");
    }
  }

  // Use unique submission IDs so we don't collide with previously-created
  // directories that may be owned by root from earlier runs.
  const idBase = Date.now();
  const submissionId1 = `mock-inmem-${idBase}-1`;
  const submissionId2 = `mock-inmem-${idBase}-2`;

  // Enqueue a submission with inline data (buffer)
  queue.enqueue({
    type: "submission",
    payload: {
      submission_id: submissionId1,
      problem_id: "db-optimization",
      team_id: "inmem-team",
      archive_data: sampleBuf,
    },
    max_retries: 1,
  });

  // Enqueue a submission with missing archive to test error path
  queue.enqueue({
    type: "submission",
    payload: {
      submission_id: submissionId2,
      problem_id: "db-optimization",
      team_id: "inmem-team",
      // no archive_url or archive_data -> should error
    },
    max_retries: 0,
  });

  // Enqueue a result event (must conform to result_event schema)
  queue.enqueue({
    type: "result.evaluation.completed",
    payload: {
      submission_id: submissionId1,
      problem_id: "db-optimization",
      status: "completed",
      evaluated_at: new Date().toISOString(),
      execution_status: "success",
      total_score: 100,
      max_score: 100,
      percentage: 100,
    },
  });

  // Give some time for processing
  await new Promise((r) => setTimeout(r, 2000));
  console.log("In-memory test run complete");
  await queue.close();
}

main().catch((e) => {
  console.error("Test run failed", e);
  process.exit(1);
});
