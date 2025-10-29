const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const tar = require("tar");
const { download } = require("../src/utils/downloader");
const { ArchiveManager } = require("../src/utils/archive");
const logger = require("../src/utils/logger");

async function makePackage(dir) {
  await fs.promises.mkdir(dir, { recursive: true });
  // minimal submission package
  await fs.promises.writeFile(
    path.join(dir, "README.txt"),
    "demo submission package",
  );
  await fs.promises.writeFile(
    path.join(dir, "config.json"),
    JSON.stringify(
      { submission: "demo", created_at: new Date().toISOString() },
      null,
      2,
    ),
  );
}

async function createTarGz(sourceDir, outPath) {
  await tar.create(
    {
      gzip: true,
      file: outPath,
      cwd: sourceDir,
    },
    ["."],
  );
}

async function run() {
  const tmp = path.join(os.tmpdir(), `demo-submission-${Date.now()}`);
  const pkgDir = path.join(tmp, "package");
  await makePackage(pkgDir);

  const archivePath = path.join(tmp, "package.tar.gz");
  await createTarGz(pkgDir, archivePath);

  // Start simple HTTP server to serve the archive at /submission/1/package
  const server = http.createServer((req, res) => {
    if (req.url === "/submission/1/package") {
      const stream = fs.createReadStream(archivePath);
      res.writeHead(200, {
        "Content-Type": "application/gzip",
        "Content-Length": fs.statSync(archivePath).size,
      });
      stream.pipe(res);
      return;
    }
    res.writeHead(404);
    res.end("not found");
  });

  // Try to start on port 8000, but fall back to an ephemeral port if it's busy.
  const startServer = (port) =>
    new Promise((resolve, reject) => {
      const onError = (err) => {
        server.removeListener("listening", onListening);
        reject(err);
      };
      const onListening = () => {
        server.removeListener("error", onError);
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(port);
    });

  let port = 8000;
  try {
    await startServer(port);
  } catch (err) {
    if (err && err.code === "EADDRINUSE") {
      logger.warn("Port 8000 in use; falling back to an ephemeral port");
      await startServer(0);
      port = server.address().port;
    } else {
      throw err;
    }
  }

  logger.info(
    `Demo HTTP server running at http://localhost:${port}/submission/1/package`,
  );

  try {
    const url = `http://localhost:${port}/submission/1/package`;
    const downloadDest = path.join(tmp, "downloaded.tar.gz");
    logger.info({ url, downloadDest }, "Downloading demo package");
    await download(url, downloadDest);

    const extractDir = path.join(tmp, "extracted");
    await fs.promises.mkdir(extractDir, { recursive: true });

    const am = new ArchiveManager();
    await am.extractArchive(downloadDest, extractDir);

    logger.info({ extractDir }, "Extraction complete. Contents:");
    const files = await fs.promises.readdir(extractDir);
    console.log(files);
  } catch (err) {
    console.error("Demo failed", err && err.stack ? err.stack : err);
  } finally {
    server.close();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
