#!/usr/bin/env bun

import {
	type CliCommand,
	createCliContext,
	displayIntro,
	globalFlags,
	showHelpMenu,
} from 'hexbus';

const commands: CliCommand[] = [
	{
		name: 'hello',
		label: 'Hello',
		hint: 'Print a greeting',
		description: 'Print a greeting from the example CLI.',
		action: async (context) => {
			context.logger.success('Hello from hexbus.');
		},
	},
];

const context = await createCliContext({
	rawArgs: process.argv.slice(2),
	commands,
	appName: 'minimal-cli',
	configName: 'minimal-cli',
	interactivePackageManagerDetection: false,
});

const version = context.fs.getPackageInfo().version;

if (context.flags.version) {
	context.logger.message(`minimal-cli version ${version}`);
	process.exit(0);
}

if (context.flags.help) {
	showHelpMenu(
		context,
		{ appName: 'minimal-cli', version },
		commands,
		globalFlags
	);
	process.exit(0);
}

await displayIntro(context, {
	appName: 'minimal-cli',
	version,
	tagline: 'A tiny CLI built with hexbus.',
});

const command = commands.find((item) => item.name === context.commandName);

if (command) {
	await command.action(context);
} else {
	showHelpMenu(
		context,
		{ appName: 'minimal-cli', version },
		commands,
		globalFlags
	);
}
