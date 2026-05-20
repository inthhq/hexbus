# @inth/hexbus-codemods

Reusable codemod harness for Inth app CLIs built on Hexbus. This package owns the shared mechanics for collecting files, creating `ts-morph` projects, filtering applicable codemods, running selected migrations, reporting results, and testing transforms with temporary fixtures.

## Table of Contents

- [Key Features](#key-features)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Usage](#usage)
- [Support](#support)
- [License](#license)
- [Core Exports](#core-exports)
- [Version Gating](#version-gating)
- [Testing](#testing)

## Key Features

- Collect source files recursively with configurable extensions, ignored directories, and include predicates.
- Create dry-run-aware `ts-morph` projects for transform authors.
- Define typed codemod metadata with stable IDs, labels, hints, version constraints, and run functions.
- Filter codemods by installed product version before prompting users.
- Run selected codemods independently so one failure does not abort the full migration session.
- Use fixture helpers to write temporary projects, run transforms, assert results, and clean up automatically.

## Prerequisites

- Node.js 18.17.0 or later
- A Hexbus-powered Inth app CLI
- Product-specific codemod definitions supplied by the consuming CLI

## Quick Start

Create codemod definitions in your Inth app CLI, then pass them to the shared runner:

```ts
import {
  defineCodemod,
  runCodemods,
  createCodemodProject,
} from "@inth/hexbus-codemods";

const renameConfig = defineCodemod({
  id: "rename-config",
  label: "Rename config option",
  hint: "Updates old config keys to the new names",
  versioning: { fromRange: "<2.0.0" },
  async run(_context, options) {
    const project = await createCodemodProject(options.projectRoot, {
      dryRun: options.dryRun,
    });

    const changedFiles: string[] = [];
    for (const sourceFile of project.sourceFiles) {
      const before = sourceFile.getFullText();
      sourceFile.replaceWithText(before.replaceAll("oldConfig", "newConfig"));
      if (sourceFile.getFullText() !== before) {
        changedFiles.push(sourceFile.getFilePath());
      }
    }

    await project.save();
    return { changedFiles, errors: [] };
  },
});

await runCodemods(context, [renameConfig], {
  brandName: "my app",
  dryRun: Boolean(context.flags["dry-run"]),
  detectInstalledVersion: async (projectRoot) =>
    readInstalledVersion(projectRoot),
});
```

## Installation

```bash
bun add @inth/hexbus-codemods hexbus
```

```bash
npm install @inth/hexbus-codemods hexbus
```

```bash
pnpm add @inth/hexbus-codemods hexbus
```

## Usage

1. Keep app-specific transforms in the app CLI. This package should only provide the runner and shared mechanics.
2. Use `defineCodemod` to preserve generic context types across codemod arrays.
3. Use `createCodemodProject` inside codemods when you need `ts-morph` source files and a dry-run-aware save method.
4. Return `changedFiles` and `errors` from each codemod so `runCodemods` can produce consistent user-facing output.
5. Use `withTempProject`, `writeFixtureTree`, `readFixtureFile`, and `runAndAssert` for fixture-backed tests.

## Support

- Open an issue in the Hexbus repository for runner bugs or missing shared codemod mechanics.
- Keep transform-specific questions with the Inth app CLI that owns the codemod definitions.

## License

[Apache-2.0](../../LICENSE)

## Core Exports

- Collection: `collectSourceFiles`, `createCodemodProject`, `DEFAULT_IGNORED_DIRS`, `DEFAULT_SUPPORTED_EXTENSIONS`
- Runner: `defineCodemod`, `runCodemods`, `logCodemodResult`
- Versioning: `satisfiesSimpleRange`, `isCodemodApplicableForVersion`
- Testing: `withTempProject`, `writeFixtureTree`, `readFixtureFile`, `runAndAssert`
- Types: `CodemodDefinition`, `CodemodRunOptions`, `CodemodRunResult`, `RunCodemodsOptions`, `CollectOptions`, `CodemodProject`

## Version Gating

Codemods can declare simple version constraints with `fromRange` and `toRange`. Supported comparators are `>`, `>=`, `<`, `<=`, `=`, `^`, and `~`. When the installed version is unknown, codemods are treated as applicable so users can still opt in.

## Testing

Fixture helpers create temporary project directories, write project-relative files, run your callback, and clean up by default.

```ts
import { readFixtureFile, withTempProject } from "@inth/hexbus-codemods";

await withTempProject({ "src/app.ts": "oldConfig();" }, async (projectRoot) => {
  await runMyCodemod(projectRoot);
  const output = await readFixtureFile(projectRoot, "src/app.ts");
  expect(output).toContain("newConfig");
});
```
