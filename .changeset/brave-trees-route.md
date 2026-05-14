---
"hexbus": minor
---

Add first-class command-tree routing so `dispatchCommand` and `runCli` can execute nested `subcommands`, render scoped help, and pass leaf actions only the remaining args after the matched command path.
