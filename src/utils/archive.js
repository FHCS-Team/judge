const fs = require("fs");
const path = require("path");
const tar = require("tar");
const unzipper = require("unzipper");
const logger = require("./logger");

/**
 * Archive management utilities for handling problem packages and submissions
 */
class ArchiveManager {
  /**
   * Extract a tar.gz archive to a destination directory
   * @param {string} archivePath - Path to the archive file
   * @param {string} destDir - Destination directory
   */
  async extractArchive(archivePath, destDir) {
    logger.info({ archivePath, destDir }, "Extracting archive");

    try {
      await fs.promises.mkdir(destDir, { recursive: true });

      // Choose extractor based on extension or file signature
      let ext = (path.extname(archivePath) || "").toLowerCase();

      // If extension is missing, inspect magic bytes to detect format (zip vs tar/gzip)
      if (!ext) {
        try {
          const fd = await fs.promises.open(archivePath, "r");
          const header = Buffer.alloc(8);
          await fd.read(header, 0, 8, 0);
          await fd.close();
          if (header[0] === 0x50 && header[1] === 0x4b) {
            ext = ".zip";
          } else {
            ext = ".tar.gz";
          }
        } catch (e) {
          // ignore detection failure and fall back to default
          logger.debug(
            { err: e && e.message ? e.message : e },
            "Failed to detect archive type by header",
          );
        }
      }

      if (ext === ".zip") {
        // Extract using the `unzipper` package
        await new Promise((resolve, reject) => {
          const read = fs.createReadStream(archivePath);
          const extractor = unzipper.Extract({ path: destDir });
          read.pipe(extractor);
          extractor.on("close", resolve);
          extractor.on("error", reject);
          read.on("error", reject);
        });
      } else {
        // Default: extract as tar (supports .tar.gz, .tgz and plain tar)
        await tar.extract({
          file: archivePath,
          cwd: destDir,
          strip: 1, // Remove the top-level directory from archive
        });
      }

      logger.info({ archivePath, destDir }, "Archive extracted successfully");
    } catch (error) {
      logger.error(
        { archivePath, destDir, error: error.message },
        "Failed to extract archive",
      );
      throw error;
    }
  }

  /**
   * Extract archive data from buffer
   * @param {Buffer} archiveData - Archive data buffer
   * @param {string} destDir - Destination directory
   */
  async extractBuffer(archiveData, destDir) {
    logger.info(
      { destDir, size: archiveData.length },
      "Extracting archive from buffer",
    );

    try {
      await fs.promises.mkdir(destDir, { recursive: true });

      // Detect format from magic bytes and pick an extension
      const signature = archiveData.slice(0, 8);
      let ext = ".tar.gz";
      // gzip magic: 1F 8B
      if (signature[0] === 0x1f && signature[1] === 0x8b) {
        ext = ".tar.gz";
      }
      // zip magic: PK 0x03 0x04
      else if (signature[0] === 0x50 && signature[1] === 0x4b) {
        ext = ".zip";
      }
      // 7z magic: 37 7A BC AF 27 1C
      else if (
        signature[0] === 0x37 &&
        signature[1] === 0x7a &&
        signature[2] === 0xbc &&
        signature[3] === 0xaf &&
        signature[4] === 0x27 &&
        signature[5] === 0x1c
      ) {
        ext = ".7z";
      }

      // Create a temporary file for extraction with detected extension
      const tempFile = path.join(
        require("os").tmpdir(),
        `extract-${Date.now()}${ext}`,
      );
      await fs.promises.writeFile(tempFile, archiveData);

      try {
        await this.extractArchive(tempFile, destDir);
      } finally {
        // Cleanup temp file — log any failure to help debugging
        await fs.promises.unlink(tempFile).catch((err) => {
          try {
            logger.debug({ err, tempFile }, "Failed to cleanup temp file");
          } catch (e) {
            // best effort: swallow if logger fails
          }
        });
      }

      logger.info({ destDir }, "Archive buffer extracted successfully");
    } catch (error) {
      logger.error(
        { destDir, error: error.message },
        "Failed to extract archive buffer",
      );
      throw error;
    }
  }

  /**
   * Create a tar.gz archive from a directory
   * @param {string} sourceDir - Source directory to archive
   * @param {string} archivePath - Output archive path
   */
  async createArchive(sourceDir, archivePath) {
    logger.info({ sourceDir, archivePath }, "Creating archive");

    try {
      await tar.create(
        {
          gzip: true,
          file: archivePath,
          cwd: sourceDir,
        },
        ["."],
      );

      logger.info({ sourceDir, archivePath }, "Archive created successfully");
    } catch (error) {
      logger.error(
        { sourceDir, archivePath, error: error.message },
        "Failed to create archive",
      );
      throw error;
    }
  }
}

module.exports = { ArchiveManager };
