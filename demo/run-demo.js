const { InMemoryQueue } = require("../src/queue/index");
const {
  registerSubmissionHandler,
} = require("../src/messaging/handlers/submissionHandler");
const {
  registerResultHandler,
} = require("../src/messaging/handlers/resultHandler");
const logger = require("../src/utils/logger");

async function run() {
  const q = new InMemoryQueue({ defaultJobMemoryMb: 64 });
  // register typed handlers (use prefix matching for result.*)
  registerSubmissionHandler(q);
  // register result handler using prefix pattern
  registerResultHandler(q);

  // register a prefix handler example: all 'result.' events
  q.registerHandler("result.", async (msg, { ack }) => {
    logger.info("Prefix-catcher: result.*", { type: msg.type });
    ack();
  });

  // Start queue without default handler (we rely on registered handlers)
  q.start();

  logger.info("Demo: enqueueing submission");
  q.enqueue({
    type: "submission",
    payload: { submission_id: "demo-1", problem_id: "demo-prob-1" },
  });

  // wait for processing, then close
  await q.close(5000);
  logger.info("Demo finished, queue closed", q.stats());
}

run().catch((e) => {
  console.error("Demo error", e);
  process.exit(1);
});
