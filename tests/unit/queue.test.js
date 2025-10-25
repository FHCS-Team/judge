const { InMemoryQueue } = require("../../src/queue/index");

describe("InMemoryQueue", () => {
  test("processes messages with ack", async () => {
    const q = new InMemoryQueue({ defaultJobMemoryMb: 64 });
    const processed = [];

    q.start(async (msg, { ack, nack }) => {
      processed.push(msg.id);
      // simulate async work
      await new Promise((r) => setTimeout(r, 10));
      ack();
    });

    q.enqueue({
      type: "submission",
      payload: { submission_id: "s1", problem_id: "p1" },
    });
    q.enqueue({
      type: "submission",
      payload: { submission_id: "s2", problem_id: "p1" },
    });

    // wait until queue drains
    await q.close(2000);

    expect(processed.length).toBe(2);
  });

  test("retries failed messages up to max_retries", async () => {
    const q = new InMemoryQueue({ defaultJobMemoryMb: 64 });
    const calls = [];

    q.start(async (msg, { ack, nack }) => {
      calls.push(msg.retries || 0);
      if ((msg.retries || 0) < 2) {
        // first two attempts will fail
        nack(new Error("boom"));
        return;
      }
      ack();
    });

    q.enqueue({
      type: "submission",
      payload: { submission_id: "s-retry", problem_id: "p-retry" },
      max_retries: 3,
    });

    await q.close(5000);

    // expect at least 3 attempts (0,1,2)
    expect(calls.length).toBeGreaterThanOrEqual(3);
  });
});
