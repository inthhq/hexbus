# Agent Guidance

- Use Bun for installs, scripts, tests, and one-off TypeScript execution.
- Keep root scripts as `turbo run` delegators.
- Put package-specific task logic in each package's `package.json`.
- Keep `hexbus` and `@inth/hexbus-*` packages free of product-specific imports and copy.
- Prefer small, explicit APIs over framework-like abstractions.
