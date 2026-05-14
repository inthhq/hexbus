# hexbus

Opinionated CLI framework for Inth apps. `hexbus` gives Inth app CLIs a small, typed foundation for parsing flags, creating execution context, rendering help, reporting errors, logging progress, detecting projects, and showing update hints.

## Table of Contents

- [Key Features](#key-features)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Usage](#usage)
- [Dispatch And Selection](#dispatch-and-selection)
- [Global Flags](#global-flags)
- [Support](#support)
- [License](#license)
- [Core Exports](#core-exports)
- [Context Shape](#context-shape)
- [Update Checks](#update-checks)

## Key Features

- `runCli` lifecycle runner for package metadata, version output, context creation, update hints, help, intro, command dispatch, hooks, telemetry flush, and shutdown.
- Shared `dispatchCommand` and `selectCommand` helpers for command lookup, unknown command handling, no-command behavior, and interactive command menus.
- Typed `CliContext` creation with command metadata, parsed flags, project root, package manager detection, framework detection, file-system helpers, config loading, telemetry, and confirmation prompts.
- Shared argument parser and global flags for help, version, logging, color, config, confirmation, telemetry, and force behavior.
- Consistent logger, spinner, intro, help, and error rendering built on top of `@clack/prompts`.
- Configurable error catalog and best-effort telemetry hooks that Inth app CLIs can extend or disable.
- Project, framework, package manager, install source, and registry update helpers for better CLI guidance.
- Test helpers for creating lightweight contexts without standing up a full CLI invocation.

## Prerequisites

- Node.js 18.17.0 or later
- A TypeScript ESM project
- Bun, npm, pnpm, or yarn in the consuming project

## Quick Start

Define command metadata, then let `runCli` own the standard invocation lifecycle:

```ts
import { runCli, type CliCommand } from "hexbus";

const commands: CliCommand[] = [
  {
    name: "init",
    label: "Initialize",
    hint: "Create project files",
    description: "Initialize project files.",
    async action(context) {
      context.logger.info(`Project root: ${context.projectRoot}`);
    },
  },
];

await runCli({
  appName: "my-cli",
  commands,
  packageInfo: {
    name: "@acme/my-cli",
    version: "0.1.0",
  },
  context: {
    configName: "my-cli",
  },
  intro: {
    tagline: "Project automation for Acme apps.",
  },
  help: {
    docsUrl: "https://docs.example.com/my-cli",
  },
  noCommand: {
    mode: "interactive",
  },
});
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

1. Use `runCli` when a product CLI wants the standard lifecycle: `--version`, context creation, update hints, help, intro, command dispatch, hooks, telemetry shutdown, and error handling.
2. Use `dispatchCommand` or `selectCommand` when the entrypoint owns lifecycle details but should not reimplement command lookup, unknown-command handling, no-command behavior, or interactive selection.
3. Use `parseCliArgs` when you only need normalized command names, command args, and global flags.
4. Use `createCliContext` when command execution needs the full runtime context but the entrypoint owns routing.
5. Use `CliError`, `extendErrorCatalog`, and `withErrorHandling` to keep app-specific failures consistent with shared CLI output.
6. Use `displayIntro`, `showHelpMenu`, `createSpinner`, and `createCliLogger` for consistent terminal UX.
7. Use `isVersionRequest`, `printVersionInfo`, and `startBackgroundUpdateCheck` directly when a CLI needs custom version or update-check flow.

## Dispatch And Selection

`dispatchCommand` takes a parsed `CliContext` plus an explicit command table and returns a typed result. Direct command dispatch includes hidden commands by default, while interactive selection excludes hidden commands unless configured otherwise.

```ts
import { dispatchCommand, showHelpMenu } from "hexbus";

await dispatchCommand(context, commands, {
  noCommand: {
    mode: "help",
    action: ({ context }) =>
      showHelpMenu(context, { appName: "my-cli", version }, commands, flags),
  },
  unknownCommand: {
    action: ({ commandName, context }) => {
      context.logger.warn(`Unknown command: ${commandName}`);
      showHelpMenu(context, { appName: "my-cli", version }, commands, flags);
    },
  },
});
```

Use `selectCommand` directly when you only need the interactive menu primitive. It returns `selected`, `cancelled`, or `exited` so callers can choose whether to continue, render help, or call their own cancellation handler.

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

- Runner: `runCli`, `RunCliOptions`, `RunCliHooks`, `RunCliNoCommandBehavior`
- Dispatch: `dispatchCommand`, `selectCommand`, `findCommand`, `DispatchCommandResult`, `SelectCommandResult`
- Context: `createCliContext`, `createTestContext`, `CreateContextOptions`
- Parser: `parseCliArgs`, `parseSubcommand`, `hasFlag`, `getFlagValue`, `globalFlags`
- Terminal UX: `createCliLogger`, `createSpinner`, `withSpinner`, `displayIntro`, `showHelpMenu`
- Errors: `CliError`, `createErrorHandlers`, `extendErrorCatalog`, `withErrorHandling`
- Detection: `detectProjectRoot`, `detectPackageManager`, `detectFramework`, `getInstallCommand`, `getRunCommand`, `getExecCommand`
- Telemetry: `createTelemetry`, `createDisabledTelemetry`, `TelemetryEventName`
- Updates: `isVersionRequest`, `printVersionInfo`, `checkForUpdate`, `startBackgroundUpdateCheck`, `formatUpdateHint`

## Context Shape

`createCliContext` resolves the common services command actions usually need: logger, parsed flags, command args, project root, framework metadata, package manager commands, config helpers, file-system helpers, telemetry, confirmation prompts, and shared error handlers.

Inth app CLIs can extend the generic context type when they attach additional services before invoking command actions.

## Update Checks

`runCli` handles fast version requests before full context creation and starts background update checks during normal execution by default. Pass `updateCheck: false` to skip the background check, or provide update-check options such as `brewFormula`, `registryUrl`, or `cacheTtlMs`.

Use `isVersionRequest`, `printVersionInfo`, and `startBackgroundUpdateCheck` directly when a CLI needs bespoke update behavior outside the shared runner.
