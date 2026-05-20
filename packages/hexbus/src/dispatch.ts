import { promptSelect } from "./prompts";
import type { CliCommand, CliCommandAlias, CliContext } from "./types";

type MaybePromise<T> = T | Promise<T>;

const DEFAULT_SELECT_EXIT_VALUE = "__hexbus_exit__";

/**
 * Command lookup options.
 */
export interface FindCommandOptions {
  /**
   * Whether hidden commands can match.
   *
   * @default true
   */
  includeHidden?: boolean;
}

/**
 * Matched command tree route.
 */
export interface CommandRoute<TContext extends CliContext = CliContext> {
  /**
   * Deepest command matched by the route.
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
  /**
   * Positional args left after the command path has been consumed.
   */
  remainingArgs: string[];
  /**
   * Deprecated command aliases encountered while resolving the route.
   */
  warnings: CommandRouteWarning<TContext>[];
}

/**
 * Route warning emitted for compatibility aliases.
 */
export interface CommandRouteWarning<TContext extends CliContext = CliContext> {
  alias: CliCommandAlias;
  command: CliCommand<TContext>;
  type: "deprecated_command_alias";
  usedName: string;
}

interface UnknownCommandRoute<TContext extends CliContext = CliContext> {
  commandName: string;
  commandPath: CliCommand<TContext>[];
  commandNames: string[];
  commands: CliCommand<TContext>[];
}

type ResolveCommandRouteResult<TContext extends CliContext = CliContext> =
  | {
      route: CommandRoute<TContext>;
      type: "matched";
    }
  | {
      type: "unknown";
      unknown: UnknownCommandRoute<TContext>;
    }
  | {
      type: "none";
    };

/**
 * Options passed when dispatch reaches a registered command.
 */
export interface DispatchCommandHookOptions<
  TContext extends CliContext = CliContext,
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
 * Options passed when dispatch catches a command failure.
 */
export interface DispatchCommandFailureHookOptions<
  TContext extends CliContext = CliContext,
> extends DispatchCommandHookOptions<TContext> {
  /**
   * Error thrown by the command action or command hooks.
   */
  error: unknown;
}

/**
 * Options passed when the invocation contains an unknown command-like
 * positional.
 */
export interface DispatchUnknownCommandOptions<
  TContext extends CliContext = CliContext,
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
   * Unknown command name read from `context.commandName`, the first command arg
   * left by `parseCliArgs`, or an unmatched nested subcommand segment.
   */
  commandName: string;
  /**
   * Matched parent command path before the unknown segment, if any.
   */
  commandPath: CliCommand<TContext>[];
  /**
   * Matched parent command names before the unknown segment, if any.
   */
  commandNames: string[];
}

/**
 * Options passed when no command was provided.
 */
export interface DispatchNoCommandOptions<
  TContext extends CliContext = CliContext,
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
   * Parent command path whose subcommands are being requested.
   */
  commandPath: CliCommand<TContext>[];
  /**
   * Parent command names whose subcommands are being requested.
   */
  commandNames: string[];
}

/**
 * Options passed around the interactive command menu lifecycle.
 */
export interface DispatchSelectionHookOptions<
  TContext extends CliContext = CliContext,
> extends DispatchNoCommandOptions<TContext> {
  /**
   * Why command selection opened.
   */
  reason: "no_command" | "subcommand_required";
}

/**
 * Options passed after the interactive command menu closes.
 */
export interface DispatchSelectionCloseHookOptions<
  TContext extends CliContext = CliContext,
> extends DispatchSelectionHookOptions<TContext> {
  /**
   * Menu result.
   */
  result: SelectCommandResult<TContext>;
}

/**
 * Hook points for command dispatch behavior.
 */
export interface DispatchCommandHooks<
  TContext extends CliContext = CliContext,
