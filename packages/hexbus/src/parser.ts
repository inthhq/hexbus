import * as p from '@clack/prompts';
import { formatLogMessage } from './logger';
import type { CliCommand, CliFlag, ParsedArgs } from './types';

/**
 * Built-in flags parsed for every Hexbus CLI invocation.
 *
 * @remarks
 * Primary flag names are derived from the first long flag in each entry. For
 * example, `--no-telemetry` is exposed as `parsedFlags['no-telemetry']`.
 */
export const globalFlags: CliFlag[] = [
	{
		names: ['--help', '-h'],
		description: 'Show this help message',
		type: 'special',
		expectsValue: false,
	},
	{
		names: ['--version', '-v'],
		description: 'Show the CLI version',
		type: 'special',
		expectsValue: false,
	},
	{
		names: ['--logger'],
		description: 'Set log level (error, warn, info, debug)',
		type: 'string',
		expectsValue: true,
		defaultValue: 'info',
	},
	{
		names: ['--color'],
		description: 'Force color output',
		type: 'boolean',
		expectsValue: false,
		defaultValue: false,
	},
	{
		names: ['--no-color'],
		description: 'Disable color output',
		type: 'boolean',
		expectsValue: false,
		defaultValue: false,
	},
	{
		names: ['--config'],
		description: 'Specify path to configuration file',
		type: 'string',
		expectsValue: true,
	},
	{
		names: ['-y', '--yes'],
		description: 'Skip confirmation prompts',
		type: 'boolean',
		expectsValue: false,
		defaultValue: false,
	},
	{
		names: ['--no-telemetry'],
		description: 'Disable telemetry data collection',
		type: 'boolean',
		expectsValue: false,
		defaultValue: false,
	},
	{
		names: ['--telemetry-debug'],
		description: 'Enable debug mode for telemetry',
		type: 'boolean',
		expectsValue: false,
		defaultValue: false,
	},
	{
		names: ['--force'],
		description: 'Force operation even if files exist',
		type: 'boolean',
		expectsValue: false,
		defaultValue: false,
	},
];

function getPrimaryFlagName(flag: CliFlag): string {
	const longName = flag.names.find((name) => name.startsWith('--'));
	const fallback = flag.names.reduce(
		(longest, name) => (name.length > longest.length ? name : longest),
		''
	);
	const chosen = longName ?? fallback;
	return chosen.replace(/^--?/, '');
}

/**
 * Parses raw command-line arguments into command name, command args, and
 * global flags.
 *
 * @remarks
 * Only flags declared in `globalFlags` are parsed. Unknown flags and
 * positional arguments are preserved as command arguments unless the first
 * positional argument matches a registered top-level command.
 *
 * @param rawArgs - Arguments after the executable and script path.
 * @param commands - Top-level commands used to identify the command name.
 * @returns Normalized parsed arguments for context creation or custom routing.
 *
 * @example
 * ```ts
 * const parsed = parseCliArgs(['init', '--logger', 'debug'], commands);
 * // parsed.commandName === 'init'
 * // parsed.parsedFlags.logger === 'debug'
 * ```
 */
