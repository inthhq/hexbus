#!/usr/bin/env bun

import { runCli } from "../../index";
import type { CliCommand } from "../../types";

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