> {
  /**
   * Runs before a matched command action.
   */
  onCommandStart?: (
    options: DispatchCommandHookOptions<TContext>
  ) => MaybePromise<void>;
  /**
   * Runs after a command action resolves successfully.
   */
  onCommandSuccess?: (
    options: DispatchCommandHookOptions<TContext>
  ) => MaybePromise<void>;
  /**
   * Runs after a command action or command hook throws.
   */
  onCommandFailure?: (
    options: DispatchCommandFailureHookOptions<TContext>
  ) => MaybePromise<void>;
  /**
   * Runs when the invocation contains an unknown command-like positional.
   */
  onUnknownCommand?: (
    options: DispatchUnknownCommandOptions<TContext>
  ) => MaybePromise<void>;
  /**
   * Runs when the invocation contains no command.
   */
  onNoCommand?: (
    options: DispatchNoCommandOptions<TContext>
  ) => MaybePromise<void>;
  /**
   * Runs before the interactive command menu opens.
   */
  onSelectionOpen?: (
    options: DispatchSelectionHookOptions<TContext>
  ) => MaybePromise<void>;
  /**
   * Runs after the interactive command menu closes.
   */
  onSelectionClose?: (
    options: DispatchSelectionCloseHookOptions<TContext>
  ) => MaybePromise<void>;
}

/**
 * Interactive command selection options.
 */
export interface SelectCommandOptions {
  /**
   * Prompt message shown above the command menu.
   *
   * @default "Select a command"
   */
  message?: string;
  /**
   * Optional telemetry stage attached to command-menu prompt interactions.
   *
   * @default "command-menu"
   */
  stage?: string;
  /**
   * Whether hidden commands should appear in the menu.
   *
   * @default false
   */
  includeHidden?: boolean;
  /**
   * Whether to add an explicit exit option.
   *
   * @default true
   */
  includeExit?: boolean;
  /**
   * Label for the explicit exit option.
   *
   * @default "Exit"
   */
  exitLabel?: string;
  /**
   * Hint for the explicit exit option.
   */
  exitHint?: string;
  /**
   * Internal value used for the explicit exit option.
   *
   * @default "__hexbus_exit__"
   */
  exitValue?: string;
}

/**
 * Result of an interactive command menu.
 */
export type SelectCommandResult<TContext extends CliContext = CliContext> =
  | {
      command: CliCommand<TContext>;
      type: "selected";
    }
  | {
      type: "cancelled";
    }
  | {
      type: "exited";
    };

/**
 * Unknown-command behavior.
 */
export interface DispatchUnknownCommandBehavior<
  TContext extends CliContext = CliContext,
> {
  /**
   * Optional callback for rendering errors, help, or telemetry around an
   * unknown command.
   */
  action?: (
    options: DispatchUnknownCommandOptions<TContext>
  ) => MaybePromise<void>;
}

/**
 * Configures what dispatch does when no command is selected.
 */
export type DispatchNoCommandBehavior<
  TContext extends CliContext = CliContext,
> =
  | {
      /**
       * Run a help callback when no command is present.
       */
      mode?: "help";
      /**
       * Callback for rendering help or other no-command guidance.
       */
      action?: (
        options: DispatchNoCommandOptions<TContext>
      ) => MaybePromise<void>;
    }
  | {
      /**
       * Open an interactive command menu when no command is present.
       */
      mode: "interactive";
      /**
       * Command menu configuration.
       */
      selection?: SelectCommandOptions;
    }
  | {
      /**
       * Delegate no-command behavior to the caller.
       */
      mode: "custom";
      /**
       * Custom no-command callback.
       */
      action: (
        options: DispatchNoCommandOptions<TContext>
      ) => MaybePromise<void>;
    };

/**
 * Command dispatch options.
 */
export interface DispatchCommandOptions<
  TContext extends CliContext = CliContext,
> {
  /**
   * Whether dispatch should invoke matched command actions.
   *
   * @default true
   */
  execute?: boolean;
  /**
   * Unknown-command behavior.
   */
  unknownCommand?: DispatchUnknownCommandBehavior<TContext>;
  /**
   * No-command behavior.
   *
   * @default { mode: "help" }
   */
  noCommand?: DispatchNoCommandBehavior<TContext>;
  /**
   * Dispatch lifecycle hooks.
   */
  hooks?: DispatchCommandHooks<TContext>;
}

