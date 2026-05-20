# hexbus

Opinionated CLI framework for Inth apps. `hexbus` gives Inth app CLIs a small, typed foundation for parsing flags, creating execution context, rendering help, reporting errors, logging progress, detecting projects, and showing update hints.

## Table of Contents

- [Key Features](#key-features)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Usage](#usage)
- [Global Flags](#global-flags)
- [Support](#support)
- [License](#license)
- [Core Exports](#core-exports)
- [Context Shape](#context-shape)
- [Command Args](#command-args)
- [Route Metadata And Compatibility](#route-metadata-and-compatibility)
- [Update Checks](#update-checks)

## Key Features

- Typed `CliContext` creation with command metadata, parsed flags, project root, package manager detection, framework detection, file-system helpers, config loading, telemetry, and confirmation prompts.
- Shared global parser plus command-local argument specs with inherited group args, reusable option groups, passthrough parsing, typed coercion, and config-backed defaults.
- Command-local help rendering for global flags, inherited flags, leaf flags, positionals, defaults, and route docs.
- Consistent logger, spinner, intro, help, and error rendering built on top of `@clack/prompts`.
- Deprecated command and flag aliases, route metadata, output-mode conventions, and static shell completion generation.
- Configurable error catalog and best-effort telemetry hooks that Inth app CLIs can extend or disable.
- Project, framework, package manager, install source, and registry update helpers for better CLI guidance.
- Test helpers for creating lightweight contexts and exercising command routing without standing up a full CLI invocation.

## Prerequisites

- Node.js 18.17.0 or later
- A TypeScript ESM project
- Bun, npm, pnpm, or yarn in the consuming project

## Quick Start

Define command metadata, create a context from `process.argv`, then route to the selected command:

```ts
import {
	createCliContext,
	showHelpMenu,
	globalFlags,
	type CliCommand,
} from 'hexbus';

const commands: CliCommand[] = [
	{
		name: 'init',
		label: 'Initialize',
		hint: 'Create project files',
		description: 'Initialize project files.',
		async action(context) {
			context.logger.info(`Project root: ${context.projectRoot}`);
		},
	},
];

const context = await createCliContext({
	rawArgs: process.argv.slice(2),
	commands,
	appName: 'my-cli',
});

if (context.flags.help) {
	showHelpMenu(context, { appName: 'my-cli', version: '0.1.0' }, commands, globalFlags);
	process.exit(0);
}

const command = commands.find((item) => item.name === context.commandName) ?? commands[0];
await command.action(context);
```

## Installation

```bash
bun add hexbus
```
```bash
npm install hexbus
```
```bash
pnpm add hexbus
```

## Usage

1. Use `parseCliArgs` when you only need normalized command names, command args, and global flags.
2. Use `defineCommandArgs`, `mergeCommandArgs`, and `parseCommandArgs` for command-local flags, inherited group options, typed values, defaults, and passthrough args after `--`.
3. Use `createCliContext` when command execution needs the full runtime context.
4. Use `generateCompletion` to emit static `bash`, `zsh`, or `fish` completions from the command tree.
5. Use `outputModeArgs` and `parseOutputMode` when a command needs consistent human, JSON, or quiet output behavior.
6. Use `runCliTest` for fast command dispatch tests before adding shell-heavy e2e coverage.
7. Use `CliError`, `extendErrorCatalog`, and `withErrorHandling` to keep app-specific failures consistent with shared CLI output.
8. Use `displayIntro`, `showHelpMenu`, `createSpinner`, and `createCliLogger` for consistent terminal UX.
9. Use `isVersionRequest`, `printVersionInfo`, and `startBackgroundUpdateCheck` for fast `-v` / `--version` handling and install-source-aware update hints.

## Global Flags

- `--help, -h`: Show the CLI help menu.
- `--version, -v`: Show the CLI version.
- `--logger <level>`: Set log level to `error`, `warn`, `info`, or `debug`.
- `--color / --no-color`: Force or disable color output.
- `--config <path>`: Specify a configuration file path.
- `-y, --yes`: Skip confirmation prompts.
- `--no-telemetry`: Disable telemetry data collection.
- `--telemetry-debug`: Log telemetry payloads through the debug channel.
- `--force`: Force an operation even if files exist.

## Support

- Open an issue in the Hexbus repository for bugs or API questions.
- See `examples/minimal-cli` for a runnable reference CLI.

## License

[Apache-2.0](../../LICENSE)

## Core Exports

- Context: `createCliContext`, `createTestContext`, `CreateContextOptions`
- Parser: `parseCliArgs`, `parseSubcommand`, `defineCommandArgs`, `mergeCommandArgs`, `parseCommandArgs`, `hasFlag`, `getFlagValue`, `globalFlags`
- Command tree: `resolveCommandArgScopes`, `getCommandArgFlagNames`, `commandArgsAcceptFlag`
- Terminal UX: `createCliLogger`, `createSpinner`, `withSpinner`, `displayIntro`, `showHelpMenu`
- Output: `outputModeArgs`, `parseOutputMode`, `shouldRenderHumanProgress`, `shouldRenderJson`
- Completions: `generateCompletion`
- Tests: `runCliTest`
- Errors: `CliError`, `createErrorHandlers`, `extendErrorCatalog`, `withErrorHandling`
- Detection: `detectProjectRoot`, `detectPackageManager`, `detectFramework`, `getInstallCommand`, `getRunCommand`, `getExecCommand`
- Telemetry: `createTelemetry`, `createDisabledTelemetry`, `TelemetryEventName`
- Updates: `isVersionRequest`, `printVersionInfo`, `checkForUpdate`, `startBackgroundUpdateCheck`, `formatUpdateHint`

## Context Shape

`createCliContext` resolves the common services command actions usually need: logger, parsed flags, command args, project root, framework metadata, package manager commands, config helpers, file-system helpers, telemetry, confirmation prompts, and shared error handlers.

Inth app CLIs can extend the generic context type when they attach additional services before invoking command actions.

## Command Args

`CliCommand` can declare `args` for leaf command behavior and `inheritedArgs` for command-family behavior. `runCli` uses this metadata for scoped help, route-aware option checks, docs, and completions, while command actions still call `parseCommandArgs(context.commandArgs, spec)` when they need parsed values.

`parseCommandArgs` runtime `defaults` are execution values only. If help or plan output needs to explain where a default came from, put that label on the arg spec with `defaultDescription`; products can still pass the resolved runtime value separately through `defaults`.

```ts
import { defineCommandArgs, mergeCommandArgs, parseCommandArgs } from 'hexbus';

const projectArgs = defineCommandArgs({
  flags: {
    projectId: { names: ['--project-id'], type: 'string', valueName: 'id' },
  },
} as const);

const runArgs = mergeCommandArgs(projectArgs, {
  flags: {
    concurrency: {
      names: ['--concurrency'],
      type: 'integer',
      min: 1,
      defaultDescription: 'from amberline.config.ts',
    },
    timeout: { names: ['--timeout'], type: 'duration' },
  },
} as const);

const parsed = parseCommandArgs(context.commandArgs, runArgs, {
  defaults: {
    concurrency: { value: 4, source: 'amberline.config.ts' },
  },
  passthrough: true,
});
```

## Route Metadata And Compatibility

Commands can declare `aliases`, `category`, `stability`, `telemetryName`, and `docsUrl`. Deprecated command aliases warn when routed, and deprecated flag aliases can report warnings through `parseCommandArgs` without writing directly to stdout.

## Update Checks

`hexbus` supports fast version requests before full context creation. Use `isVersionRequest` and `printVersionInfo` for `-v` / `--version`, then call `startBackgroundUpdateCheck` during normal command execution to show cached update hints and refresh stale registry data in the background.
