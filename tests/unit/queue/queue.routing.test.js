const { InMemoryQueue } = require("#queue/index");

describe("InMemoryQueue handler routing and shutdown behavior", () => {
  test("wildcard string handler routes to RegExp", async () => {
    const q = new InMemoryQueue({ defaultJobMemoryMb: 64 });
    const seen = [];

    q.registerHandler("res*", (msg, { ack }) => {
      seen.push(msg.type);
      ack();
    });

    q.start();

    q.enqueue({
      type: "result",
      payload: { submission_id: "s", problem_id: "p", status: "completed" },
    });

    await q.close(2000);
    expect(seen).toEqual(["result"]);
  });

  test("prefix handler (ends with '.') matches types with that prefix", async () => {
    const q = new InMemoryQueue({ defaultJobMemoryMb: 64 });
    const seen = [];

    q.registerHandler("result.", (msg, { ack }) => {
      seen.push(msg.type);
      ack();
    });

    q.start();

    q.enqueue({
      type: "result.evaluation.completed",
      payload: { submission_id: "s2", problem_id: "p2", status: "completed" },
    });

    await q.close(2000);
    expect(seen).toEqual(["result.evaluation.completed"]);
  });

  test("RegExp handler matches types", async () => {
    const q = new InMemoryQueue({ defaultJobMemoryMb: 64 });
    const seen = [];

    q.registerHandler(/^res.*/, (msg, { ack }) => {
      seen.push(msg.type);
      ack();
    });

    q.start();

    q.enqueue({
      type: "result",
      payload: { submission_id: "s3", problem_id: "p3", status: "completed" },
    });

    await q.close(2000);
    expect(seen).toEqual(["result"]);
  });

  test("default handler from start() is used when no specific handler", async () => {
    const q = new InMemoryQueue({ defaultJobMemoryMb: 64 });
    const seen = [];

    q.start((msg, { ack }) => {
      seen.push(msg.type);
      ack();
    });

    q.enqueue({
      type: "unhandled.type",
      payload: { submission_id: "s4", problem_id: "p4", status: "completed" },
    });

    await q.close(2000);
    expect(seen).toEqual(["unhandled.type"]);
  });

  test("external enqueues are rejected during shutdown but internal allowed", () => {
    const q = new InMemoryQueue({ defaultJobMemoryMb: 64 });

    // simulate shutdown state
    q._shutdown = true;

    expect(() =>
      q.enqueue({
        type: "submission",
        payload: { submission_id: "s5", problem_id: "p5" },
      }),
    ).toThrow(/shutting down/i);

    // internal enqueue should be allowed
    expect(() =>
      q.enqueue({
        _internal: true,
        type: "submission",
        payload: { submission_id: "s5", problem_id: "p5" },
      }),
    ).not.toThrow();

    // internal message was pushed
    const stats = q.stats();
    expect(stats.queued).toBe(1);
  });

  test("stats shows processing count while handler runs", async () => {
    const q = new InMemoryQueue({ defaultJobMemoryMb: 64 });
    let started = false;

    q.start(async (msg, { ack }) => {
      started = true;
      // long running
      await new Promise((r) => setTimeout(r, 100));
      ack();
    });

    q.enqueue({
      type: "submission",
      payload: { submission_id: "s6", problem_id: "p6" },
    });

    // give it a tick to start processing
    await new Promise((r) => setTimeout(r, 10));
    const st = q.stats();
    expect(st.processing).toBeGreaterThanOrEqual(1);

    await q.close(2000);
    expect(started).toBe(true);
  });
});
