/**
 * Tests for queue module
 */

const { Queue, JobState, Priority } = require("../src/core/queue");
const { JobEvent } = require("../src/models");

describe("Queue", () => {
  let queue;

  beforeEach(() => {
    // Disable auto-processing for tests to allow inspection of queued jobs
    queue = new Queue({ maxWorkers: 2, maxSize: 10, autoProcess: false });
  });

  afterEach(() => {
    // Clear any running jobs
    if (queue) {
      queue.removeAllListeners();
    }
  });

  describe("Initialization", () => {
    it("should create queue with default config", () => {
      const q = new Queue();
      expect(q).toBeDefined();
      expect(q.getStats().maxWorkers).toBeGreaterThan(0);
    });

    it("should create queue with custom config", () => {
      const q = new Queue({ maxWorkers: 5, maxSize: 20 });
      const stats = q.getStats();
      expect(stats.maxWorkers).toBe(5);
    });

    it("should initialize with zero jobs", () => {
      const stats = queue.getStats();
      expect(stats.total).toBe(0);
      expect(stats.queued).toBe(0);
      expect(stats.running).toBe(0);
    });
  });

  describe("Job Enqueue", () => {
    it("should enqueue a job", () => {
      const job = {
        submissionId: "test-1",
        problemId: "problem-1",
        teamId: "team-1",
        priority: 5,
        submissionData: {},
      };

      const enqueuedJob = queue.enqueue(job);
      expect(enqueuedJob).toBeDefined();
      expect(enqueuedJob.id).toBe("test-1");
      expect(enqueuedJob.status).toBe("queued");

      const stats = queue.getStats();
      expect(stats.total).toBe(1);
      expect(stats.queued).toBe(1);
    });

    it("should assign default priority if not provided", () => {
      const job = {
        submissionId: "test-2",
        problemId: "problem-1",
        teamId: "team-1",
        submissionData: {},
      };

      const enqueuedJob = queue.enqueue(job);
      expect(enqueuedJob.priority).toBe(5); // Default priority
    });

    it("should enforce priority bounds (1-10)", () => {
      const job1 = {
        submissionId: "test-3",
        problemId: "problem-1",
        teamId: "team-1",
        priority: 0, // Too low
        submissionData: {},
      };

      const job2 = {
        submissionId: "test-4",
        problemId: "problem-1",
        teamId: "team-1",
        priority: 15, // Too high
        submissionData: {},
      };

      const enqueuedJob1 = queue.enqueue(job1);
      const enqueuedJob2 = queue.enqueue(job2);

      expect(enqueuedJob1.priority).toBeGreaterThanOrEqual(1);
      expect(enqueuedJob1.priority).toBeLessThanOrEqual(10);
      expect(enqueuedJob2.priority).toBeGreaterThanOrEqual(1);
      expect(enqueuedJob2.priority).toBeLessThanOrEqual(10);
    });

    it("should reject jobs when queue is full", () => {
      // Create a queue with auto-processing disabled so jobs stay queued
      const smallQueue = new Queue({ maxSize: 2, autoProcess: false });

      smallQueue.enqueue({
        submissionId: "test-5",
        problemId: "problem-1",
        teamId: "team-1",
        submissionData: {},
      });

      smallQueue.enqueue({
        submissionId: "test-6",
        problemId: "problem-1",
        teamId: "team-1",
        submissionData: {},
      });

      expect(() => {
        smallQueue.enqueue({
          submissionId: "test-7",
          problemId: "problem-1",
          teamId: "team-1",
          submissionData: {},
        });
      }).toThrow();
    });

    it("should emit queued event", (done) => {
      queue.on(JobEvent.QUEUED, (job) => {
        expect(job.id).toBe("test-8");
        done();
      });

      queue.enqueue({
        submissionId: "test-8",
        problemId: "problem-1",
        teamId: "team-1",
        submissionData: {},
      });
    });
  });

  describe("Priority Ordering", () => {
    it("should process higher priority jobs first", () => {
      // Enqueue low priority job first
      queue.enqueue({
        submissionId: "low-priority",
        problemId: "problem-1",
        teamId: "team-1",
        priority: 1, // Low priority (1-3)
        submissionData: {},
      });

      // Enqueue high priority job second
      queue.enqueue({
        submissionId: "high-priority",
        problemId: "problem-1",
        teamId: "team-1",
        priority: 10, // Critical priority
        submissionData: {},
      });

      const allJobs = queue.getAllJobs();
      const queuedJobs = allJobs.filter((j) => j.status === "queued");

      // High priority (10) should come before low priority (1)
      expect(queuedJobs[0].priority).toBeGreaterThan(queuedJobs[1].priority);
      expect(queuedJobs[0].submissionId).toBe("high-priority");
      expect(queuedJobs[1].submissionId).toBe("low-priority");
    });
  });

  describe("Job Status", () => {
    it("should get job by ID", () => {
      queue.enqueue({
        submissionId: "test-9",
        problemId: "problem-1",
        teamId: "team-1",
        submissionData: {},
      });

      const job = queue.getJob("test-9");
      expect(job).toBeDefined();
      expect(job.id).toBe("test-9");
    });

    it("should return null for non-existent job", () => {
      const job = queue.getJob("non-existent");
      expect(job).toBeNull();
    });

    it("should list all jobs", () => {
      queue.enqueue({
        submissionId: "test-10",
        problemId: "problem-1",
        teamId: "team-1",
        submissionData: {},
      });

      queue.enqueue({
        submissionId: "test-11",
        problemId: "problem-1",
        teamId: "team-1",
        submissionData: {},
      });

      const allJobs = queue.getAllJobs();
      expect(allJobs).toHaveLength(2);
    });
  });

  describe("Job Completion", () => {
    it("should mark job as completed", () => {
      const job = queue.enqueue({
        submissionId: "test-12",
        problemId: "problem-1",
        teamId: "team-1",
        submissionData: {},
      });

      // Start the job manually since autoProcess is disabled
      queue.processQueue();

      const result = { status: "success", score: 100 };
      queue.completeJob(job.id, result);

      const completedJob = queue.getJob(job.id);
      expect(completedJob.status).toBe("completed");
    });

    it("should emit completed event", (done) => {
      const job = queue.enqueue({
        submissionId: "test-13",
        problemId: "problem-1",
        teamId: "team-1",
        submissionData: {},
      });

      // Start the job manually since autoProcess is disabled
      queue.processQueue();

      queue.on(JobEvent.COMPLETED, (completedJob, result) => {
        expect(completedJob.id).toBe(job.id);
        expect(result.status).toBe("success");
        done();
      });

      queue.completeJob(job.id, { status: "success" });
    });
  });

  describe("Job Failure", () => {
    it("should mark job as failed", () => {
      const job = queue.enqueue({
        submissionId: "test-14",
        problemId: "problem-1",
        teamId: "team-1",
        submissionData: {},
      });

      // Start the job manually since autoProcess is disabled
      queue.processQueue();

      const error = new Error("Test error");
      queue.failJob(job.id, error);

      const failedJob = queue.getJob(job.id);
      expect(failedJob.status).toBe("failed");
      expect(failedJob.error).toBeTruthy();
    });

    it("should emit failed event", (done) => {
      const job = queue.enqueue({
        submissionId: "test-15",
        problemId: "problem-1",
        teamId: "team-1",
        submissionData: {},
      });

      // Start the job manually since autoProcess is disabled
      queue.processQueue();

      queue.on(JobEvent.FAILED, (failedJob, error) => {
        expect(failedJob.id).toBe(job.id);
        expect(error).toBeDefined();
        done();
      });

      queue.failJob(job.id, new Error("Test error"));
    });
  });

  describe("Job Cancellation", () => {
    it("should cancel a queued job", () => {
      const job = queue.enqueue({
        submissionId: "test-16",
        problemId: "problem-1",
        teamId: "team-1",
        submissionData: {},
      });

      const cancelled = queue.cancelJob(job.id);
      expect(cancelled).toBeDefined();
      expect(cancelled.id).toBe(job.id);

      const cancelledJob = queue.getJob(job.id);
      expect(cancelledJob.status).toBe("cancelled");
    });

    it("should emit cancelled event", (done) => {
      const job = queue.enqueue({
        submissionId: "test-17",
        problemId: "problem-1",
        teamId: "team-1",
        submissionData: {},
      });

      queue.on(JobEvent.CANCELLED, (cancelledJob) => {
        expect(cancelledJob.id).toBe(job.id);
        done();
      });

      queue.cancelJob(job.id);
    });
  });

  describe("Statistics", () => {
    it("should return accurate statistics", () => {
      queue.enqueue({
        submissionId: "test-18",
        problemId: "problem-1",
        teamId: "team-1",
        submissionData: {},
      });

      queue.enqueue({
        submissionId: "test-19",
        problemId: "problem-1",
        teamId: "team-1",
        submissionData: {},
      });

      const stats = queue.getStats();
      expect(stats.total).toBe(2);
      expect(stats.queued).toBe(2);
      expect(stats.running).toBe(0);
      expect(stats.availableWorkers).toBe(2);
    });
  });
});
