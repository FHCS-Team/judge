const fs = require("fs");
const path = require("path");
const tar = require("tar");
const { createGunzip } = require("zlib");
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

      // Extract using tar library
      await tar.extract({
        file: archivePath,
        cwd: destDir,
        strip: 1, // Remove the top-level directory from archive
      });

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

      // Create a temporary file for extraction
      const tempFile = path.join(
        require("os").tmpdir(),
        `extract-${Date.now()}.tar.gz`,
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
