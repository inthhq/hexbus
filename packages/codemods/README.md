# @inth/hexbus-codemods

Reusable codemod harness for product CLIs.

Includes:

- source file collection
- `ts-morph` project setup
- dry-run save guard
- codemod definition and registry runner
- simple semver applicability helpers
- temporary fixture helpers for tests

Product-specific transforms stay in the product CLI. This package owns the runner and shared mechanics.
