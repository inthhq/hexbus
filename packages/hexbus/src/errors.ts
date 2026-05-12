import type { CliLogger } from './types';

export interface ErrorCatalogEntry {
	code: string;
	message: string;
	hint?: string;
	docs?: string;
}

export type ErrorCatalog = Record<string, ErrorCatalogEntry>;

export const DEFAULT_ERROR_CATALOG = {
	CONFIG_NOT_FOUND: {
		code: 'CONFIG_NOT_FOUND',
		message: 'Configuration not found',
		hint: 'Run the setup command to create a configuration',
	},
	FLAG_VALUE_REQUIRED: {
		code: 'FLAG_VALUE_REQUIRED',
		message: 'Flag requires a value',
	},
	COMMAND_NOT_FOUND: {
		code: 'COMMAND_NOT_FOUND',
		message: 'Unknown command',
		hint: 'Run --help to see available commands',
	},
	CANCELLED: {
		code: 'CANCELLED',
		message: 'Operation cancelled',
	},
	UNKNOWN_ERROR: {
		code: 'UNKNOWN_ERROR',
		message: 'An unexpected error occurred',
	},
} as const satisfies ErrorCatalog;

let activeCatalog: ErrorCatalog = { ...DEFAULT_ERROR_CATALOG };

export function extendErrorCatalog(entries: ErrorCatalog): void {
	activeCatalog = {
		...activeCatalog,
		...entries,
	};
}

export type ErrorCode = keyof typeof DEFAULT_ERROR_CATALOG | string;

export class CliError extends Error {
	readonly code: ErrorCode;
	readonly context?: Record<string, unknown>;
	readonly entry: ErrorCatalogEntry;

	constructor(code: ErrorCode, context?: Record<string, unknown>) {
		const entry =
			activeCatalog[code] ??
			activeCatalog.UNKNOWN_ERROR ??
			DEFAULT_ERROR_CATALOG.UNKNOWN_ERROR;
		super(entry.message);
		this.name = 'CliError';
		this.code = code;
		this.context = context;
		this.entry = entry;

		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, CliError);
		}
	}

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

	static from(error: unknown, fallbackCode: ErrorCode = 'UNKNOWN_ERROR') {
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

export function createErrorHandlers(
	logger: CliLogger,
	telemetry?: { trackError(error: Error, command?: string): void }
) {
	return {
		handleError(error: unknown, command: string): never {
			const cliError = CliError.from(error);

			try {
				telemetry?.trackError(cliError, command);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				logger.warn(`Failed to track error telemetry: ${message}`);
			}
			cliError.display(logger);
			process.exit(1);
		},

		handleCancel(
			message = 'Operation cancelled',
			context?: { command?: string; stage?: string }
		): never {
			logger.warn(message);

			if (context?.command) {
				logger.info(`Command: ${context.command}`);
			}

			process.exit(0);
		},
	};
}

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
