# @inth/hexbus-codemods

## 0.5.0

### Patch Changes

- Updated dependencies [8f242bc]
  - hexbus@0.5.0

## 0.4.0

### Patch Changes

- 8556951: Expose public prompt helpers backed by Hexbus' pinned `@clack/prompts`, with consistent cancellation handling and optional prompt telemetry.

  Remove the codemods package's direct `@clack/prompts` dependency by using the new Hexbus multiselect wrapper.

- Updated dependencies [8556951]
  - hexbus@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [c49437d]
- Updated dependencies [3ecfa0b]
- Updated dependencies [11ff56e]
- Updated dependencies [adcbac4]
  - hexbus@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [ab592ba]
  - hexbus@0.2.0

## 0.1.1

### Patch Changes

- df714b7: Document public APIs across the Hexbus packages with TSDoc, split version update checking into focused internal modules, colocate its tests, and harden cache file handling for unusual package names and failed atomic writes.
- Updated dependencies [df714b7]
  - hexbus@0.1.1
