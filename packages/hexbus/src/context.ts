import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

import * as p from "@clack/prompts";
import { loadConfig } from "c12";

import {
  detectFramework,
  detectPackageManager,
  detectProjectRoot,
} from "./detection";
import { CliError, createErrorHandlers } from "./errors";
import { createCliLogger, validLogLevels } from "./logger";
import { parseCliArgs } from "./parser";
import {
  createDisabledTelemetry,
  createTelemetry,
  TelemetryEventName,
} from "./telemetry";
import type {
  CliCommand,
  CliContext,
  ErrorHandlers,
  FileSystemUtils,
  FrameworkDetectionResult,
  LogLevel,
  PackageInfo,
  PackageManagerResult,
  ParsedArgs,
  Telemetry,
} from "./types";

export interface CreateContextOptions<TPackage extends string = string> {
  rawArgs: string[];
  cwd?: string;
  commands: CliCommand[];
  appName?: string;
  configName?: string;
  telemetry?: {
    disabled?: boolean;
    debug?: boolean;
    endpoint?: string;
    envVarPrefix?: string;
    defaultProperties?: Record<string, unknown>;
  };
  packageMap?: {
    core?: TPackage;
    react?: TPackage;
    next?: TPackage;
  };
  interactivePackageManagerDetection?: boolean;
}

function getLogLevel(parsedFlags: ParsedArgs["parsedFlags"]): LogLevel {
  const levelArg = parsedFlags.logger;

  if (typeof levelArg === "string") {
    if ((validLogLevels as string[]).includes(levelArg)) {
      return levelArg as LogLevel;
    }

    process.stderr.write(
      `[CLI Setup] Invalid log level '${levelArg}' provided via --logger. Using default 'info'.\n`
    );
  }

  return "info";
}

function createFileSystem(cwd: string): FileSystemUtils {
  return {
    async exists(filePath: string) {
      try {
        await fs.access(filePath);
        return true;
      } catch {
        return false;
      }
    },
    getPackageInfo(): PackageInfo {
      const packageJsonPath = path.join(cwd, "package.json");
      try {
        const content = fsSync.readFileSync(packageJsonPath, "utf-8");
        const packageInfo = JSON.parse(content) as PackageInfo;
        return {
          ...packageInfo,
          name: packageInfo.name || "unknown",
          version: packageInfo.version || "unknown",
        };
      } catch {
        return {
          name: "unknown",
          version: "unknown",
        };
      }
    },
    async mkdir(dirPath: string) {
      await fs.mkdir(dirPath, { recursive: true });
    },
    read(filePath: string) {
      return fs.readFile(filePath, "utf-8");
    },
    write(filePath: string, content: string) {
      return fs.writeFile(filePath, content, "utf-8");
    },
  };
}

export async function createCliContext<TPackage extends string = string>(
  options: CreateContextOptions<TPackage>
): Promise<CliContext<TPackage>> {
  const cwd = options.cwd ?? process.cwd();
  const appName = options.appName ?? "cli";
  const { commandName, commandArgs, parsedFlags } = parseCliArgs(
    options.rawArgs,
    options.commands
  );

  const logger = createCliLogger(getLogLevel(parsedFlags));
  const projectRoot = await detectProjectRoot(cwd, logger);
  const fsUtils = createFileSystem(projectRoot);
  const framework = await detectFramework(
    projectRoot,
    logger,
    options.packageMap
  );
  const packageManager = await detectPackageManager(projectRoot, logger, {
    interactive: options.interactivePackageManagerDetection,
  });

  const telemetry = createTelemetry({
    appName,
    debug:
      options.telemetry?.debug === true ||
      parsedFlags["telemetry-debug"] === true,
    defaultProperties: {
      cliVersion: fsUtils.getPackageInfo().version,
      commandArgsCount: commandArgs.length,
      entryCommand: commandName ?? "interactive",
      framework: framework.framework ?? "unknown",
      frameworkVersion: framework.frameworkVersion ?? "unknown",
      packageManager: packageManager.name,
      ...options.telemetry?.defaultProperties,
    },
    disabled:
      options.telemetry?.disabled === true ||
      parsedFlags["no-telemetry"] === true,
    endpoint: options.telemetry?.endpoint,
    envVarPrefix: options.telemetry?.envVarPrefix ?? appName.toUpperCase(),
    logger,
  });

  const errorHandlers = createErrorHandlers(logger, telemetry);

  const context: CliContext<TPackage> = {
    commandArgs,
    commandName,
    config: {
      getPathAliases() {
        return null;
      },
      async loadConfig<TConfig = unknown>() {
        const configPath =
          typeof parsedFlags.config === "string"
            ? parsedFlags.config
            : undefined;
        const { config } = await loadConfig({
          configFile: configPath,
          cwd: projectRoot,
          name: options.configName ?? appName,
        });
        return (config as TConfig | undefined) ?? null;
      },
      async requireConfig<TConfig = unknown>() {
        const config = await this.loadConfig<TConfig>();
        if (!config) {
          throw new CliError("CONFIG_NOT_FOUND");
        }
        return config;
      },
    },
    async confirm(message: string, initialValue = true) {
      if (parsedFlags.y === true || parsedFlags.yes === true) {
        return true;
      }

      const result = await p.confirm({ initialValue, message });
      if (p.isCancel(result)) {
        errorHandlers.handleCancel("Confirmation cancelled");
      }
      return result as boolean;
    },
    cwd,
    error: errorHandlers,
    flags: parsedFlags,
    framework,
    fs: fsUtils,
    logger,
    packageManager,
    projectRoot,
    telemetry,
  };

  telemetry.trackEvent(TelemetryEventName.CLI_ENVIRONMENT_DETECTED, {
    command: commandName ?? "interactive",
    framework: framework.framework ?? "unknown",
    frameworkVersion: framework.frameworkVersion ?? "unknown",
    hasReact: framework.hasReact,
    packageManager: packageManager.name,
    projectRootChanged: projectRoot !== cwd,
    reactVersion: framework.reactVersion ?? "unknown",
    tailwindVersion: framework.tailwindVersion ?? "unknown",
  });

  return context;
}

export function createTestContext(
  overrides: Partial<CliContext> = {}
): CliContext {
  const logger = createCliLogger("error");
  const telemetry = createDisabledTelemetry();
  const error = createErrorHandlers(logger, telemetry) as ErrorHandlers;
  const framework: FrameworkDetectionResult = {
    framework: null,
    frameworkVersion: null,
    hasReact: false,
    pkg: null,
    reactVersion: null,
    tailwindVersion: null,
  };
  const packageManager: PackageManagerResult = {
    addCommand: "npm install",
    execCommand: "npx",
    installCommand: "npm install",
    name: "npm",
    runCommand: "npm run",
  };

  return {
    commandArgs: [],
    commandName: undefined,
    config: {
      getPathAliases: () => null,
      loadConfig: async () => null,
      requireConfig: async () => {
        throw new CliError("CONFIG_NOT_FOUND");
      },
    },
    confirm: async () => true,
    cwd: process.cwd(),
    error,
    flags: {},
    framework,
    fs: {
      exists: async () => false,
      getPackageInfo: () => ({ name: "test", version: "0.0.0" }),
      mkdir: async () => {},
      read: async () => "",
      write: async () => {},
    },
    logger,
    packageManager,
    projectRoot: process.cwd(),
    telemetry: telemetry as Telemetry,
    ...overrides,
  };
}
