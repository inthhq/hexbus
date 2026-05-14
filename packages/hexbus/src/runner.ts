import { createCliContext } from "./context";
import type { CreateContextOptions } from "./context";
import { dispatchCommand, resolveCommandRoute } from "./dispatch";
import type {
  DispatchCommandResult,
  DispatchNoCommandBehavior,
  SelectCommandOptions,
  SelectCommandResult,
} from "./dispatch";
import { CliError } from "./errors";
import { showHelpMenu } from "./help";
import type { ShowHelpMenuOptions } from "./help";
import { displayIntro } from "./intro";
import type { DisplayIntroOptions } from "./intro";
import { globalFlags } from "./parser";
import { TelemetryEventName } from "./telemetry";
import type { CliCommand, CliContext, CliFlag, PackageInfo } from "./types";
import {
  isVersionRequest,
  printVersionInfo,
  startBackgroundUpdateCheck,
} from "./version-check";
import type { UpdateCheckOptions } from "./version-check";

type MaybePromise<T> = T | Promise<T>;

/**
 * Result details passed to hooks after a command action completes.
 */
export interface RunCliCommandHookOptions<
  TPackage extends string = string,
  TContext extends CliContext<TPackage> = CliContext<TPackage>,
> {
  /**
   * Resolved execution context for the invocation.
   */
  context: TContext;
  /**
   * Command selected from the configured command list.
   */
  command: CliCommand<TContext>;
  /**
   * Command objects from the top-level command to the selected command.
   */
  commandPath: CliCommand<TContext>[];
  /**
   * Command names from the top-level command to the selected command.
   */
  commandNames: string[];
}

/**
 * Error details passed to `runCli` error hooks.
 */
export interface RunCliErrorHookOptions<
  TPackage extends string = string,
  TContext extends CliContext<TPackage> = CliContext<TPackage>,
> {
  /**
   * Resolved execution context for the invocation.
   */
  context: TContext;
  /**
   * Command selected from the configured command list, when dispatch reached a
   * command.
   */
  command?: CliCommand<TContext>;
  /**
   * Command names from the top-level command to the selected command, when
   * dispatch reached a command.
   */
  commandNames?: string[];
  /**
   * Error thrown by context hooks, command hooks, or command execution.
   */
  error: unknown;
}

/**
 * Hook points for product-specific behavior around the shared CLI lifecycle.
 */
export interface RunCliHooks<
  TPackage extends string = string,
  TContext extends CliContext<TPackage> = CliContext<TPackage>,
> {
  /**
   * Runs after `createCliContext` and may return an augmented context that
   * command actions should receive.
   */
  afterContext?: (
    context: CliContext<TPackage>
  ) => MaybePromise<TContext | undefined>;
  /**
   * Runs immediately before a matched command action.
   */
  beforeCommand?: (
    options: RunCliCommandHookOptions<TPackage, TContext>
  ) => MaybePromise<void>;
  /**
   * Runs after a matched command action resolves successfully.
   */
  afterCommand?: (
    options: RunCliCommandHookOptions<TPackage, TContext> & {
      result: undefined;
    }
  ) => MaybePromise<void>;
  /**
   * Runs after an error is tracked but before telemetry shutdown and shared
   * error rendering.
   */
  onError?: (
    options: RunCliErrorHookOptions<TPackage, TContext>
  ) => MaybePromise<void>;
}

/**
 * Options passed to a custom no-command handler.
 */
export interface RunCliNoCommandOptions<
  TPackage extends string = string,
  TContext extends CliContext<TPackage> = CliContext<TPackage>,
> {
  /**
   * Resolved execution context for the invocation.
   */
  context: TContext;
  /**
   * Commands registered for this CLI.
   */
  commands: CliCommand<TContext>[];
  /**
   * Command group path whose subcommands are being handled.
   */
  commandPath: CliCommand<TContext>[];
  /**
   * Command group names whose subcommands are being handled.
   */
  commandNames: string[];
  /**
   * Package metadata used for help, version, and update output.
   */
  packageInfo: PackageInfo;
  /**
   * Raw process arguments after the executable and script path.
   */
  rawArgs: string[];
}

