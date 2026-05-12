import * as p from '@clack/prompts';
import color from 'picocolors';
import type { CliLogger, LogLevel } from './types';

export const LOG_LEVELS: LogLevel[] = ['error', 'warn', 'info', 'debug'];
export const validLogLevels = LOG_LEVELS;

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
	error: 0,
	warn: 1,
	info: 2,
	debug: 3,
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
		return '';
	}

	return `\n${args.map((arg) => `  - ${safeStringify(arg)}`).join('\n')}`;
}

export function formatLogMessage(
	logLevel: LogLevel | 'success' | 'failed' | string,
	message: unknown,
	args: unknown[] = []
): string {
	const messageStr = typeof message === 'string' ? message : String(message);
	const formattedArgs = formatArgs(args);

	switch (logLevel) {
		case 'error':
			return `${color.bgRed(color.black(' error '))} ${messageStr}${formattedArgs}`;
		case 'warn':
			return `${color.bgYellow(color.black(' warning '))} ${messageStr}${formattedArgs}`;
		case 'info':
			return `${color.bgGreen(color.black(' info '))} ${messageStr}${formattedArgs}`;
		case 'debug':
			return `${color.bgBlack(color.white(' debug '))} ${messageStr}${formattedArgs}`;
		case 'success':
			return `${color.bgGreen(color.white(' success '))} ${messageStr}${formattedArgs}`;
		case 'failed':
			return `${color.bgRed(color.white(' failed '))} ${messageStr}${formattedArgs}`;
		default:
			return `[${logLevel.toUpperCase()}] ${messageStr}${formattedArgs}`;
	}
}

export function logMessage(
	logLevel: LogLevel | 'success' | 'failed' | string,
	message: unknown,
	...args: unknown[]
): void {
	const formattedMessage = formatLogMessage(logLevel, message, args);

	switch (logLevel) {
		case 'error':
			p.log.error(formattedMessage);
			break;
		case 'warn':
			p.log.warn(formattedMessage);
			break;
		case 'info':
		case 'debug':
			p.log.info(formattedMessage);
			break;
		case 'success':
		case 'failed':
			p.outro(formattedMessage);
			break;
		default:
			p.log.message(formattedMessage);
	}
}

export function formatStep(
	current: number,
	total: number,
	label: string
): string {
	const safeTotal = Math.max(0, total);
	const safeCurrent = Math.min(Math.max(0, current), safeTotal);
	const filled = color.green('█'.repeat(safeCurrent));
	const empty = color.dim('░'.repeat(safeTotal - safeCurrent));
	return `[${filled}${empty}] Step ${safeCurrent}/${safeTotal}: ${label}`;
}

export function createCliLogger(level: LogLevel = 'info'): CliLogger {
	const currentLevelPriority = LOG_LEVEL_PRIORITY[level];
	const shouldLog = (targetLevel: LogLevel) =>
		LOG_LEVEL_PRIORITY[targetLevel] <= currentLevelPriority;

	return {
		debug(message: string, ...args: unknown[]) {
			if (shouldLog('debug')) {
				logMessage('debug', message, ...args);
			}
		},
		info(message: string, ...args: unknown[]) {
			if (shouldLog('info')) {
				logMessage('info', message, ...args);
			}
		},
		warn(message: string, ...args: unknown[]) {
			if (shouldLog('warn')) {
				logMessage('warn', message, ...args);
			}
		},
		error(message: string, ...args: unknown[]) {
			if (shouldLog('error')) {
				logMessage('error', message, ...args);
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
		success(message: string) {
			logMessage('success', message);
		},
		failed(message: string, exitCode = 1): never {
			logMessage('failed', message);
			process.exit(exitCode);
		},
		outro(message: string) {
			p.outro(message);
		},
		step(current: number, total: number, label: string) {
			p.log.step(formatStep(current, total, label));
		},
	};
}

export { color };
