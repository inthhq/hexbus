# Hexbus

Opinionated CLI framework packages for Inth apps. The monorepo keeps Inth app CLIs focused on app behavior while sharing the command-line framework, codemod runner, and agent skill installer glue.

## Table of Contents

- [Key Features](#key-features)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Usage](#usage)
- [Available Commands](#available-commands)
- [Contributing](#contributing)
- [License](#license)
- [Packages](#packages)
- [Example](#example)
- [Release Workflow](#release-workflow)
- [Design Goals](#design-goals)

## Key Features

- `hexbus` provides typed CLI context, argument parsing, logging, prompts, help output, error handling, telemetry hooks, project detection, and update hints.
- `@inth/hexbus-codemods` provides a reusable `ts-morph` codemod harness with dry-run support, version gating, and fixture helpers.
- `@inth/hexbus-skills` wraps the external `skills` CLI so Inth app CLIs can install agent skill bundles through the caller's package manager.
- Bun-first workspace scripts delegate through Turbo while package-specific tasks live in each package.
- Packages stay product-agnostic so downstream CLIs can compose shared mechanics without inheriting product copy or dependencies.

## Prerequisites

- Node.js 18.17.0 or later
- Bun 1.3.11 or later
- Git, for Changesets and workspace development

## Quick Start

Install dependencies, then run the normal verification tasks from the workspace root:

```bash
bun install
bun run build
bun run test
bun run check-types
```

Try the minimal example CLI when you want to see the `hexbus` chassis in motion:

```bash
bun --cwd examples/minimal-cli run dev --help
```

## Installation

```bash
bun install
```

## Usage

1. Use the root scripts for workspace-wide checks. They delegate to Turbo and run the matching package scripts.

```bash
bun run build
bun run lint
bun run test
bun run check-types
```

2. Work inside a package when you need package-specific development commands.

```bash
bun --cwd packages/hexbus run dev
bun --cwd packages/codemods run test
bun --cwd packages/skills run lint
```

3. Publishable changes should include a Changeset before release.

```bash
bun run changeset
```

## Available Commands

- `bun run build`: Build every workspace package through Turbo.
- `bun run test`: Run package test suites through Turbo.
- `bun run check-types`: Run TypeScript type checks across the workspace.
- `bun run lint`: Run package lint tasks.
- `bun run fmt`: Format and fix supported files with each package's formatter task.
- `bun run changeset`: Create a release note for publishable package changes.

## Contributing

- Use Bun for installs, scripts, tests, and one-off TypeScript execution.
- Keep root scripts as `turbo run` delegators.
- Put package-specific task logic in each package's `package.json`.
- Add or update tests for behavior changes.

## License

[Apache-2.0](LICENSE)

## Packages

- [`hexbus`](packages/hexbus): opinionated CLI framework primitives for Inth apps.
- [`@inth/hexbus-codemods`](packages/codemods): reusable codemod runner and test utilities.
- [`@inth/hexbus-skills`](packages/skills): small skill installer helper for invoking `skills add`.

## Example

The `examples/minimal-cli` package demonstrates a tiny CLI built on top of `hexbus`.

```bash
bun --cwd examples/minimal-cli run dev --help
```

## Release Workflow

This repo uses Changesets for package versions and release notes.

```bash
bun run changeset
bun run version
bun run release
```

Run verification before publishing:

```bash
bun run build
bun run test
bun run check-types
```

## Design Goals

- Keep Inth app CLIs responsible for app-specific commands, constants, auth, control-plane calls, and transforms.
- Keep shared Hexbus packages free of app-specific imports and copy.
- Prefer small explicit APIs over broad abstractions.
- Make package behavior easy to test in isolation.
