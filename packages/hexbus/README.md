# hexbus

Reusable CLI chassis for Hexbus tools.

Includes:

- argument parsing and global flags
- context creation
- logger and spinner helpers
- configurable telemetry
- configurable error catalog
- project root, framework, and package manager detection
- intro and help rendering

```ts
import { createCliContext, displayIntro, showHelpMenu } from 'hexbus';
```