/**
 * Configures what `runCli` does when no registered command was selected.
 */
export type RunCliNoCommandBehavior<
  TPackage extends string = string,
  TContext extends CliContext<TPackage> = CliContext<TPackage>,
> =
  | { mode?: "help" }
  | { mode: "interactive"; selection?: SelectCommandOptions }
  | {
      action: (
        options: RunCliNoCommandOptions<TPackage, TContext>
      ) => MaybePromise<void>;
      mode: "custom";
    };

/**
 * Help rendering options for `runCli`.
 */
export interface RunCliHelpOptions extends Omit<
  ShowHelpMenuOptions,
  "appName" | "commandPath" | "version"
> {
  /**
   * Flags rendered in help output. Defaults to Hexbus global flags plus any
   * caller-provided context flags.
   */
  flags?: CliFlag[];
}

/**
 * Background update-check options for `runCli`.
 */
export type RunCliUpdateCheckOptions =
  | false
  | (Omit<UpdateCheckOptions, "currentVersion" | "logger" | "packageName"> & {
      /**
       * Override the package name queried for update checks.
       *
       * @default packageInfo.name
       */
      packageName?: string;
      /**
       * Override the current version used for update comparisons.
       *
       * @default packageInfo.version
       */
      currentVersion?: string;
    });

/**
 * Full lifecycle runner configuration.
 */
export interface RunCliOptions<
  TPackage extends string = string,
  TContext extends CliContext<TPackage> = CliContext<TPackage>,
> {
  /**
   * CLI application name used in help, intro, version, context, and telemetry.
   */
  appName: string;
  /**
   * Commands accepted by this CLI.
   */
  commands: CliCommand<TContext>[];
  /**
   * Package metadata used for help, version, and update output.
   */
  packageInfo: PackageInfo;
  /**
   * Raw arguments after executable and script path.
   *
   * @default process.argv.slice(2)
   */
  rawArgs?: string[];
  /**
   * Options forwarded to `createCliContext`.
   */
  context?: Omit<
    CreateContextOptions<TPackage>,
    "appName" | "commands" | "rawArgs"
  >;
  /**
   * Intro metadata, or `false` to skip intro rendering.
   */
  intro?: false | Omit<DisplayIntroOptions, "appName" | "version">;
  /**
   * Help metadata rendered by `showHelpMenu`.
   */
  help?: RunCliHelpOptions;
  /**
   * Background update-check behavior.
   *
   * @default true
   */
  updateCheck?: RunCliUpdateCheckOptions;
  /**
   * Behavior used when no configured command is selected.
   *
   * @default { mode: "help" }
   */
  noCommand?: RunCliNoCommandBehavior<TPackage, TContext>;
  /**
   * Product-specific lifecycle hooks.
   */
  hooks?: RunCliHooks<TPackage, TContext>;
}

function getFlagPrimaryName(flag: CliFlag): string {
  const longName = flag.names.find((name) => name.startsWith("--"));
  const fallback = flag.names.reduce(
    (longest, name) => (name.length > longest.length ? name : longest),
    ""
  );
  return (longName ?? fallback).replace(/^--?/, "");
}

function getHelpFlags(
  helpFlags: CliFlag[] | undefined,
  contextFlags: CliFlag[] | undefined
): CliFlag[] {
  if (helpFlags) {
    return helpFlags;
  }

  const merged = new Map<string, CliFlag>();
  for (const flag of [...globalFlags, ...(contextFlags ?? [])]) {
    const primaryName = getFlagPrimaryName(flag);
    if (primaryName) {
      merged.set(primaryName, flag);
    }
  }
  return [...merged.values()];
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : CliError.from(error);
}

function findUnknownCommandOption(context: CliContext): string | undefined {
  if (!context.commandName) {
    return undefined;
  }

  return context.commandArgs.find((arg) => /^-{1,2}[A-Za-z]/.test(arg));
}

