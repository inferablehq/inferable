import { createLogger, format, transports } from "winston";
import { AsyncLocalStorage } from "async_hooks";
import { env } from "../../utilities/env";
import { rollbar, RollbarTransport } from "./rollbar";

export const logContext = new AsyncLocalStorage();

const winston = createLogger({
  level: env.LOG_LEVEL,
  defaultMeta: {
    "deployment.version": env.VERSION,
    "queue.ingestionEnabled": env.ENABLE_QUEUE_INGESTION
  },
  transports: [
    new transports.Console({
      format: format.combine(
        format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        env.NODE_ENV === "development"
          ? format.printf(({ level, message, timestamp, ...meta }) => {
              const metaString = Object.keys(meta).length
                ? `\n${JSON.stringify(meta, null, 2)}`
                : "";
              return `${timestamp} ${level.toUpperCase()}: ${message}${metaString}`;
            })
          : format.json(),
        format.colorize({ all: process.env.NODE_ENV === "development" }),
        format.errors({ stack: true }),
      ),
    }),
    env.NODE_ENV === "production"
      ? new RollbarTransport({ level: "warn" }, rollbar)
      : null,
  ]
    .filter(Boolean)
    .map((t) => t!),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LogMeta = Record<string, any>;
type LogLevel = "error" | "warn" | "info" | "debug";

const log = (level: LogLevel, message: string, meta?: LogMeta) => {
  if (meta) {
    Object.keys(meta).forEach((key) => {
      const obj = meta[key];
      if (obj instanceof Error) {
        meta[key] = {
          name: obj.name,
          message: obj.message,
          stack: obj.stack,
        };
      }
    });
  }

  const store = logContext.getStore();
  if (store) {
    winston.log(level, message, {
      ...meta,
      ...store,
    });
  } else {
    winston.log(level, message, meta);
  }
};

export const logger = {
  error: (message: string, meta?: LogMeta) => log("error", message, meta),
  warn: (message: string, meta?: LogMeta) => log("warn", message, meta),
  info: (message: string, meta?: LogMeta) => log("info", message, meta),
  debug: (message: string, meta?: LogMeta) => log("debug", message, meta),
};
