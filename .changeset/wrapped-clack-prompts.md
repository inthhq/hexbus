---
"hexbus": minor
"@inth/hexbus-codemods": patch
---

Expose public prompt helpers backed by Hexbus' pinned `@clack/prompts`, with consistent cancellation handling and optional prompt telemetry.

Remove the codemods package's direct `@clack/prompts` dependency by using the new Hexbus multiselect wrapper.
