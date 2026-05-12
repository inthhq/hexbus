#!/usr/bin/env bun

import { readFileSync } from "node:fs";

import {
  createCliContext,
  displayIntro,
  globalFlags,
  isVersionRequest,
  printVersionInfo,
  showHelpMenu,
  startBackgroundUpdateCheck,
} from "hexbus";
import type { CliCommand } from "hexbus";

interface PackageInfo {
  name: string;
  version: string;
}

function readOwnPackageInfo(): PackageInfo {
  try {
    const packageJsonUrl = new URL("../package.json", import.meta.url);
    const content = readFileSync(packageJsonUrl, "utf-8");
    const parsed = JSON.parse(content) as Partial<PackageInfo>;
    return {
      name: parsed.name ?? "minimal-cli",
      version: parsed.version ?? "unknown",
    };
  } catch (error) {
    throw new Error(
      `Failed to read or parse package.json: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
}

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

const rawArgs = process.argv.slice(2);
const packageInfo = readOwnPackageInfo();
const { version } = packageInfo;

if (isVersionRequest(rawArgs)) {
  await printVersionInfo({
    appName: "minimal-cli",
    currentVersion: version,
    packageName: packageInfo.name,
  });
  process.exit(0);
}

const context = await createCliContext({
  appName: "minimal-cli",
  commands,
  configName: "minimal-cli",
  interactivePackageManagerDetection: false,
  rawArgs,
});

startBackgroundUpdateCheck({
  appName: "minimal-cli",
  currentVersion: version,
  logger: context.logger,
  packageName: packageInfo.name,
});

if (context.flags.help) {
  showHelpMenu(
    context,
    { appName: "minimal-cli", version },
    commands,
    globalFlags
  );
  process.exit(0);
}

await displayIntro(context, {
  appName: "minimal-cli",
  tagline: "A tiny CLI built with hexbus.",
  version,
});

const command = commands.find((item) => item.name === context.commandName);

if (command) {
  await command.action(context);
} else {
  showHelpMenu(
    context,
    { appName: "minimal-cli", version },
    commands,
    globalFlags
  );
}
