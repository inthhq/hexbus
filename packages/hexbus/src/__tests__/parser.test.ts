import { describe, expect, it } from 'vitest';
import {
	getFlagValue,
	hasFlag,
	parseCliArgs,
	parseSubcommand,
} from '../parser';
import type { CliCommand } from '../types';

const commands: CliCommand[] = [
	{
		name: 'setup',
		label: 'Setup',
		hint: 'Set up the project',
		description: 'Set up the project',
		action: async () => {},
	},
];

describe('parseCliArgs', () => {
	it('parses commands, flags, and command args', () => {
		const parsed = parseCliArgs(
			['setup', '--logger', 'debug', '--force', 'extra'],
			commands
		);

		expect(parsed.commandName).toBe('setup');
		expect(parsed.commandArgs).toEqual(['extra']);
		expect(getFlagValue(parsed.parsedFlags, 'logger')).toBe('debug');
		expect(hasFlag(parsed.parsedFlags, 'force')).toBe(true);
	});

	it('parses subcommands', () => {
		const result = parseSubcommand(
			['list', '--json'],
			[
				{
					name: 'list',
					label: 'List',
					hint: 'List items',
					description: 'List items',
					action: async () => {},
				},
			]
		);

		expect(result.subcommand?.name).toBe('list');
		expect(result.remainingArgs).toEqual(['--json']);
	});
});