function createHelpOptions(
  options: Pick<RunCliOptions, "appName" | "help" | "packageInfo">,
  commandNames: string[] = []
): ShowHelpMenuOptions {
  const helpOptions: ShowHelpMenuOptions = {
    appName: options.appName,
    docsUrl: options.help?.docsUrl,
    version: options.packageInfo.version,
  };

  if (commandNames.length > 0) {
    helpOptions.commandPath = commandNames;
  }

  return helpOptions;
}

function createUpdateOptions(
  options: Pick<RunCliOptions, "appName" | "packageInfo" | "updateCheck">,
  context: Pick<CliContext, "logger">
): (UpdateCheckOptions & { appName: string }) | null {
  if (options.updateCheck === false) {
    return null;
  }

  const updateCheck = options.updateCheck ?? {};
  return {
    ...updateCheck,
    appName: options.appName,
    currentVersion: updateCheck.currentVersion ?? options.packageInfo.version,
    logger: context.logger,
    packageName: updateCheck.packageName ?? options.packageInfo.name,
  };
}

function showRunnerHelp<
  TPackage extends string,
  TContext extends CliContext<TPackage>,
>(
  context: TContext,
  options: RunCliOptions<TPackage, TContext>,
  commands: CliCommand[] = options.commands as CliCommand[],
  commandNames: string[] = []
): void {
  showHelpMenu(
    context,
    createHelpOptions(options, commandNames),
    commands,
    getHelpFlags(options.help?.flags, options.context?.globalFlags)
  );
  context.telemetry.trackEvent(TelemetryEventName.HELP_DISPLAYED, {
    command: commandNames.join(" ") || context.commandName || "none",
  });
}

function showScopedRunnerHelp<
  TPackage extends string,
  TContext extends CliContext<TPackage>,
>(context: TContext, options: RunCliOptions<TPackage, TContext>): void {
  const route = resolveCommandRoute(context, options.commands);

  if (route?.command.subcommands && route.command.subcommands.length > 0) {
    showRunnerHelp(
      context,
      options,
      route.command.subcommands as CliCommand[],
      route.commandNames
    );
    return;
  }

  showRunnerHelp(context, options);
}

function createDispatchNoCommandBehavior<
  TPackage extends string,
  TContext extends CliContext<TPackage>,
>(
  options: RunCliOptions<TPackage, TContext>,
  rawArgs: string[]
): DispatchNoCommandBehavior<TContext> {
  const behavior = options.noCommand ?? { mode: "help" as const };

  if (behavior.mode === "custom") {
    return {
      action: ({ commandNames, commandPath, commands, context }) =>
        behavior.action({
          commandNames,
          commandPath,
          commands,
          context,
          packageInfo: options.packageInfo,
          rawArgs,
        }),
      mode: "custom",
    };
  }

  if (behavior.mode === "interactive") {
    return {
      mode: "interactive",
      selection: behavior.selection,
    };
  }

  return {
    action: ({ commandNames, commands, context }) =>
      showRunnerHelp(context, options, commands as CliCommand[], commandNames),
    mode: "help",
  };
}

function getSelectionCloseReason<TContext extends CliContext>(
  result: SelectCommandResult<TContext>
): string {
  if (result.type === "selected") {
    return "selected_command";
  }
  if (result.type === "cancelled") {
    return "cancelled";
  }
  return "exit_option";
}

type RunCliOutcome =
  | "command"
  | "completed"
  | "error"
  | "help"
  | "no_command"
  | "selection_cancelled"
  | "selection_exited"
  | "unknown_command";

interface RunCliState<
  TPackage extends string,
  TContext extends CliContext<TPackage>,
> {
  commandNames?: string[];
  context?: TContext;
  errorToHandle?: unknown;
  outcome: RunCliOutcome;
  selectedCommand?: CliCommand<TContext>;
}

async function handleVersionRequest(
  options: Pick<RunCliOptions, "appName" | "packageInfo">,
  rawArgs: string[]
): Promise<boolean> {
  if (!isVersionRequest(rawArgs)) {
    return false;
  }

  await printVersionInfo({
    appName: options.appName,
    currentVersion: options.packageInfo.version,
    packageName: options.packageInfo.name,
  });
  return true;
}

async function createRunnerContext<
  TPackage extends string,
  TContext extends CliContext<TPackage>,
