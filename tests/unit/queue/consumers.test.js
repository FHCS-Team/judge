const {
  BaseConsumer,
  SubmissionConsumer,
  PackageConsumer,
  ConsumerRegistry,
} = require("../../../src/queue/consumers");

describe("Queue Consumers", () => {
  describe("BaseConsumer", () => {
    test("should validate envelope structure", () => {
      const consumer = new BaseConsumer({ messageType: "test" });

      const valid = consumer.validate({
        type: "test",
        payload: { data: "test" },
      });

      expect(valid.valid).toBe(true);
      expect(valid.errors).toHaveLength(0);
    });

    test("should reject invalid envelope", () => {
      const consumer = new BaseConsumer({ messageType: "test" });

      const invalid = consumer.validate({
        type: "test",
        // missing payload
      });

      expect(invalid.valid).toBe(false);
      expect(invalid.errors.length).toBeGreaterThan(0);
    });

    test("should throw error if process not implemented", async () => {
      const consumer = new BaseConsumer({ messageType: "test" });

      await expect(
        consumer.process({}, { ack: jest.fn(), nack: jest.fn() }),
      ).rejects.toThrow("process() must be implemented");
    });
  });

  describe("SubmissionConsumer", () => {
    let consumer;
    let mockProcessor;
    let mockPublisher;

    beforeEach(() => {
      mockProcessor = {
        submitSubmission: jest.fn().mockResolvedValue({
          status: "success",
          submission_id: "sub-1",
          problem_id: "prob-1",
        }),
        runEvaluation: jest.fn().mockResolvedValue({
          status: "completed",
          total_score: 100,
          max_score: 100,
          percentage: 100,
          rubrics: {},
          metadata: {},
        }),
      };

      mockPublisher = {
        publish: jest.fn().mockResolvedValue(null),
      };

      consumer = new SubmissionConsumer({
        processor: mockProcessor,
        publisher: mockPublisher,
      });
    });

    test("should validate submission payload", () => {
      const valid = consumer.validate({
        type: "submission",
        payload: {
          submission_id: "sub-1",
          problem_id: "prob-1",
          package_url: "http://example.com/package.tar.gz",
        },
      });

      expect(valid.valid).toBe(true);
    });

    test("should reject submission without required fields", () => {
      const invalid = consumer.validate({
        type: "submission",
        payload: {
          submission_id: "sub-1",
          // missing problem_id and package_url
        },
      });

      expect(invalid.valid).toBe(false);
      expect(invalid.errors).toContain("problem_id is required");
    });

    test("should process valid submission message", async () => {
      const envelope = {
        id: "msg-1",
        type: "submission",
        payload: {
          submission_id: "sub-1",
          problem_id: "prob-1",
          package_url: "http://example.com/package.tar.gz",
          team_id: "team-1",
        },
        created_at: new Date().toISOString(),
      };

      const context = {
        ack: jest.fn(),
        nack: jest.fn(),
      };

      await consumer.consume(envelope, context);

      expect(mockProcessor.submitSubmission).toHaveBeenCalledWith(
        expect.objectContaining({
          submission_id: "sub-1",
          problem_id: "prob-1",
        }),
      );
      expect(mockProcessor.runEvaluation).toHaveBeenCalled();
      expect(mockPublisher.publish).toHaveBeenCalled();
      expect(context.ack).toHaveBeenCalled();
    });

    test("should handle processing errors", async () => {
      mockProcessor.submitSubmission.mockRejectedValue(
        new Error("Processing failed"),
      );

      const envelope = {
        id: "msg-1",
        type: "submission",
        payload: {
          submission_id: "sub-1",
          problem_id: "prob-1",
          package_url: "http://example.com/package.tar.gz",
        },
      };

      const context = {
        ack: jest.fn(),
        nack: jest.fn(),
      };

      await consumer.consume(envelope, context);

      expect(context.nack).toHaveBeenCalled();
      // Should publish both evaluation.started and result.evaluation.failed
      expect(mockPublisher.publish).toHaveBeenCalledTimes(2);
      const secondCall = mockPublisher.publish.mock.calls[1];
      expect(secondCall[0]).toBe("result.evaluation.failed");
      expect(secondCall[1]).toMatchObject({
        type: "result.evaluation.failed",
        payload: expect.objectContaining({ status: "failed" }),
      });
    });
  });

  describe("PackageConsumer", () => {
    let consumer;
    let mockProcessor;
    let mockPublisher;

    beforeEach(() => {
      mockProcessor = {
        submitProblemPackage: jest.fn().mockResolvedValue({
          status: "success",
          problem_id: "prob-1",
          problemDir: "/data/problems/prob-1",
        }),
        buildProblemImages: jest.fn().mockResolvedValue({
          container1: {
            eval_stage: {
              status: "success",
              tag: "judge-prob-1-container1-eval:latest",
            },
          },
        }),
      };

      mockPublisher = {
        publish: jest.fn().mockResolvedValue(null),
      };

      consumer = new PackageConsumer({
        processor: mockProcessor,
        publisher: mockPublisher,
      });
    });

    test("should validate package payload", () => {
      const valid = consumer.validate({
        type: "package",
        payload: {
          package_id: "pkg-1",
          package_url: "http://example.com/package.tar.gz",
        },
      });

      expect(valid.valid).toBe(true);
    });

    test("should process package without building", async () => {
      const envelope = {
        id: "msg-1",
        type: "package",
        payload: {
          package_id: "pkg-1",
          problem_id: "prob-1",
          package_url: "http://example.com/package.tar.gz",
          build_immediately: false,
        },
      };

      const context = {
        ack: jest.fn(),
        nack: jest.fn(),
      };

      await consumer.consume(envelope, context);

      expect(mockProcessor.submitProblemPackage).toHaveBeenCalled();
      expect(mockProcessor.buildProblemImages).not.toHaveBeenCalled();
      const publishCall = mockPublisher.publish.mock.calls[0];
      expect(publishCall[0]).toBe("package.validated");
      expect(publishCall[1]).toMatchObject({
        type: "package.validated",
        payload: expect.objectContaining({ status: "accepted" }),
      });
      expect(context.ack).toHaveBeenCalled();
    });

    test("should build images when requested", async () => {
      const envelope = {
        id: "msg-1",
        type: "package",
        payload: {
          package_id: "pkg-1",
          problem_id: "prob-1",
          package_url: "http://example.com/package.tar.gz",
          build_immediately: true,
        },
      };

      const context = {
        ack: jest.fn(),
        nack: jest.fn(),
      };

      await consumer.consume(envelope, context);

      expect(mockProcessor.buildProblemImages).toHaveBeenCalled();
      expect(mockPublisher.publish).toHaveBeenCalledTimes(2);
      const secondCall = mockPublisher.publish.mock.calls[1];
      expect(secondCall[0]).toBe("build.completed");
      expect(secondCall[1]).toMatchObject({
        type: "build.completed",
        payload: expect.any(Object),
      });
    });
  });

  describe("ConsumerRegistry", () => {
    test("should register consumers", () => {
      const registry = new ConsumerRegistry();
      const consumer = new BaseConsumer({ messageType: "test" });

      registry.register(consumer);

      expect(registry.get("test")).toBe(consumer);
    });

    test("should register default consumers", () => {
      const registry = new ConsumerRegistry({
        processor: {},
        publisher: {},
      });

      registry.registerDefaults();

      const consumers = registry.getAll();
      expect(consumers.size).toBeGreaterThan(0);
      expect(registry.get("submission")).toBeDefined();
      expect(registry.get("package")).toBeDefined();
    });

    test("should attach consumers to queue", () => {
      const registry = new ConsumerRegistry();
      const consumer = new BaseConsumer({ messageType: "test" });
      registry.register(consumer);

      const mockQueue = {
        registerHandler: jest.fn(),
      };

      registry.attachToQueue(mockQueue);

      expect(mockQueue.registerHandler).toHaveBeenCalledWith(
        "test",
        expect.any(Function),
      );
    });
  });
});