/**
 * Result of command dispatch.
 */
export type DispatchCommandResult<TContext extends CliContext = CliContext> =
  | {
      command: CliCommand<TContext>;
      commandPath: CliCommand<TContext>[];
      commandNames: string[];
      type: "command_executed";
    }
  | {
      command: CliCommand<TContext>;
      commandPath: CliCommand<TContext>[];
      commandNames: string[];
      type: "command_selected";
    }
  | {
      command: CliCommand<TContext>;
      commandPath: CliCommand<TContext>[];
      commandNames: string[];
      error: unknown;
      type: "command_failed";
    }
  | {
      commandName: string;
      commandPath: CliCommand<TContext>[];
      commandNames: string[];
      type: "unknown_command";
    }
  | {
      type: "no_command_help";
    }
  | {
      type: "no_command_custom";
    }
  | {
      type: "selection_cancelled";
    }
  | {
      type: "selection_exited";
    };

function getSelectableCommands<TContext extends CliContext>(
  commands: CliCommand<TContext>[],
  options: Pick<SelectCommandOptions, "includeHidden"> = {}
): CliCommand<TContext>[] {
  if (options.includeHidden === true) {
    return commands;
  }
  return commands.filter((command) => !command.hidden);
}

function getUnknownCommandName<TContext extends CliContext>(
  context: TContext
): string | undefined {
  if (typeof context.commandName === "string") {
    return context.commandName;
  }

  const [firstArg] = context.commandArgs;
  return typeof firstArg === "string" ? firstArg : undefined;
}

function getCommandNames<TContext extends CliContext>(
  commandPath: CliCommand<TContext>[]
): string[] {
  return commandPath.map((command) => command.name);
}

function createRoutedContext<TContext extends CliContext>(
  context: TContext,
  route: CommandRoute<TContext>
): TContext {
  const [commandName] = route.commandNames;
  const isSameContext =
    context.commandName === commandName &&
    context.commandArgs === route.remainingArgs;

  if (isSameContext) {
    return context;
  }

  return {
    ...context,
    commandArgs: route.remainingArgs,
    commandName,
  };
}

function hasSubcommandToken(value: string | undefined): value is string {
  return typeof value === "string" && !value.startsWith("-");
}

function getCommandAlias<TContext extends CliContext>(
  command: CliCommand<TContext>,
  commandName: string
): CliCommandAlias | undefined {
  return command.aliases?.find((alias) => alias.name === commandName);
}

function matchesCommandName<TContext extends CliContext>(
  command: CliCommand<TContext>,
  commandName: string
): boolean {
  return (
    command.name === commandName ||
    getCommandAlias(command, commandName) !== undefined
  );
}

function getAliasWarning<TContext extends CliContext>(
  command: CliCommand<TContext>,
  commandName: string
): CommandRouteWarning<TContext> | undefined {
  const alias = getCommandAlias(command, commandName);
  if (!alias?.deprecated) {
    return undefined;
  }

  return {
    alias,
    command,
    type: "deprecated_command_alias",
    usedName: commandName,
  };
}

function renderAliasWarning<TContext extends CliContext>(
  warning: CommandRouteWarning<TContext>
): string {
  const replacement = warning.alias.replacement ?? warning.command.name;
  return `Command "${warning.usedName}" is deprecated. Use "${replacement}" instead.`;
}

/**
 * Finds a command by name.
 *
 * @remarks
 * Hidden commands match by default so CLIs can keep direct, documented escape
 * hatches while excluding hidden commands from menus and help output.
 */
export function findCommand<TContext extends CliContext>(
  commands: CliCommand<TContext>[],
  commandName: string | undefined,
  options: FindCommandOptions = {}
): CliCommand<TContext> | undefined {
  if (!commandName) {
    return undefined;
  }

  const includeHidden = options.includeHidden ?? true;
  return commands.find(
    (command) =>
      matchesCommandName(command, commandName) &&
      (includeHidden || !command.hidden)
  );
}

