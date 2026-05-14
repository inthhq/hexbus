#!/usr/bin/env bun

import { parseCommandArgs, runCli } from "../../index";
import type { CliCommand } from "../../index";

const commands: CliCommand[] = [
  {
    action: (context) => {
      context.logger.success(`hello args: ${context.commandArgs.join(",")}`);
      return Promise.resolve();
    },
    description: "Print a greeting with command args.",
    hint: "Print a greeting",
    label: "Hello",
    name: "hello",
  },
  {
    action: (context) => {
      context.logger.info(
        `telemetry disabled: ${context.telemetry.isDisabled()}`
      );
      return Promise.resolve();
    },
    description: "Report telemetry state.",
    hint: "Report telemetry",
    label: "Telemetry",
    name: "telemetry",
  },
  {
    description: "Developer tools.",
    hint: "Run tools",
    label: "Tools",
    name: "tools",
    subcommands: [
      {
        action: (context) => {
          const args = parseCommandArgs(context.commandArgs, {
            positionals: [{ name: "target", required: true }],
          });
          context.logger.success(`migrate target: ${args.positionals.target}`);
          return Promise.resolve();
        },
        description: "Run migrations.",
        hint: "Migrate data",
        label: "Migrate",
        name: "migrate",
      },
    ],
  },
];

await runCli({
  appName: "fixture-cli",
  commands,
  context: {
    configName: "fixture-cli",
    interactivePackageManagerDetection: false,
  },
  intro: false,
  packageInfo: {
    name: "hexbus-spawn-fixture",
    version: "9.8.7",
  },
  updateCheck: false,
});
