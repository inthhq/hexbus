# @inth/hexbus-skills

Shared wrapper for installing agent skills through the external `skills` CLI.

```ts
import { installSkills } from '@inth/hexbus-skills';

await installSkills({
	skillRef: 'c15t/skills',
	packageManager: 'bun',
});
```

The package does not bundle skill content. It delegates to `skills add <ref>` using the caller's package manager.
