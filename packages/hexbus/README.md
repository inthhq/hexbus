# hexbus

Opinionated CLI framework for Inth apps. `hexbus` gives Inth app CLIs a small, typed foundation for parsing flags, creating execution context, rendering help, reporting errors, logging progress, detecting projects, and showing update hints.

## Table of Contents

- [Key Features](#key-features)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Usage](#usage)
- [Dispatch And Selection](#dispatch-and-selection)
- [Interactive Prompts](#interactive-prompts)
- [Command Trees](#command-trees)
- [Command-Local Args](#command-local-args)
- [Global Flags](#global-flags)
- [Support](#support)
- [License](#license)
- [Core Exports](#core-exports)
- [Context Shape](#context-shape)
- [Update Checks](#update-checks)

## Key Features

- `runCli` lifecycle runner for package metadata, version output, context creation, update hints, help, intro, command dispatch, hooks, telemetry flush, and shutdown.
- Shared `dispatchCommand`, `resolveCommandRoute`, and `selectCommand` helpers for command lookup, command-tree routing, unknown command handling, no-command behavior, and interactive command menus.
- Typed `CliContext` creation with command metadata, parsed flags, project root, package manager detection, framework detection, file-system helpers, config loading, telemetry, and confirmation prompts.
- Shared argument parser and global flags for help, version, logging, color, config, confirmation, telemetry, and force behavior.
- Command-local argument parsing for validated per-command flags, defaults, aliases, negated booleans, and positionals.
- Consistent logger, prompt helpers, spinner, intro, help, color, figlet, and error rendering built on Hexbus' pinned terminal UX dependencies.
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
2. Use `dispatchCommand`, `resolveCommandRoute`, or `selectCommand` when the entrypoint owns lifecycle details but should not reimplement command lookup, command-tree routing, unknown-command handling, no-command behavior, or interactive selection.
3. Use `parseCommandArgs` inside command actions when you need command-local flags, defaults, and positional validation from `context.commandArgs`.
4. Use `parseCliArgs` when you only need normalized command names, command args, and global flags.
5. Use `createCliContext` when command execution needs the full runtime context but the entrypoint owns routing.
6. Use `CliError`, `extendErrorCatalog`, and `withErrorHandling` to keep app-specific failures consistent with shared CLI output.
7. Use `displayIntro`, `showHelpMenu`, `promptSelect`, `promptMultiselect`, `promptText`, `promptConfirm`, `createSpinner`, `createCliLogger`, `color`, and `renderFiglet` for consistent terminal UX without adding duplicate terminal dependencies.
8. Use `isVersionRequest`, `printVersionInfo`, and `startBackgroundUpdateCheck` directly when a CLI needs custom version or update-check flow.

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

## Interactive Prompts

Hexbus exposes a small prompt API backed by the `@clack/prompts` version pinned inside `hexbus`. Product CLIs can use these helpers without depending on Clack directly, which keeps prompt behavior and cancellation handling consistent in one process.

```ts
import { promptMultiselect, promptText } from "hexbus";

const projectName = await promptText({
  message: "Project name",
  stage: "onboarding.name",
  telemetry: context.telemetry,
});

const features = await promptMultiselect({
  cancel: "silent",
  message: "Choose features",
  options: [
    { label: "Authentication", value: "auth" },
    { label: "Billing", value: "billing" },
  ],
  stage: "onboarding.features",
  telemetry: context.telemetry,
});

if (!features) {
  context.error.handleCancel("Setup cancelled");
}
```

The public prompt helpers are `promptSelect`, `promptMultiselect`, `promptText`, and `promptConfirm`. By default, cancelling a prompt throws `CliError("CANCELLED")`; pass `cancel: "silent"` to receive `undefined` and handle cancellation yourself. Each helper accepts optional `stage` and `telemetry` fields; when telemetry is enabled, Hexbus emits a `prompt_interaction` event with the prompt kind, stage, and `submitted` or `cancelled` outcome.

`promptConfirm` always renders a prompt. Use `context.confirm(message)` inside command actions when `-y` or `--yes` should auto-confirm. For long-running work, continue to use `createSpinner` or `withSpinner`; those are the supported spinner wrappers.

Prompt behavior is part of the Hexbus public API and follows Hexbus semver. Consumers migrating from direct Clack imports should replace `@clack/prompts` usage with these helpers and remove Clack from their own dependencies unless they need unsupported primitives.

## Command Trees

Commands can declare nested `subcommands`. `dispatchCommand` and `runCli` resolve the deepest matching route and pass the leaf action a context whose `commandArgs` only contain the remaining args after the command path.

```ts
import { runCli, type CliCommand } from "hexbus";

const commands: CliCommand[] = [
  {
    name: "self-host",
    label: "Self-host",
    hint: "Manage self-hosted installs",
    description: "Manage self-hosted installs.",
    subcommands: [
      {
        name: "migrate",
        label: "Migrate",
        hint: "Run migrations",
        description: "Run self-hosted migrations.",
        async action(context) {
          context.logger.info(
            `Remaining args: ${context.commandArgs.join(",")}`
          );
        },
      },
    ],
  },
];

await runCli({ appName: "my-cli", commands, packageInfo });
```

For `my-cli self-host migrate prod`, the `migrate` action receives `["prod"]`. For `my-cli self-host --help` or `my-cli self-host missing`, help is scoped to the `self-host` subcommands. Hidden subcommands still resolve when invoked directly but are excluded from help and interactive menus by default.

## Command-Local Args

`parseCliArgs` and `createCliContext` handle global flags and top-level command routing. Command actions can use `parseCommandArgs` for their own local flags and positionals after dispatch has selected a flat command or command-tree leaf.

```ts
import { parseCommandArgs } from "hexbus";

const args = parseCommandArgs(context.commandArgs, {
  positionals: [{ name: "name", required: true }],
  flags: {
    dev: { names: ["-D", "--dev"], type: "boolean", defaultValue: false },
    git: { names: ["--git"], type: "string", valueName: "url" },
    ref: { names: ["--ref"], type: "string", valueName: "ref" },
    save: {
      names: ["--save"],
      type: "boolean",
      defaultValue: true,
      negatedName: "--no-save",
    },
  },
});

context.logger.info(`Adding ${args.positionals.name}`);
```

The helper throws `CliError` for missing values, unknown options, missing required positionals, and unexpected extra positionals.

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
- Dispatch: `dispatchCommand`, `resolveCommandRoute`, `selectCommand`, `findCommand`, `CommandRoute`, `DispatchCommandResult`, `SelectCommandResult`
- Context: `createCliContext`, `createTestContext`, `CreateContextOptions`
- Parser: `parseCliArgs`, `parseCommandArgs`, `parseSubcommand`, `hasFlag`, `getFlagValue`, `globalFlags`
- Terminal UX: `createCliLogger`, `color`, `createColors`, `renderFiglet`, `figlet`, `promptSelect`, `promptMultiselect`, `promptText`, `promptConfirm`, `createPromptToolkit`, `createSpinner`, `withSpinner`, `displayIntro`, `showHelpMenu`
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
