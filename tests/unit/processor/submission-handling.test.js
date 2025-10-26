const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { JudgeProcessor } = require("../../../src/processor");

describe("JudgeProcessor - Submission Handling", () => {
  let processor;
  let testDataDir;

  beforeEach(async () => {
    // Create a temporary test directory
    testDataDir = path.resolve(
      __dirname,
      "../../fixtures/test-data-" + Date.now(),
    );
    processor = new JudgeProcessor({ dataDir: testDataDir });
    await processor.ensureDirectories();
  });

  afterEach(async () => {
    // Cleanup test directory
    if (testDataDir && fs.existsSync(testDataDir)) {
      await fs.promises.rm(testDataDir, { recursive: true, force: true });
    }
  });

  describe("submitSubmission", () => {
    test("should compute SHA-256 hash for archive_data submission", async () => {
      const submissionData = {
        submission_id: "test-submission-1",
        problem_id: "test-problem-1",
        team_id: "test-team-1",
        archive_data: Buffer.from("test archive content"),
      };

      // Mock the ArchiveManager to avoid actual extraction
      const originalExtractBuffer = require("../../../src/utils/archive")
        .ArchiveManager.prototype.extractBuffer;
      require("../../../src/utils/archive").ArchiveManager.prototype.extractBuffer =
        jest.fn().mockResolvedValue();

      const result = await processor.submitSubmission(submissionData);

      // Verify SHA-256 was computed
      expect(result.sha256).toBeDefined();
      expect(result.sha256).toHaveLength(64);
      expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);

      // Verify it's the correct hash
      const expectedHash = crypto
        .createHash("sha256")
        .update(submissionData.archive_data)
        .digest("hex");
      expect(result.sha256).toBe(expectedHash);

      // Restore original method
      require("../../../src/utils/archive").ArchiveManager.prototype.extractBuffer =
        originalExtractBuffer;
    });

    test("should write metadata.json with SHA-256 and submission details", async () => {
      const submissionData = {
        submission_id: "test-submission-2",
        problem_id: "test-problem-2",
        team_id: "test-team-2",
        archive_data: Buffer.from("test archive content for metadata"),
      };

      // Mock the ArchiveManager
      const originalExtractBuffer = require("../../../src/utils/archive")
        .ArchiveManager.prototype.extractBuffer;
      require("../../../src/utils/archive").ArchiveManager.prototype.extractBuffer =
        jest.fn().mockResolvedValue();

      const result = await processor.submitSubmission(submissionData);

      // Check metadata file exists
      const metadataPath = path.resolve(result.submissionDir, "metadata.json");
      const metadataExists = await fs.promises
        .access(metadataPath)
        .then(() => true)
        .catch(() => false);

      expect(metadataExists).toBe(true);

      // Read and verify metadata content
      const metadata = JSON.parse(
        await fs.promises.readFile(metadataPath, "utf8"),
      );
      expect(metadata.submission_id).toBe(submissionData.submission_id);
      expect(metadata.problem_id).toBe(submissionData.problem_id);
      expect(metadata.team_id).toBe(submissionData.team_id);
      expect(metadata.sha256).toBeDefined();
      expect(metadata.received_at).toBeDefined();
      expect(metadata.archive_source).toBe("data");
      expect(metadata.archive_size_bytes).toBe(
        submissionData.archive_data.length,
      );

      // Restore original method
      require("../../../src/utils/archive").ArchiveManager.prototype.extractBuffer =
        originalExtractBuffer;
    });

    test("should handle archive_url submissions with SHA-256 hash", async () => {
      const submissionData = {
        submission_id: "test-submission-3",
        problem_id: "test-problem-3",
        team_id: "test-team-3",
        archive_url: "https://example.com/submission.tar.gz",
      };

      // Mock the Downloader and ArchiveManager
      const mockArchiveContent = Buffer.from("mock archive from url");
      const originalDownloadFile = require("../../../src/utils/downloader")
        .Downloader.prototype.downloadFile;
      const originalExtractArchive = require("../../../src/utils/archive")
        .ArchiveManager.prototype.extractArchive;

      require("../../../src/utils/downloader").Downloader.prototype.downloadFile =
        jest.fn().mockImplementation(async (url, outputPath) => {
          await fs.promises.writeFile(outputPath, mockArchiveContent);
          return outputPath;
        });

      require("../../../src/utils/archive").ArchiveManager.prototype.extractArchive =
        jest.fn().mockResolvedValue();

      const result = await processor.submitSubmission(submissionData);

      // Verify SHA-256 was computed
      expect(result.sha256).toBeDefined();
      expect(result.sha256).toHaveLength(64);

      const expectedHash = crypto
        .createHash("sha256")
        .update(mockArchiveContent)
        .digest("hex");
      expect(result.sha256).toBe(expectedHash);

      // Verify metadata
      const metadataPath = path.resolve(result.submissionDir, "metadata.json");
      const metadata = JSON.parse(
        await fs.promises.readFile(metadataPath, "utf8"),
      );
      expect(metadata.archive_source).toBe("url");
      expect(metadata.archive_url).toBe(submissionData.archive_url);

      // Restore original methods
      require("../../../src/utils/downloader").Downloader.prototype.downloadFile =
        originalDownloadFile;
      require("../../../src/utils/archive").ArchiveManager.prototype.extractArchive =
        originalExtractArchive;
    });

    test("should validate submission package after extraction", async () => {
      const submissionData = {
        submission_id: "test-submission-4",
        problem_id: "test-problem-4",
        team_id: "test-team-4",
        archive_data: Buffer.from("test archive with validation"),
      };

      // Mock the ArchiveManager
      const originalExtractBuffer = require("../../../src/utils/archive")
        .ArchiveManager.prototype.extractBuffer;
      require("../../../src/utils/archive").ArchiveManager.prototype.extractBuffer =
        jest.fn().mockResolvedValue();

      // Spy on validateSubmissionPackage
      const validateSpy = jest.spyOn(processor, "validateSubmissionPackage");

      await processor.submitSubmission(submissionData);

      // Verify validation was called
      expect(validateSpy).toHaveBeenCalledTimes(1);
      expect(validateSpy).toHaveBeenCalledWith(
        expect.stringContaining(submissionData.submission_id),
      );

      // Restore
      validateSpy.mockRestore();
      require("../../../src/utils/archive").ArchiveManager.prototype.extractBuffer =
        originalExtractBuffer;
    });

    test("should throw error if neither archive_url nor archive_data provided", async () => {
      const submissionData = {
        submission_id: "test-submission-5",
        problem_id: "test-problem-5",
        team_id: "test-team-5",
      };

      await expect(processor.submitSubmission(submissionData)).rejects.toThrow(
        "Either archive_url or archive_data must be provided",
      );
    });
  });

  describe("validateSubmissionPackage", () => {
    test("should pass validation for submission without config.json", async () => {
      const submissionDir = path.resolve(
        processor.submissionsDir,
        "test-problem",
        "test-submission",
      );
      await fs.promises.mkdir(submissionDir, { recursive: true });

      // Should not throw
      await expect(
        processor.validateSubmissionPackage(submissionDir),
      ).resolves.not.toThrow();
    });

    test("should log when config.json exists in submission", async () => {
      const submissionDir = path.resolve(
        processor.submissionsDir,
        "test-problem-config",
        "test-submission-config",
      );
      await fs.promises.mkdir(submissionDir, { recursive: true });

      // Create a config.json
      const config = { test: "config" };
      await fs.promises.writeFile(
        path.resolve(submissionDir, "config.json"),
        JSON.stringify(config),
      );

      // Should not throw and should log
      await expect(
        processor.validateSubmissionPackage(submissionDir),
      ).resolves.not.toThrow();
    });

    test("should warn when config.json is invalid JSON", async () => {
      const submissionDir = path.resolve(
        processor.submissionsDir,
        "test-problem-invalid",
        "test-submission-invalid",
      );
      await fs.promises.mkdir(submissionDir, { recursive: true });

      // Create an invalid config.json
      await fs.promises.writeFile(
        path.resolve(submissionDir, "config.json"),
        "{ invalid json",
      );

      // Should not throw but should warn
      await expect(
        processor.validateSubmissionPackage(submissionDir),
      ).resolves.not.toThrow();
    });
  });

  describe("SHA-256 hash consistency", () => {
    test("should produce consistent SHA-256 hashes for same content", async () => {
      const content = Buffer.from("consistent test content");

      const submissionData1 = {
        submission_id: "test-submission-6a",
        problem_id: "test-problem-6",
        archive_data: content,
      };

      const submissionData2 = {
        submission_id: "test-submission-6b",
        problem_id: "test-problem-6",
        archive_data: Buffer.from("consistent test content"),
      };

      // Mock extraction
      const originalExtractBuffer = require("../../../src/utils/archive")
        .ArchiveManager.prototype.extractBuffer;
      require("../../../src/utils/archive").ArchiveManager.prototype.extractBuffer =
        jest.fn().mockResolvedValue();

      const result1 = await processor.submitSubmission(submissionData1);
      const result2 = await processor.submitSubmission(submissionData2);

      expect(result1.sha256).toBe(result2.sha256);

      // Restore
      require("../../../src/utils/archive").ArchiveManager.prototype.extractBuffer =
        originalExtractBuffer;
    });

    test("should produce different SHA-256 hashes for different content", async () => {
      const submissionData1 = {
        submission_id: "test-submission-7a",
        problem_id: "test-problem-7",
        archive_data: Buffer.from("content A"),
      };

      const submissionData2 = {
        submission_id: "test-submission-7b",
        problem_id: "test-problem-7",
        archive_data: Buffer.from("content B"),
      };

      // Mock extraction
      const originalExtractBuffer = require("../../../src/utils/archive")
        .ArchiveManager.prototype.extractBuffer;
      require("../../../src/utils/archive").ArchiveManager.prototype.extractBuffer =
        jest.fn().mockResolvedValue();

      const result1 = await processor.submitSubmission(submissionData1);
      const result2 = await processor.submitSubmission(submissionData2);

      expect(result1.sha256).not.toBe(result2.sha256);

      // Restore
      require("../../../src/utils/archive").ArchiveManager.prototype.extractBuffer =
        originalExtractBuffer;
    });
  });
});
