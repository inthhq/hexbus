# @inth/hexbus-skills

Small helper package for installing agent skills from Hexbus-powered Inth app CLIs. It delegates to the external `skills` CLI through the caller's package manager and gives Inth app CLIs consistent logging, success callbacks, failure callbacks, and manual fallback instructions.

## Table of Contents

- [Key Features](#key-features)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Installation](#installation)
- [Usage](#usage)
- [Support](#support)
- [License](#license)
- [Runner Commands](#runner-commands)
- [Failure Behavior](#failure-behavior)
- [Skill Ownership](#skill-ownership)

## Key Features

- Resolve one-off runner commands for Bun, npm, pnpm, and Yarn.
- Spawn `skills add <ref>` with inherited stdio so users can interact with the installer directly.
- Log the exact install command before execution.
- Report successful installs through either `logger.success` or `logger.info`.
- Handle non-zero exits and spawn failures without throwing, then route failures to an optional callback.
- Keep skill content out of the package; consumers provide the skill reference to install.

## Prerequisites

- Node.js 18.17.0 or later
- A CLI that wants to install an agent skill bundle
- Network/package-manager access to run the external `skills` CLI

## Quick Start

Call `installSkills` from your Inth app CLI command and pass the package manager detected by your CLI context:

```ts
import { installSkills } from "@inth/hexbus-skills";

await installSkills({
  skillRef: "my-org/app-skills",
  packageManager: context.packageManager.name,
  cwd: context.projectRoot,
  logger: context.logger,
  onSuccess: () => context.telemetry.trackEvent("skills_installed"),
  onFailure: (error) =>
    context.telemetry.trackError(
      error instanceof Error ? error : new Error(String(error))
    ),
});
```

## Installation

```bash
bun add @inth/hexbus-skills
```

```bash
npm install @inth/hexbus-skills
```

```bash
pnpm add @inth/hexbus-skills
```

## Usage

1. Use `getSkillsRunnerCommand` when you only need to show or compose the package-manager-specific runner command.
2. Use `installSkills` when your CLI should execute `skills add <skillRef>` for the user.
3. Pass `cwd` when the install should run from the detected project root rather than the current process directory.
4. Pass the Inth app CLI logger so success, failure, and fallback messages match the rest of your CLI output.
5. Use `onSuccess` and `onFailure` to connect installation results to telemetry or follow-up guidance.

## Support

- Open an issue in the Hexbus repository for installer wrapper bugs.
- Report problems with a specific skill bundle to the repository that owns that skill reference.

## License

[Apache-2.0](../../LICENSE)

## Runner Commands

- `bun` -> `bunx`
- `pnpm` -> `pnpm dlx`
- `yarn` -> `yarn dlx`
- `npm` and unknown package managers -> `npx`

## Failure Behavior

`installSkills` does not throw when the external installer exits unsuccessfully or cannot start. It logs the failure, prints a manual install command, invokes `onFailure` when provided, and returns. This keeps Inth app CLIs in control of whether a failed skill install should block the rest of the command.

## Skill Ownership

This package intentionally does not bundle skill content. Inth app CLIs own the skill reference, release cadence, and any app-specific messaging around what those skills do.
