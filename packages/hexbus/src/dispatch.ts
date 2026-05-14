import * as p from "@clack/prompts";

import type { CliCommand, CliContext } from "./types";

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
   * Unknown command name read from `context.commandName` or the first command
   * arg left by `parseCliArgs`.
   */
  commandName: string;
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
  reason: "no_command";
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
      type: "command_executed";
    }
  | {
      command: CliCommand<TContext>;
      type: "command_selected";
    }
  | {
      command: CliCommand<TContext>;
      error: unknown;
      type: "command_failed";
    }
  | {
      commandName: string;
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

async function runCommand<TContext extends CliContext>(
  context: TContext,
  command: CliCommand<TContext>,
  options: DispatchCommandOptions<TContext>
): Promise<DispatchCommandResult<TContext>> {
  try {
    await options.hooks?.onCommandStart?.({ command, context });

    if (options.execute === false) {
      return { command, type: "command_selected" };
    }

    await command.action(context);
    await options.hooks?.onCommandSuccess?.({ command, context });
    return { command, type: "command_executed" };
  } catch (error) {
    await options.hooks?.onCommandFailure?.({ command, context, error });
    return { command, error, type: "command_failed" };
  }
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
      command.name === commandName && (includeHidden || !command.hidden)
  );
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

  const result = await p.select({
    message: options.message ?? "Select a command",
    options: promptOptions,
  });

  if (p.isCancel(result)) {
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
  options: DispatchCommandOptions<TContext>
): Promise<DispatchCommandResult<TContext>> {
  await options.hooks?.onNoCommand?.({ commands, context });

  const behavior = options.noCommand ?? { mode: "help" as const };

  if (behavior.mode === "custom") {
    await behavior.action({ commands, context });
    return { type: "no_command_custom" };
  }

  if (behavior.mode === "interactive") {
    await options.hooks?.onSelectionOpen?.({
      commands,
      context,
      reason: "no_command",
    });
    const selection = await selectCommand(
      context,
      commands,
      behavior.selection
    );
    await options.hooks?.onSelectionClose?.({
      commands,
      context,
      reason: "no_command",
      result: selection,
    });

    if (selection.type === "cancelled") {
      return { type: "selection_cancelled" };
    }

    if (selection.type === "exited") {
      return { type: "selection_exited" };
    }

    return runCommand(context, selection.command, options);
  }

  await behavior.action?.({ commands, context });
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
  const command = findCommand(commands, context.commandName);
  if (command) {
    return runCommand(context, command, options);
  }

  const unknownCommandName = getUnknownCommandName(context);
  if (unknownCommandName) {
    await options.hooks?.onUnknownCommand?.({
      commandName: unknownCommandName,
      commands,
      context,
    });
    await options.unknownCommand?.action?.({
      commandName: unknownCommandName,
      commands,
      context,
    });
    return {
      commandName: unknownCommandName,
      type: "unknown_command",
    };
  }

  return runNoCommand(context, commands, options);
}
