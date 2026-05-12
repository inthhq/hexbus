# Hexbus

Opinionated CLI packages for Hexbus projects.

This repo contains three packages:

- `hexbus`: context, parser, logger, errors, telemetry, detection, intro, and help primitives.
- `@inth/hexbus-codemods`: reusable `ts-morph` codemod harness, dry-run support, version applicability helpers, and test utilities.
- `@inth/hexbus-skills`: tiny wrapper for installing agent skills via the external `skills` CLI.

## Development

```bash
bun install
bun run build
bun run test
bun run check-types
```

## Example

See `examples/minimal-cli` for a small CLI built on `hexbus`.

## Update Checks

`hexbus` includes helpers for fast `-v` / `--version` handling and
install-source-aware update hints. Version requests can run before
`createCliContext`, so they do not need project detection or config loading.

Normal CLI runs can call `startBackgroundUpdateCheck` to show cached update
hints immediately and refresh stale registry data in the background. The helper
detects npm global, Homebrew, transient runners such as `npx`, and local
installs, then recommends the appropriate update command when one is available.

## Migrating c15t

Once these packages are published, `@c15t/cli` can consume them by:

1. Adding `hexbus`, `@inth/hexbus-codemods`, and `@inth/hexbus-skills`.
2. Replacing its local CLI context, parser, logger, telemetry, detection, intro, and help code with imports from `hexbus`.
3. Keeping c15t-specific commands, constants, auth, control-plane, and transforms in `@c15t/cli`.
4. Replacing the codemod runner with `@inth/hexbus-codemods`, while passing c15t's transform registry and installed-version detector.
5. Replacing the skills command with `installSkills({ skillRef: 'c15t/skills', ... })`.

The goal is for product CLIs to own product behavior and share only the command-line chassis.