>(
  options: RunCliOptions<TPackage, TContext>,
  rawArgs: string[]
): Promise<TContext> {
  const baseContext = await createCliContext<TPackage>({
    ...options.context,
    appName: options.appName,
    commands: options.commands as CliCommand[],
    rawArgs,
  });
  const extendedContext = await options.hooks?.afterContext?.(baseContext);
  return (extendedContext ?? baseContext) as TContext;
}

function startRunnerUpdateCheck<
  TPackage extends string,
  TContext extends CliContext<TPackage>,
>(context: TContext, options: RunCliOptions<TPackage, TContext>): void {
  const updateOptions = createUpdateOptions(options, context);
  if (updateOptions) {
    startBackgroundUpdateCheck(updateOptions);
  }
}

function dispatchRunnerCommand<
  TPackage extends string,
  TContext extends CliContext<TPackage>,
>(
  runnerContext: TContext,
  options: RunCliOptions<TPackage, TContext>,
  rawArgs: string[]
): Promise<DispatchCommandResult<TContext>> {
  return dispatchCommand(runnerContext, options.commands, {
    hooks: {
      async onCommandStart({
        command,
        commandNames,
        commandPath,
        context: commandContext,
      }) {
        if (options.intro !== false) {
          await displayIntro(commandContext, {
            ...options.intro,
            appName: options.appName,
            version: options.packageInfo.version,
          });
        }

        const commandLabel = commandNames.join(" ");
        commandContext.telemetry.trackCommand(
          commandLabel,
          commandContext.commandArgs,
          commandContext.flags
        );
        await options.hooks?.beforeCommand?.({
          command,
          commandNames,
          commandPath,
          context: commandContext,
        });
      },
      async onCommandSuccess({
        command,
        commandNames,
        commandPath,
        context: commandContext,
      }) {
        await options.hooks?.afterCommand?.({
          command,
          commandNames,
          commandPath,
          context: commandContext,
          result: undefined,
        });
        commandContext.telemetry.trackEvent(
          TelemetryEventName.COMMAND_SUCCEEDED,
          {
            command: commandNames.join(" "),
          }
        );
      },
      onSelectionClose({ commandNames, context: commandContext, result }) {
        const selectedCommand =
          result.type === "selected"
            ? [...commandNames, result.command.name].join(" ")
            : "none";
        commandContext.telemetry.trackEvent(
          TelemetryEventName.INTERACTIVE_MENU_EXITED,
          {
            command: selectedCommand,
            reason: getSelectionCloseReason(result),
          }
        );
      },
      onSelectionOpen({ context: commandContext, reason }) {
        commandContext.telemetry.trackEvent(
          TelemetryEventName.INTERACTIVE_MENU_OPENED,
          {
            reason,
          }
        );
      },
      onUnknownCommand({ commandName, commandNames, context: commandContext }) {
        const commandLabel = [...commandNames, commandName].join(" ");
        commandContext.telemetry.trackEvent(
          TelemetryEventName.COMMAND_UNKNOWN,
          {
            command: commandLabel,
          }
        );
      },
    },
    noCommand: createDispatchNoCommandBehavior(options, rawArgs),
    unknownCommand: {
      action: ({ commandNames, commands, context: commandContext }) =>
        showRunnerHelp(
          commandContext,
          options,
          commands as CliCommand[],
          commandNames
        ),
    },
  });
}

async function trackRunnerError<
  TPackage extends string,
  TContext extends CliContext<TPackage>,
>(
  error: unknown,
  options: RunCliOptions<TPackage, TContext>,
  state: RunCliState<TPackage, TContext>
): Promise<void> {
  state.errorToHandle = error;
  state.outcome = "error";

  if (!state.context) {
    throw error;
  }

  const commandName =
    state.commandNames?.join(" ") ??
    state.selectedCommand?.name ??
    state.context.commandName ??
    "none";
  const normalizedError = normalizeError(error);
  state.context.telemetry.trackEvent(TelemetryEventName.COMMAND_FAILED, {
    command: commandName,
    errorMessage: normalizedError.message,
    errorName: normalizedError.name,
  });
  state.context.telemetry.trackError(normalizedError, commandName);
  await options.hooks?.onError?.({
    command: state.selectedCommand,
    commandNames: state.commandNames,
    context: state.context,
    error,
  });
}

