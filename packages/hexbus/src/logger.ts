import * as p from "@clack/prompts";

import { color } from "./color";
import type { CliLogger, LogLevel } from "./types";

/**
 * Supported log levels in ascending verbosity.
 */
export const LOG_LEVELS: LogLevel[] = ["error", "warn", "info", "debug"];
/**
 * Alias for `LOG_LEVELS` kept for callers that prefer validation-oriented
 * naming.
 */
export const validLogLevels = LOG_LEVELS;

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 3,
  error: 0,
  info: 2,
  warn: 1,
};

function safeStringify(arg: unknown): string {
  try {
    return JSON.stringify(arg, null, 2);
  } catch {
    return String(arg);
  }
}

function formatArgs(args: unknown[]): string {
  if (args.length === 0) {
    return "";
  }

  return `\n${args.map((arg) => `  - ${safeStringify(arg)}`).join("\n")}`;
}

/**
 * Formats a log message with a level badge and optional structured arguments.
 *
 * @param logLevel - Log level or custom badge label.
 * @param message - Primary message to render.
 * @param args - Additional values rendered as indented JSON-like bullets.
 * @returns A formatted message string.
 */
export function formatLogMessage(
  logLevel: LogLevel | "success" | "failed" | string,
  message: unknown,
  args: unknown[] = []
): string {
  const messageStr = typeof message === "string" ? message : String(message);
  const formattedArgs = formatArgs(args);

  switch (logLevel) {
    case "error": {
      return `${color.bgRed(color.black(" error "))} ${messageStr}${formattedArgs}`;
    }
    case "warn": {
      return `${color.bgYellow(color.black(" warning "))} ${messageStr}${formattedArgs}`;
    }
    case "info": {
      return `${color.bgGreen(color.black(" info "))} ${messageStr}${formattedArgs}`;
    }
    case "debug": {
      return `${color.bgBlack(color.white(" debug "))} ${messageStr}${formattedArgs}`;
    }
    case "success": {
      return `${color.bgGreen(color.white(" success "))} ${messageStr}${formattedArgs}`;
    }
    case "failed": {
      return `${color.bgRed(color.white(" failed "))} ${messageStr}${formattedArgs}`;
    }
    default: {
      return `[${logLevel.toUpperCase()}] ${messageStr}${formattedArgs}`;
    }
  }
}

/**
 * Emits a formatted message through the prompt logger.
 *
 * @param logLevel - Log level or custom badge label.
 * @param message - Primary message to render.
 * @param args - Additional values rendered below the message.
 */
export function logMessage(
  logLevel: LogLevel | "success" | "failed" | string,
  message: unknown,
  ...args: unknown[]
): void {
  const formattedMessage = formatLogMessage(logLevel, message, args);

  switch (logLevel) {
    case "error": {
      process.stderr.write(`${formattedMessage}\n`);
      break;
    }
    case "warn": {
      p.log.warn(formattedMessage);
      break;
    }
    case "info":
    case "debug": {
      p.log.info(formattedMessage);
      break;
    }
    case "success":
    case "failed": {
      p.outro(formattedMessage);
      break;
    }
    default: {
      p.log.message(formattedMessage);
    }
  }
}

/**
 * Formats a bounded progress step indicator.
 *
 * @remarks
 * `current` is clamped between `0` and `total`, and `total` is clamped to at
 * least `0` so malformed progress values still render predictably.
 *
 * @param current - Current step number.
 * @param total - Total number of steps.
 * @param label - Step label shown after the progress bar.
 * @returns A formatted progress row.
 */
export function formatStep(
  current: number,
  total: number,
  label: string
): string {
  const safeTotal = Math.max(0, total);
  const safeCurrent = Math.min(Math.max(0, current), safeTotal);
  const filled = color.green("█".repeat(safeCurrent));
  const empty = color.dim("░".repeat(safeTotal - safeCurrent));
  return `[${filled}${empty}] Step ${safeCurrent}/${safeTotal}: ${label}`;
}

/**
 * Creates a `CliLogger` backed by Clack prompt output.
 *
 * @remarks
 * Messages below the configured verbosity are ignored for `debug`, `info`,
 * `warn`, and `error`. Other output helpers such as `message`, `note`,
 * `success`, `failed`, and `outro` always render because they represent
 * explicit user interaction states rather than diagnostic verbosity.
 *
 * @param level - Minimum log level to emit.
 * @returns A logger suitable for `CliContext.logger`.
 */
export function createCliLogger(level: LogLevel = "info"): CliLogger {
  const currentLevelPriority = LOG_LEVEL_PRIORITY[level];
  const shouldLog = (targetLevel: LogLevel) =>
    LOG_LEVEL_PRIORITY[targetLevel] <= currentLevelPriority;

  return {
    debug(message: string, ...args: unknown[]) {
      if (shouldLog("debug")) {
        logMessage("debug", message, ...args);
      }
    },
    error(message: string, ...args: unknown[]) {
      if (shouldLog("error")) {
        logMessage("error", message, ...args);
      }
    },
    failed(message: string, exitCode = 1): never {
      logMessage("failed", message);
      process.exit(exitCode);
    },
    info(message: string, ...args: unknown[]) {
      if (shouldLog("info")) {
        logMessage("info", message, ...args);
      }
    },
    message(message: string) {
      p.log.message(message);
    },
    note(content: string, title?: string) {
      p.note(content, title, {
        format: (line: string) => line,
      });
    },
    outro(message: string) {
      p.outro(message);
    },
    step(current: number, total: number, label: string) {
      p.log.step(formatStep(current, total, label));
    },
    success(message: string) {
      logMessage("success", message);
    },
    warn(message: string, ...args: unknown[]) {
      if (shouldLog("warn")) {
        logMessage("warn", message, ...args);
      }
    },
  };
}

/**
 * Shared color formatter used by logger output.
 */
export { color };
