/**
 * Logger utility with configurable log levels
 */

const config = require("../config");

const LogLevel = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
  TRACE: 4,
};

const levelNames = {
  [LogLevel.ERROR]: "ERROR",
  [LogLevel.WARN]: "WARN",
  [LogLevel.INFO]: "INFO",
  [LogLevel.DEBUG]: "DEBUG",
  [LogLevel.TRACE]: "TRACE",
};

// Get current log level from config
const currentLevel =
  LogLevel[config.logging.level.toUpperCase()] || LogLevel.INFO;

function formatMessage(level, ...args) {
  const timestamp = new Date().toISOString();
  const levelName = levelNames[level];

  if (config.logging.format === "json") {
    return JSON.stringify({
      timestamp,
      level: levelName,
      message: args
        .map((arg) =>
          typeof arg === "object" ? JSON.stringify(arg) : String(arg)
        )
        .join(" "),
    });
  } else {
    return `[${timestamp}] [${levelName}] ${args.join(" ")}`;
  }
}

function log(level, ...args) {
  if (level > currentLevel) {
    return; // Skip if below current log level
  }

  const message = formatMessage(level, ...args);

  if (config.logging.consoleEnabled) {
    if (level === LogLevel.ERROR) {
      console.error(message);
    } else if (level === LogLevel.WARN) {
      console.warn(message);
    } else {
      console.log(message);
    }
  }

  // TODO: Add file logging if needed
}

const logger = {
  error: (...args) => log(LogLevel.ERROR, ...args),
  warn: (...args) => log(LogLevel.WARN, ...args),
  info: (...args) => log(LogLevel.INFO, ...args),
  debug: (...args) => log(LogLevel.DEBUG, ...args),
  trace: (...args) => log(LogLevel.TRACE, ...args),
};

module.exports = logger;
