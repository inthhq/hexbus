import type { CliLogger } from "./types";

/**
 * Metadata used to render a known CLI error.
 */
export interface ErrorCatalogEntry {
  /**
   * Stable machine-readable error code.
   */
  code: string;
  /**
   * User-facing error message.
   */
  message: string;
  /**
   * Optional recovery guidance displayed after the message.
   */
  hint?: string;
  /**
   * Optional documentation URL displayed after the hint.
   */
  docs?: string;
}

/**
 * Error catalog keyed by stable error code.
 */
export type ErrorCatalog = Record<string, ErrorCatalogEntry>;

/**
 * Built-in errors used by the Hexbus runtime.
 */
export const DEFAULT_ERROR_CATALOG = {
  CANCELLED: {
    code: "CANCELLED",
    message: "Operation cancelled",
  },
  COMMAND_NOT_FOUND: {
    code: "COMMAND_NOT_FOUND",
    hint: "Run --help to see available commands",
    message: "Unknown command",
  },
  CONFIG_NOT_FOUND: {
    code: "CONFIG_NOT_FOUND",
    hint: "Run the setup command to create a configuration",
    message: "Configuration not found",
  },
  FLAG_VALUE_REQUIRED: {
    code: "FLAG_VALUE_REQUIRED",
    message: "Flag requires a value",
  },
  UNKNOWN_ERROR: {
    code: "UNKNOWN_ERROR",
    message: "An unexpected error occurred",
  },
} as const satisfies ErrorCatalog;

let activeCatalog: ErrorCatalog = { ...DEFAULT_ERROR_CATALOG };

/**
 * Adds or replaces entries in the active error catalog.
 *
 * @remarks
 * This mutates process-local catalog state. Product CLIs should call it once
 * during startup before command actions create `CliError` instances.
 *
 * @param entries - Error entries keyed by their stable code.
 *
 * @example
 * ```ts
 * extendErrorCatalog({
 *   PROJECT_NOT_READY: {
 *     code: 'PROJECT_NOT_READY',
 *     message: 'Project is not ready',
 *     hint: 'Run init before running this command.',
 *   },
 * });
 * ```
 */
export function extendErrorCatalog(entries: ErrorCatalog): void {
  activeCatalog = {
    ...activeCatalog,
    ...entries,
  };
}

/**
 * Built-in or product-defined CLI error code.
 */
export type ErrorCode = keyof typeof DEFAULT_ERROR_CATALOG | string;

/**
 * Error type that carries a catalog entry and optional structured context.
 *
 * @remarks
 * `CliError` keeps command code focused on stable error codes while shared
 * handlers render the configured message, hint, and documentation link.
 */
export class CliError extends Error {
  /**
   * Error code requested by the caller.
   */
  readonly code: ErrorCode;
  /**
   * Structured diagnostic details attached by the caller.
   */
  readonly context?: Record<string, unknown>;
  /**
   * Catalog entry used to render this error.
   */
  readonly entry: ErrorCatalogEntry;

  /**
   * Creates a catalog-backed CLI error.
   *
   * @param code - Built-in or product-defined error code.
   * @param context - Optional diagnostic details for rendering or telemetry.
   */
  constructor(code: ErrorCode, context?: Record<string, unknown>) {
    const entry =
      activeCatalog[code] ??
      activeCatalog.UNKNOWN_ERROR ??
      DEFAULT_ERROR_CATALOG.UNKNOWN_ERROR;
    super(entry.message);
    this.name = "CliError";
    this.code = code;
    this.context = context;
    this.entry = entry;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CliError);
    }
  }

  /**
   * Renders the error message, hint, and docs link through a logger.
   *
   * @param logger - Logger used for user-facing output.
   */
  display(logger: CliLogger): void {
    let message = this.entry.message;
    if (this.context?.details) {
      message += `: ${this.context.details}`;
    }

    logger.error(message);

    if (this.entry.hint) {
      logger.info(`Hint: ${this.entry.hint}`);
    }

    if (this.entry.docs) {
      logger.info(`Docs: ${this.entry.docs}`);
    }
  }

  /**
   * Normalizes an unknown thrown value into a `CliError`.
   *
   * @param error - Value caught from a `try`/`catch` block.
   * @param fallbackCode - Catalog code to use when `error` is not already a
   * `CliError`.
   * @returns `error` unchanged when it is already a `CliError`, otherwise a
   * wrapped `CliError`.
   */
  static from(error: unknown, fallbackCode: ErrorCode = "UNKNOWN_ERROR") {
    if (error instanceof CliError) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);
    return new CliError(fallbackCode, {
      details: message,
      originalError: error,
    });
  }
}

/**
 * Narrows an unknown value to a `CliError`.
 *
 * @param error - Value to inspect.
 * @param code - Optional code that must match the error.
 * @returns `true` when the value is a `CliError` and, if provided, matches the
 * requested code.
 */
export function isCliError(
  error: unknown,
  code?: ErrorCode
): error is CliError {
  if (!(error instanceof CliError)) {
    return false;
  }

  if (code) {
    return error.code === code;
  }

  return true;
}

/**
 * Creates shared process-ending error and cancellation handlers.
 *
 * @param logger - Logger used to render messages.
 * @param telemetry - Optional telemetry sink for failed command errors.
 * @returns Error handlers suitable for `CliContext.error`.
 */
export function createErrorHandlers(
  logger: CliLogger,
  telemetry?: { trackError(error: Error, command?: string): void }
) {
  return {
    handleCancel(
      message = "Operation cancelled",
      context?: { command?: string; stage?: string }
    ): never {
      logger.warn(message);

      if (context?.command) {
        logger.info(`Command: ${context.command}`);
      }

      process.exit(0);
    },

    handleError(error: unknown, command: string): never {
      const cliError = CliError.from(error);

      try {
        telemetry?.trackError(cliError, command);
      } catch (telemetryError) {
        const message =
          telemetryError instanceof Error
            ? telemetryError.message
            : String(telemetryError);
        logger.warn(`Failed to track error telemetry: ${message}`);
      }
      cliError.display(logger);
      process.exit(1);
    },
  };
}

/**
 * Wraps an async function with CLI-style error rendering and process exit.
 *
 * @remarks
 * This helper is useful near process entrypoints. Library-style code should
 * usually throw `CliError` and let the caller decide when to exit.
 *
 * @typeParam T - Async function type to preserve.
 * @param fn - Async function to run.
 * @param logger - Logger used to render caught errors.
 * @param context - Optional command metadata shown after an error.
 * @returns A function with the same call signature as `fn`.
 */
export function withErrorHandling<
  T extends (...args: unknown[]) => Promise<unknown>,
>(fn: T, logger: CliLogger, context?: { command?: string }): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      const cliError = CliError.from(error);
      cliError.display(logger);
      if (context?.command) {
        logger.info(`Command: ${context.command}`);
      }
      process.exit(1);
    }
  }) as T;
}