function resolveCommandRouteState<TContext extends CliContext>(
  context: TContext,
  commands: CliCommand<TContext>[]
): ResolveCommandRouteResult<TContext> {
  const command = findCommand(commands, context.commandName);

  if (!command) {
    const unknownCommandName = getUnknownCommandName(context);
    if (!unknownCommandName) {
      return { type: "none" };
    }

    return {
      type: "unknown",
      unknown: {
        commandName: unknownCommandName,
        commandNames: [],
        commandPath: [],
        commands,
      },
    };
  }

  const commandPath = [command];
  const warnings: CommandRouteWarning<TContext>[] = [];
  const topLevelWarning = getAliasWarning(command, context.commandName ?? "");
  if (topLevelWarning) {
    warnings.push(topLevelWarning);
  }
  let currentCommand = command;
  let remainingArgs = context.commandArgs;

  while (currentCommand.subcommands && currentCommand.subcommands.length > 0) {
    const [nextArg] = remainingArgs;

    if (!hasSubcommandToken(nextArg)) {
      break;
    }

    const subcommand = findCommand(currentCommand.subcommands, nextArg);
    if (!subcommand) {
      return {
        type: "unknown",
        unknown: {
          commandName: nextArg,
          commandNames: getCommandNames(commandPath),
          commandPath,
          commands: currentCommand.subcommands,
        },
      };
    }

    commandPath.push(subcommand);
    const warning = getAliasWarning(subcommand, nextArg);
    if (warning) {
      warnings.push(warning);
    }
    currentCommand = subcommand;
    remainingArgs = remainingArgs.slice(1);
  }

  return {
    route: {
      command: currentCommand,
      commandNames: getCommandNames(commandPath),
      commandPath,
      remainingArgs,
      warnings,
    },
    type: "matched",
  };
}

async function runCommand<TContext extends CliContext>(
  context: TContext,
  route: CommandRoute<TContext>,
  options: DispatchCommandOptions<TContext>
): Promise<DispatchCommandResult<TContext>> {
  const commandContext = createRoutedContext(context, route);
  const { command, commandNames, commandPath } = route;
  const { action } = command;

  try {
    await options.hooks?.onCommandStart?.({
      command,
      commandNames,
      commandPath,
      context: commandContext,
    });

    if (options.execute === false) {
      return { command, commandNames, commandPath, type: "command_selected" };
    }

    if (!action) {
      return { command, commandNames, commandPath, type: "command_selected" };
    }

    for (const warning of route.warnings) {
      commandContext.logger.warn(renderAliasWarning(warning));
    }

    await action(commandContext);
    await options.hooks?.onCommandSuccess?.({
      command,
      commandNames,
      commandPath,
      context: commandContext,
    });
    return { command, commandNames, commandPath, type: "command_executed" };
  } catch (error) {
    await options.hooks?.onCommandFailure?.({
      command,
      commandNames,
      commandPath,
      context: commandContext,
      error,
    });
    return {
      command,
      commandNames,
      commandPath,
      error,
      type: "command_failed",
    };
  }
}

/**
 * Resolves the deepest matching command route for a parsed CLI context.
 */
export function resolveCommandRoute<TContext extends CliContext>(
  context: TContext,
  commands: CliCommand<TContext>[]
): CommandRoute<TContext> | undefined {
  const result = resolveCommandRouteState(context, commands);
  return result.type === "matched" ? result.route : undefined;
}

/**
 * Opens an interactive command menu from command metadata.
 */
