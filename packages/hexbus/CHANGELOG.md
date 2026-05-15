# hexbus

## 0.6.1

### Patch Changes

- 1304e62: Add optional string command flags that accept bare, equals-form, and next-argument values.

## 0.6.0

### Minor Changes

- 348452c: Added Evlog

## 0.5.0

### Minor Changes

- 8f242bc: Export bundled color and figlet helpers so product CLIs can share Hexbus' terminal UX dependencies instead of installing duplicate styling and banner packages.

## 0.4.0

### Minor Changes

- 8556951: Expose public prompt helpers backed by Hexbus' pinned `@clack/prompts`, with consistent cancellation handling and optional prompt telemetry.

  Remove the codemods package's direct `@clack/prompts` dependency by using the new Hexbus multiselect wrapper.

## Unreleased

### Minor Changes

- Add public prompt helpers backed by Hexbus' pinned `@clack/prompts`, including select, multiselect, text, and confirm wrappers with consistent cancellation handling and optional prompt telemetry.

## 0.3.0

### Minor Changes

- c49437d: Add first-class command-tree routing so `dispatchCommand` and `runCli` can execute nested `subcommands`, render scoped help, and pass leaf actions only the remaining args after the matched command path.
- 3ecfa0b: Add `parseCommandArgs`, a command-local parser for per-command flags, aliases, defaults, negated booleans, and positional validation.
- 11ff56e: Add `dispatchCommand`, `selectCommand`, and `findCommand` helpers for reusable command lookup, unknown-command handling, no-command behavior, and interactive command selection.
- adcbac4: Add `runCli`, a shared CLI lifecycle runner that composes Hexbus primitives for version output, context creation, update checks, help, intro rendering, command dispatch, hooks, telemetry shutdown, and error handling.

## 0.2.0

### Minor Changes

- ab592ba: updates based on the c15t migration to hexbus

## 0.1.1

### Patch Changes

- df714b7: Document public APIs across the Hexbus packages with TSDoc, split version update checking into focused internal modules, colocate its tests, and harden cache file handling for unusual package names and failed atomic writes.
