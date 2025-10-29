#!/usr/bin/env node
const logger = require("#utils/logger.js");

require("./worker")
  .init()
  .catch((err) => {
    logger.error(
      `[index] worker failed to start: ${err}`,
      err && err.message ? err.message : err,
    );
    process.exit(1);
  });
