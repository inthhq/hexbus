#!/usr/bin/env bun

import { runCli } from "hexbus";
import type { CliCommand } from "hexbus";

const commands: CliCommand[] = [
  {
    action: (context) => {
      context.logger.success("Hello from hexbus.");
      return Promise.resolve();
    },
    description: "Print a greeting from the example CLI.",
    hint: "Print a greeting",
    label: "Hello",
    name: "hello",
  },
];

await runCli({
  appName: "minimal-cli",
  commands,
  context: {
    configName: "minimal-cli",
    interactivePackageManagerDetection: false,
  },
  intro: {
    tagline: "A tiny CLI built with hexbus.",
  },
  noCommand: {
    mode: "interactive",
  },
  packageInfo: {
    name: "@inth/hexbus-example-minimal-cli",
    version: "0.1.0",
  },
});