export function parseCliArgs(
	rawArgs: string[],
	commands: CliCommand[]
): ParsedArgs {
	const parsedFlags: Record<string, string | boolean | undefined> = {};
	const potentialCommandArgs: string[] = [];
	let commandName: string | undefined;
	const commandArgs: string[] = [];

	for (const flag of globalFlags) {
		const primaryName = getPrimaryFlagName(flag);
		if (!primaryName) {
			continue;
		}

		if (flag.type === 'boolean') {
			parsedFlags[primaryName] = flag.defaultValue ?? false;
		} else {
			parsedFlags[primaryName] = flag.defaultValue;
		}
	}

	for (let i = 0; i < rawArgs.length; i++) {
		const arg = rawArgs[i];
		if (typeof arg !== 'string') {
			continue;
		}

		let isFlag = false;

		for (const flag of globalFlags) {
			if (!flag.names.includes(arg)) {
				continue;
			}

			const primaryName = getPrimaryFlagName(flag);
			if (!primaryName) {
				continue;
			}

			isFlag = true;

			if (flag.type === 'boolean') {
				parsedFlags[primaryName] = true;
			} else if (flag.expectsValue) {
				const nextArg = rawArgs[i + 1];
				if (nextArg && !nextArg.startsWith('-')) {
					parsedFlags[primaryName] = nextArg;
					i++;
				} else {
					p.log.warn(
						formatLogMessage(
							'warn',
							`Flag ${arg} expects a value, but none was provided`
						)
					);
				}
			} else {
				parsedFlags[primaryName] = true;
			}
			break;
		}

		if (!isFlag) {
			potentialCommandArgs.push(arg);
		}
	}

	const firstPositional = potentialCommandArgs[0];
	if (
		typeof firstPositional === 'string' &&
		commands.some((cmd) => cmd.name === firstPositional)
	) {
		commandName = firstPositional;
		commandArgs.push(...potentialCommandArgs.slice(1));
	} else {
		commandArgs.push(...potentialCommandArgs);
	}

	return { commandName, commandArgs, parsedFlags };
}

/**
 * Formats a single flag for display in help output.
 *
 * @param flag - Flag definition to render.
 * @returns A help row containing names, value hint, and description.
 */
export function formatFlagHelp(flag: CliFlag): string {
	const names = flag.names.join(', ');
	const valueHint = flag.expectsValue ? ' <value>' : '';
	return `  ${names}${valueHint}\t${flag.description}`;
}

/**
 * Formats all built-in global flags for help output.
 *
 * @returns Newline-delimited help rows for `globalFlags`.
 */
export function generateFlagsHelp(): string {
	return globalFlags.map(formatFlagHelp).join('\n');
}

/**
 * Checks whether a parsed boolean flag is enabled.
 *
 * @param flags - Parsed flag map from `parseCliArgs` or `CliContext`.
 * @param name - Primary flag name without leading dashes.
 * @returns `true` only when the flag value is exactly `true`.
 *
 * @example
 * ```ts
 * if (hasFlag(context.flags, 'force')) {
 *   // overwrite existing files
 * }
 * ```
 */
export function hasFlag(
	flags: ParsedArgs['parsedFlags'],
	name: string
): boolean {
	return flags[name] === true;
}

/**
 * Reads a string-valued flag from a parsed flag map.
 *
 * @param flags - Parsed flag map from `parseCliArgs` or `CliContext`.
 * @param name - Primary flag name without leading dashes.
 * @returns The flag value when it is a string, otherwise `undefined`.
 */
export function getFlagValue(
	flags: ParsedArgs['parsedFlags'],
	name: string
): string | undefined {
	const value = flags[name];
	if (typeof value === 'string') {
		return value;
	}
	return undefined;
}

/**
 * Splits command arguments into an optional nested subcommand and remaining
 * args.
 *
 * @param args - Positional command arguments to inspect.
 * @param subcommands - Available subcommands for the current command.
 * @returns The matched subcommand, if any, plus arguments after the subcommand
 * name.
 *
 * @example
 * ```ts
 * const { subcommand, remainingArgs } = parseSubcommand(
 *   context.commandArgs,
 *   command.subcommands ?? []
 * );
 * ```
 */
export function parseSubcommand(
	args: string[],
	subcommands: CliCommand[]
): { subcommand: CliCommand | undefined; remainingArgs: string[] } {
	const subcommandName = args[0];
	const subcommand = subcommands.find((cmd) => cmd.name === subcommandName);

	if (subcommand) {
		return {
			subcommand,
			remainingArgs: args.slice(1),
		};
	}

	return {
		subcommand: undefined,
		remainingArgs: args,
	};
}
