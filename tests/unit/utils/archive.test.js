const fs = require("fs");
const path = require("path");
const os = require("os");
const { ArchiveManager } = require("../../../src/utils/archive");

function makeTempDir(prefix = "judge-arc-test-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe("ArchiveManager", () => {
  let archiveManager;
  let tmpDir;

  beforeEach(() => {
    archiveManager = new ArchiveManager();
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (e) {}
  });

  test("createArchive and extractArchive roundtrip", async () => {
    const src = path.join(tmpDir, "src");
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(path.join(src, "config.json"), JSON.stringify({ x: 1 }));

    const archivePath = path.join(tmpDir, "sample.tar.gz");
    await archiveManager.createArchive(src, archivePath);

    const dest = path.join(tmpDir, "dest");
    await archiveManager.extractArchive(archivePath, dest);

    expect(fs.existsSync(path.join(dest, "config.json"))).toBe(true);
  });

  test("extractArchive throws when mkdir fails", async () => {
    const am = new ArchiveManager();
    const src = path.join(tmpDir, "badsrc");
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(path.join(src, "a.txt"), "hello");
    const archivePath = path.join(tmpDir, "bad.tar.gz");
    await am.createArchive(src, archivePath);

    // mock fs.promises.mkdir to throw to trigger catch path
    const origMkdir = fs.promises.mkdir;
    fs.promises.mkdir = jest.fn(() => Promise.reject(new Error("mkdir fail")));

    const dest = path.join(tmpDir, "dest-bad");
    await expect(am.extractArchive(archivePath, dest)).rejects.toThrow(
      "mkdir fail",
    );

    // restore
    fs.promises.mkdir = origMkdir;
  });

  test("extractBuffer attempts unlink and swallows unlink errors", async () => {
    const am = new ArchiveManager();
    const src = path.join(tmpDir, "src3");
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(path.join(src, "a.txt"), "hello");
    const archivePath = path.join(tmpDir, "buf3.tar.gz");
    await am.createArchive(src, archivePath);
    const buf = fs.readFileSync(archivePath);

    // mock extractArchive to throw so finally block runs
    const origExtract = ArchiveManager.prototype.extractArchive;
    ArchiveManager.prototype.extractArchive = jest.fn(() => {
      throw new Error("extract fail");
    });

    // mock unlink to fail
    const origUnlink = fs.promises.unlink;
    fs.promises.unlink = jest.fn(() =>
      Promise.reject(new Error("unlink fail")),
    );

    await expect(
      am.extractBuffer(buf, path.join(tmpDir, "dest3")),
    ).rejects.toThrow("extract fail");

    // restore
    ArchiveManager.prototype.extractArchive = origExtract;
    fs.promises.unlink = origUnlink;
  });
});
