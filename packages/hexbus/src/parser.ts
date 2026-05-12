import * as p from '@clack/prompts';
import { formatLogMessage } from './logger';
import type { CliCommand, CliFlag, ParsedArgs } from './types';

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

export function formatFlagHelp(flag: CliFlag): string {
	const names = flag.names.join(', ');
	const valueHint = flag.expectsValue ? ' <value>' : '';
	return `  ${names}${valueHint}\t${flag.description}`;
}

export function generateFlagsHelp(): string {
	return globalFlags.map(formatFlagHelp).join('\n');
}

export function hasFlag(
	flags: ParsedArgs['parsedFlags'],
	name: string
): boolean {
	return flags[name] === true;
}

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
