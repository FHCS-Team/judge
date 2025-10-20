const axios = require("./axios");
const fs = require("fs");
const fse = require("fs-extra");
const crypto = require("crypto");
const path = require("path");
const decompress = require("decompress");
const { file: tmpFile, dir: tmpDir } = require("tmp-promise");

/**
 * Download a file from URL and verify it against a SHA256 checksum
 * @param {string} url
 * @param {string} checksum
 *
 * @returns {Promise<Buffer>} The downloaded file as a Buffer
 */
async function downloadVerified(url, checksum) {
  const fileBuffer = await download(url);
  const hash = crypto.createHash("sha256").update(fileBuffer).digest("hex");
  if (hash !== checksum) {
    throw new Error("Checksum mismatch");
  }
  return fileBuffer;
}

/**
 * Download a file from URL or local path
 * @param {string} url
 *
 * @returns {Promise<Buffer>} The downloaded file as a Buffer
 */
async function download(url) {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    const response = await axios.get(url, { responseType: "arraybuffer" });
    return Buffer.from(response.data);
  } else {
    return fs.promises.readFile(url);
  }
}

/**
 * Check whether buffer is a zip file by magic bytes (PK..)
 * @param {Buffer} buf
 * @returns {boolean}
 */
/**
 * Use `decompress` library which supports many archive formats via plugins.
 * We'll accept a buffer and extract into destDir by first writing a temp file
 * when necessary, then running decompress.
 */
async function extractBuffer(buffer, destDir) {
  await fse.ensureDir(destDir);

  // write buffer to a tmp file and call decompress on it
  const { path: tmpPath, cleanup } = await tmpFile({ postfix: ".archive" });
  try {
    await fse.writeFile(tmpPath, buffer);
    await decompress(tmpPath, destDir);
  } finally {
    try {
      await cleanup();
    } catch (e) {
      // ignore cleanup errors
    }
  }
}

/**
 * Download and extract an archive (zip only) into destDir.
 * If checksum is provided, verifies it first.
 * @param {string} url
 * @param {string} destDir
 * @param {string} [checksum]
 */
async function downloadAndExtract(url, destDir, checksum) {
  const buffer = checksum
    ? await downloadVerified(url, checksum)
    : await download(url);

  // Write to tmp file and use decompress which supports zip/tar/gz
  const { path: tmpPath, cleanup } = await tmpFile({
    postfix: path.extname(url) || ".archive",
  });
  try {
    await fse.writeFile(tmpPath, buffer);
    await decompress(tmpPath, destDir);
    return destDir;
  } finally {
    try {
      await cleanup();
    } catch (e) {
      // ignore
    }
  }
}

/**
 * Write a downloaded buffer to a file on disk. Useful for problem packages
 * that are expected to be provided as a tar/file for docker.buildImage.
 * @param {string} url
 * @param {string} destFilePath
 * @param {string} [checksum]
 */
async function downloadToFile(url, destFilePath, checksum) {
  const buffer = checksum
    ? await downloadVerified(url, checksum)
    : await download(url);
  await fse.ensureDir(path.dirname(destFilePath));
  await fse.writeFile(destFilePath, buffer);
  return destFilePath;
}

/**
 * Prepare a submission directory by downloading & extracting a zip submission package
 * into a path like `${submissionsBasePath}/${submissionId}` and return that path.
 * @param {string} url
 * @param {string} submissionId
 * @param {string} submissionsBasePath
 * @param {string} [checksum]
 */
async function prepareSubmissionFromZip(
  url,
  submissionId,
  submissionsBasePath,
  checksum
) {
  const dest = path.join(submissionsBasePath, submissionId);
  await fs.promises.mkdir(dest, { recursive: true });
  await downloadAndExtract(url, dest, checksum);
  return dest;
}

/**
 * Download a problem package to a file path. Many parts of the code expect the
 * problem package as a single file (e.g. a tar stream passed to Docker build).
 * Save it as `${problemsBasePath}/${problemId}` (file, not directory) and return path.
 * @param {string} url
 * @param {string} problemId
 * @param {string} problemsBasePath
 * @param {string} [checksum]
 */
async function downloadProblemPackageToFile(
  url,
  problemId,
  problemsBasePath,
  checksum
) {
  const destFile = path.join(problemsBasePath, problemId);
  return await downloadToFile(url, destFile, checksum);
}

/**
 * Helper to create Docker bind mount strings in the same shape used by
 * `createEvaluationContainer`'s HostConfig.Binds. Caller provides absolute
 * local paths for submissions and results directories.
 * @param {string} submissionsBasePath
 * @param {string} resultsBasePath
 * @param {string} submissionId
 * @returns {string[]} binds
 */
function getBindMounts(submissionsBasePath, resultsBasePath, submissionId) {
  return [
    `${path.join(submissionsBasePath, submissionId)}:/submission:ro`,
    `${path.join(resultsBasePath, submissionId)}:/out:rw`,
  ];
}

/**
 * Extract a compressed file to a destination directory
 * @param {string} filePath
 * @param {string} destDir
 */
async function extract(filePath, destDir) {
  const unzipper = require("unzipper");
  await fs
    .createReadStream(filePath)
    .pipe(unzipper.Extract({ path: destDir }))
    .promise();
}

/**
 * Upload a blob to URL
 * @param {string} url
 * @param {Blob} blob
 */
async function uploadBlob(url, blob) {
  await axios.put(url, blob, {
    headers: {
      "Content-Type": "application/octet-stream",
    },
  });
}

/**
 * Upload a file to URL using local file path
 * @param {string} url
 * @param {string} path
 */
async function upload(url, path) {
  const data = await fs.promises.readFile(path);
  await uploadBlob(url, data);
}

module.exports = {
  downloadVerified,
  download,
  downloadAndExtract,
  extractBuffer,
  extractArchive: extractBuffer, // Alias for consistency
  downloadToFile,
  prepareSubmissionFromZip,
  downloadProblemPackageToFile,
  getBindMounts,
  uploadBlob,
  upload,
};