export async function selectCommand<TContext extends CliContext>(
  _context: TContext,
  commands: CliCommand<TContext>[],
  options: SelectCommandOptions = {}
): Promise<SelectCommandResult<TContext>> {
  const selectableCommands = getSelectableCommands(commands, options);
  const includeExit = options.includeExit ?? true;
  const exitValue = options.exitValue ?? DEFAULT_SELECT_EXIT_VALUE;
  const promptOptions: {
    hint?: string;
    label: string;
    value: string;
  }[] = selectableCommands.map((command) => ({
    hint: command.hint,
    label: command.label,
    value: command.name,
  }));

  if (includeExit) {
    promptOptions.push({
      hint: options.exitHint,
      label: options.exitLabel ?? "Exit",
      value: exitValue,
    });
  }

  if (promptOptions.length === 0) {
    return { type: "exited" };
  }

  const result = await promptSelect({
    cancel: "silent",
    message: options.message ?? "Select a command",
    options: promptOptions,
    stage: options.stage ?? "command-menu",
    telemetry: _context.telemetry,
  });

  if (result === undefined) {
    return { type: "cancelled" };
  }

  if (result === exitValue) {
    return { type: "exited" };
  }

  const command = findCommand(commands, result, {
    includeHidden: options.includeHidden ?? false,
  });

  if (!command) {
    return { type: "cancelled" };
  }

  return { command, type: "selected" };
}

async function runNoCommand<TContext extends CliContext>(
  context: TContext,
  commands: CliCommand<TContext>[],
  options: DispatchCommandOptions<TContext>,
  commandPath: CliCommand<TContext>[] = [],
  reason: DispatchSelectionHookOptions<TContext>["reason"] = "no_command"
): Promise<DispatchCommandResult<TContext>> {
  const commandNames = getCommandNames(commandPath);
  const noCommandOptions = {
    commandNames,
    commandPath,
    commands,
    context,
  };

  await options.hooks?.onNoCommand?.(noCommandOptions);

  const behavior = options.noCommand ?? { mode: "help" as const };

  if (behavior.mode === "custom") {
    await behavior.action(noCommandOptions);
    return { type: "no_command_custom" };
  }

  if (behavior.mode === "interactive") {
    await options.hooks?.onSelectionOpen?.({
      commandNames,
      commandPath,
      commands,
      context,
      reason,
    });
    const selection = await selectCommand(
      context,
      commands,
      behavior.selection
    );
    await options.hooks?.onSelectionClose?.({
      commandNames,
      commandPath,
      commands,
      context,
      reason,
      result: selection,
    });

    if (selection.type === "cancelled") {
      return { type: "selection_cancelled" };
    }

    if (selection.type === "exited") {
      return { type: "selection_exited" };
    }

    const selectedRoute = {
      command: selection.command,
      commandNames: [...commandNames, selection.command.name],
      commandPath: [...commandPath, selection.command],
      remainingArgs: [],
      warnings: [],
    };

    if (!selection.command.action) {
      return runNoCommand(
        createRoutedContext(context, selectedRoute),
        selection.command.subcommands ?? [],
        options,
        selectedRoute.commandPath,
        "subcommand_required"
      );
    }

    return runCommand(context, selectedRoute, options);
  }

  await behavior.action?.(noCommandOptions);
  return { type: "no_command_help" };
}

/**
 * Dispatches a parsed CLI context to a command action or configured fallback.
 */
export async function dispatchCommand<TContext extends CliContext>(
  context: TContext,
  commands: CliCommand<TContext>[],
  options: DispatchCommandOptions<TContext> = {}
): Promise<DispatchCommandResult<TContext>> {
  const routeResult = resolveCommandRouteState(context, commands);
  if (routeResult.type === "matched") {
    if (!routeResult.route.command.action) {
      return runNoCommand(
        createRoutedContext(context, routeResult.route),
        routeResult.route.command.subcommands ?? [],
        options,
        routeResult.route.commandPath,
        "subcommand_required"
      );
    }

    return runCommand(context, routeResult.route, options);
  }

  if (routeResult.type === "unknown") {
    const { unknown } = routeResult;
    await options.hooks?.onUnknownCommand?.({
      commandName: unknown.commandName,
      commandNames: unknown.commandNames,
      commandPath: unknown.commandPath,
      commands: unknown.commands,
      context,
    });
    await options.unknownCommand?.action?.({
      commandName: unknown.commandName,
      commandNames: unknown.commandNames,
      commandPath: unknown.commandPath,
      commands: unknown.commands,
      context,
    });
    return {
      commandName: unknown.commandName,
      commandNames: unknown.commandNames,
      commandPath: unknown.commandPath,
      type: "unknown_command",
    };
  }

  return runNoCommand(context, commands, options);
}
