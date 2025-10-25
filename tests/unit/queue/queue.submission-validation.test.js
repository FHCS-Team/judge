const { InMemoryQueue } = require("#queue/index");

describe("InMemoryQueue submission validation", () => {
  test("throws when enqueueing a submission missing required fields", () => {
    const q = new InMemoryQueue({ defaultJobMemoryMb: 64 });

    // missing required `problem_id` should trigger schema validation error
    expect(() =>
      q.enqueue({
        type: "submission",
        payload: { submission_id: "invalid-only-id" },
      }),
    ).toThrow(/submission payload validation failed/i);

    // queue should remain empty
    const s = q.stats();
    expect(s.queued).toBe(0);
  });
});
