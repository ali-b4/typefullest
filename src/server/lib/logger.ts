type LogLevel = "debug" | "info" | "warn" | "error";

const levelRank: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveLogLevel(): LogLevel {
  const candidate = process.env.LOG_LEVEL?.toLowerCase();
  if (
    candidate === "debug" ||
    candidate === "info" ||
    candidate === "warn" ||
    candidate === "error"
  ) {
    return candidate;
  }

  return process.env.DEBUG_TYPEFULLY === "true" ? "debug" : "info";
}

const configuredLevel = resolveLogLevel();

function shouldLog(level: LogLevel) {
  return levelRank[level] >= levelRank[configuredLevel];
}

function write(level: LogLevel, message: string, metadata?: Record<string, unknown>) {
  if (!shouldLog(level)) {
    return;
  }

  const payload = {
    time: new Date().toISOString(),
    level,
    message,
    ...(metadata ? { metadata } : {}),
  };

  console[level === "debug" ? "log" : level](JSON.stringify(payload));
}

export const logger = {
  debug(message: string, metadata?: Record<string, unknown>) {
    write("debug", message, metadata);
  },
  info(message: string, metadata?: Record<string, unknown>) {
    write("info", message, metadata);
  },
  warn(message: string, metadata?: Record<string, unknown>) {
    write("warn", message, metadata);
  },
  error(message: string, metadata?: Record<string, unknown>) {
    write("error", message, metadata);
  },
};
