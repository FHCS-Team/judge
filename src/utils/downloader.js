const fs = require("fs");
const path = require("path");
const axios = require("../config/axios");
const logger = require("./logger");

/**
 * File download and upload utilities
 */
class Downloader {
  /**
   * Download file from URL
   * @param {string} url - URL to download from
   * @param {string} outputPath - Local file path to save to
   */
  async downloadFile(url, outputPath) {
    logger.info({ url, outputPath }, "Downloading file");

    try {
      // Ensure directory exists
      await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

      const response = await axios.get(url, {
        responseType: "stream",
      });

      const writer = fs.createWriteStream(outputPath);
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on("finish", () => {
          logger.info({ url, outputPath }, "File downloaded successfully");
          resolve(outputPath);
        });
        writer.on("error", (error) => {
          logger.error(
            { url, outputPath, error: error.message },
            "Failed to download file",
          );
          reject(error);
        });
      });
    } catch (error) {
      logger.error(
        { url, outputPath, error: error.message },
        "Failed to download file",
      );
      throw error;
    }
  }

  /**
   * Upload file to URL
   * @param {string} filePath - Local file path to upload
   * @param {string} uploadUrl - URL to upload to
   */
  async uploadFile(filePath, uploadUrl) {
    logger.info({ filePath, uploadUrl }, "Uploading file");

    try {
      const fileStats = await fs.promises.stat(filePath);
      const fileStream = fs.createReadStream(filePath);

      const response = await axios.post(uploadUrl, fileStream, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Content-Length": fileStats.size,
        },
      });

      logger.info({ filePath, uploadUrl }, "File uploaded successfully");
      return response.data;
    } catch (error) {
      logger.error(
        { filePath, uploadUrl, error: error.message },
        "Failed to upload file",
      );
      throw error;
    }
  }
}

/**
 * Download file from URL using config/axios.js
 */
// Create a single downloader instance to avoid allocating on every call
const _downloaderInstance = new Downloader();

const download = async (url, outputPath) => {
  return await _downloaderInstance.downloadFile(url, outputPath);
};

const upload = async (filePath, uploadUrl) => {
  return await _downloaderInstance.uploadFile(filePath, uploadUrl);
};

/**
 * Update a file with newer content
 */
const update = async (filePath, newContent) => {
  try {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, newContent, "utf8");
    logger.info({ filePath }, "File updated successfully");
  } catch (error) {
    logger.error({ filePath, error: error.message }, "Failed to update file");
    throw error;
  }
};

module.exports = { Downloader, download, upload, update };
