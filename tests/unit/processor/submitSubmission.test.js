const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { ArchiveManager } = require("../../../src/utils/archive");

// We'll mock the Downloader module used by processor when testing archive_url flow
jest.mock("../../../src/utils/downloader");
const { Downloader } = require("../../../src/utils/downloader");

const { JudgeProcessor } = require("../../../src/processor");

// Helper to create a temporary directory
function makeTempDir(prefix = "judge-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe("JudgeProcessor.submitSubmission", () => {
  let tempDataDir;
  let archiveManager;

  beforeAll(() => {
    archiveManager = new ArchiveManager();
  });

  beforeEach(() => {
    tempDataDir = makeTempDir();
  });

  afterEach(async () => {
    // remove temp dir recursively
    try {
      fs.rmSync(tempDataDir, { recursive: true, force: true });
    } catch (e) {
      // ignore
    }
  });

  test("handles archive_data (buffer) flow, computes sha and writes metadata", async () => {
    // Prepare a small directory to archive
    const srcDir = path.join(tempDataDir, "src");
    fs.mkdirSync(srcDir, { recursive: true });
    const config = { hello: "world" };
    fs.writeFileSync(path.join(srcDir, "config.json"), JSON.stringify(config));
    fs.writeFileSync(path.join(srcDir, "file.txt"), "test content");

    // Create archive file
    const archivePath = path.join(tempDataDir, "sample.tar.gz");
    await archiveManager.createArchive(srcDir, archivePath);

    const archiveBuffer = fs.readFileSync(archivePath);
    const expectedSha = crypto
      .createHash("sha256")
      .update(archiveBuffer)
      .digest("hex");

    const processor = new JudgeProcessor({ dataDir: tempDataDir });

    const submissionId = "sub-buffer-1";
    const problemId = "prob-buffer-1";

    const result = await processor.submitSubmission({
      submission_id: submissionId,
      problem_id: problemId,
      archive_data: archiveBuffer,
      team_id: "team-x",
    });

    expect(result.status).toBe("success");
    expect(result.sha256).toBe(expectedSha);

    const submissionDir = path.resolve(
      tempDataDir,
      "submissions",
      problemId,
      submissionId,
    );
    const metadataFile = path.resolve(submissionDir, "metadata.json");
    expect(fs.existsSync(metadataFile)).toBe(true);

    const metadata = JSON.parse(fs.readFileSync(metadataFile, "utf8"));
    expect(metadata.sha256).toBe(expectedSha);
    expect(metadata.archive_size_bytes).toBe(archiveBuffer.length);
    expect(fs.existsSync(path.join(submissionDir, "config.json"))).toBe(true);
    expect(fs.existsSync(path.join(submissionDir, "file.txt"))).toBe(true);
  });

  test("handles archive_url flow by using Downloader.downloadFile (mocked)", async () => {
    // Prepare a small directory to archive
    const srcDir = path.join(tempDataDir, "src2");
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, "config.json"),
      JSON.stringify({ a: 1 }),
    );

    // Create archive file we will "serve"
    const archivePath = path.join(tempDataDir, "sample2.tar.gz");
    await archiveManager.createArchive(srcDir, archivePath);
    const archiveBuffer = fs.readFileSync(archivePath);
    const expectedSha = crypto
      .createHash("sha256")
      .update(archiveBuffer)
      .digest("hex");

    // Mock Downloader.downloadFile to copy our prepared archive to the requested output path
    Downloader.mockImplementation(() => {
      return {
        async downloadFile(url, outputPath) {
          // copy prepared archive
          await fs.promises.mkdir(path.dirname(outputPath), {
            recursive: true,
          });
          await fs.promises.copyFile(archivePath, outputPath);
          return outputPath;
        },
      };
    });

    const processor = new JudgeProcessor({ dataDir: tempDataDir });

    const submissionId = "sub-url-1";
    const problemId = "prob-url-1";
    const fakeUrl = "http://example.local/sample2.tar.gz";

    const result = await processor.submitSubmission({
      submission_id: submissionId,
      problem_id: problemId,
      archive_url: fakeUrl,
      team_id: "team-y",
    });

    expect(result.status).toBe("success");
    expect(result.sha256).toBe(expectedSha);

    const submissionDir = path.resolve(
      tempDataDir,
      "submissions",
      problemId,
      submissionId,
    );
    const metadataFile = path.resolve(submissionDir, "metadata.json");
    expect(fs.existsSync(metadataFile)).toBe(true);

    const metadata = JSON.parse(fs.readFileSync(metadataFile, "utf8"));
    expect(metadata.sha256).toBe(expectedSha);
    expect(metadata.archive_source).toBe("url");
    expect(fs.existsSync(path.join(submissionDir, "config.json"))).toBe(true);
  });
});
