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

/**
 * Options used to build a complete CLI execution context.
 *
 * @typeParam TPackage - Product-specific package identifier selected by
 * framework detection.
 */
export interface CreateContextOptions<TPackage extends string = string> {
  /**
   * Raw process arguments after the executable and script path have been
   * removed.
   *
   * @example process.argv.slice(2)
   */
  rawArgs: string[];
  /**
   * Directory where invocation started.
   *
   * @default process.cwd()
   */
  cwd?: string;
  /**
   * Top-level commands used to identify `commandName` during argument parsing.
   */
  commands: CliCommand[];
  /**
   * Application name used for config lookup, telemetry defaults, and logger
   * metadata.
   *
   * @default "cli"
   */
  appName?: string;
  /**
   * Config name passed to `c12` when loading project configuration.
   *
   * @default appName
   */
  configName?: string;
  /**
   * Telemetry configuration for the context.
   */
  telemetry?: {
    /**
     * Disables telemetry regardless of command-line flags or environment
     * variables.
     */
    disabled?: boolean;
    /**
     * Emits queued telemetry payloads through the logger debug channel.
     */
    debug?: boolean;
    /**
     * HTTP endpoint that receives flushed telemetry batches.
     */
    endpoint?: string;
    /**
     * Environment variable prefix used to read telemetry opt-out flags.
     *
     * @remarks
     * A prefix of `MY_CLI` reads `MY_CLI_TELEMETRY_DISABLED`.
     */
    envVarPrefix?: string;
    /**
     * Properties merged into every telemetry event created by this context.
     */
    defaultProperties?: Record<string, unknown>;
  };
  /**
   * Product package identifiers selected for framework-specific installs.
   */
  packageMap?: {
    /**
     * Package used when no React framework is detected.
     */
    core?: TPackage;
    /**
     * Package used for generic React-compatible projects.
     */
    react?: TPackage;
    /**
     * Package used for Next.js projects.
     */
    next?: TPackage;
  };
  /**
   * Allows package-manager detection to prompt when lockfile and package.json
   * detection fail.
   *
   * @default false
   */
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

/**
 * Creates the resolved context passed to command actions.
 *
 * @remarks
 * Context creation performs the standard CLI bootstrap sequence: parse global
 * flags, create the logger, detect the project root, detect framework and
 * package manager metadata, set up telemetry, and attach helpers for config
 * loading, file-system access, confirmation prompts, and process-ending error
 * handling.
 *
 * @typeParam TPackage - Product-specific package identifier returned from
 * framework detection.
 * @param options - Context creation options for the current invocation.
 * @returns A fully initialized `CliContext`.
 *
 * @example
 * ```ts
 * const context = await createCliContext({
 *   rawArgs: process.argv.slice(2),
 *   appName: 'acme',
 *   commands,
 * });
 *
 * await commands.find((command) => command.name === context.commandName)
 *   ?.action(context);
 * ```
 */
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

/**
 * Creates a deterministic context for unit tests.
 *
 * @remarks
 * The test context disables telemetry, uses an error-only logger, avoids real
 * framework or package-manager detection, and provides no-op file-system
 * helpers. Pass overrides to replace only the services a test needs.
 *
 * @param overrides - Partial context fields to merge into the default test
 * context.
 * @returns A `CliContext` suitable for command and helper tests.
 *
 * @example
 * ```ts
 * const context = createTestContext({
 *   flags: { force: true },
 *   commandName: 'init',
 * });
 * ```
 */
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