async function applyDispatchResult<
  TPackage extends string,
  TContext extends CliContext<TPackage>,
>(
  result: DispatchCommandResult<TContext>,
  options: RunCliOptions<TPackage, TContext>,
  state: RunCliState<TPackage, TContext>
): Promise<void> {
  if (
    result.type === "command_executed" ||
    result.type === "command_selected"
  ) {
    state.commandNames = result.commandNames;
    state.selectedCommand = result.command;
    state.outcome = "command";
    return;
  }

  if (result.type === "command_failed") {
    state.commandNames = result.commandNames;
    state.selectedCommand = result.command;
    await trackRunnerError(result.error, options, state);
    return;
  }

  if (result.type === "unknown_command") {
    state.commandNames =
      result.commandNames.length > 0
        ? [...result.commandNames, result.commandName]
        : [result.commandName];
    state.outcome = "unknown_command";
    return;
  }

  if (result.type === "selection_cancelled") {
    state.outcome = "selection_cancelled";
    return;
  }

  if (result.type === "selection_exited") {
    state.outcome = "selection_exited";
    return;
  }

  state.outcome = "no_command";
}

async function shutdownRunnerTelemetry<
  TPackage extends string,
  TContext extends CliContext<TPackage>,
>(state: RunCliState<TPackage, TContext>): Promise<void> {
  if (!state.context) {
    return;
  }

  const commandName =
    state.commandNames?.join(" ") ??
    state.selectedCommand?.name ??
    state.context.commandName ??
    "none";
  state.context.telemetry.trackEvent(TelemetryEventName.CLI_COMPLETED, {
    command: commandName,
    outcome: state.outcome,
    success: state.errorToHandle === undefined,
  });
  await state.context.telemetry.shutdown();
}

function handleRunnerError<
  TPackage extends string,
  TContext extends CliContext<TPackage>,
>(state: RunCliState<TPackage, TContext>): void {
  if (state.errorToHandle === undefined || !state.context) {
    return;
  }

  state.context.error.handleError(
    state.errorToHandle,
    state.commandNames?.join(" ") ??
      state.selectedCommand?.name ??
      state.context.commandName ??
      "cli"
  );
}

/**
 * Runs the standard Hexbus CLI lifecycle for a command list.
 *
 * @remarks
 * `runCli` intentionally composes the lower-level Hexbus primitives instead of
 * replacing them. Use it for product entrypoints that want the common
 * invocation order, and keep using `createCliContext`, `showHelpMenu`, or the
 * parser helpers directly when a CLI needs bespoke control flow.
 */
export async function runCli<
  TPackage extends string = string,
  TContext extends CliContext<TPackage> = CliContext<TPackage>,
>(options: RunCliOptions<TPackage, TContext>): Promise<void> {
  const rawArgs = options.rawArgs ?? process.argv.slice(2);

  if (await handleVersionRequest(options, rawArgs)) {
    return;
  }

  const state: RunCliState<TPackage, TContext> = { outcome: "completed" };

  try {
    state.context = await createRunnerContext(options, rawArgs);
    state.context.telemetry.trackEvent(TelemetryEventName.CLI_INVOKED, {
      command: state.context.commandName ?? "none",
    });
    startRunnerUpdateCheck(state.context, options);

    if (state.context.flags.help === true) {
      state.outcome = "help";
      showScopedRunnerHelp(state.context, options);
      return;
    }

    const unknownOption = findUnknownCommandOption(state.context);
    if (unknownOption) {
      showRunnerHelp(state.context, options);
      throw new CliError("UNKNOWN_OPTION", { details: unknownOption });
    }

    const result = await dispatchRunnerCommand(state.context, options, rawArgs);
    await applyDispatchResult(result, options, state);
  } catch (error) {
    await trackRunnerError(error, options, state);
  } finally {
    await shutdownRunnerTelemetry(state);
  }

  handleRunnerError(state);
}
