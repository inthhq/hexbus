#!/usr/bin/env bun

import { readFileSync } from 'node:fs';
import {
	type CliCommand,
	createCliContext,
	displayIntro,
	globalFlags,
	isVersionRequest,
	printVersionInfo,
	showHelpMenu,
	startBackgroundUpdateCheck,
} from 'hexbus';

interface PackageInfo {
	name: string;
	version: string;
}

function readOwnPackageInfo(): PackageInfo {
	const packageJsonUrl = new URL('../package.json', import.meta.url);
	const content = readFileSync(packageJsonUrl, 'utf-8');
	const parsed = JSON.parse(content) as Partial<PackageInfo>;
	return {
		name: parsed.name ?? 'minimal-cli',
		version: parsed.version ?? 'unknown',
	};
}

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

const rawArgs = process.argv.slice(2);
const packageInfo = readOwnPackageInfo();
const version = packageInfo.version;

if (isVersionRequest(rawArgs)) {
	await printVersionInfo({
		appName: 'minimal-cli',
		packageName: packageInfo.name,
		currentVersion: version,
	});
	process.exit(0);
}

const context = await createCliContext({
	rawArgs,
	commands,
	appName: 'minimal-cli',
	configName: 'minimal-cli',
	interactivePackageManagerDetection: false,
});

startBackgroundUpdateCheck({
	appName: 'minimal-cli',
	packageName: packageInfo.name,
	currentVersion: version,
	logger: context.logger,
});

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
