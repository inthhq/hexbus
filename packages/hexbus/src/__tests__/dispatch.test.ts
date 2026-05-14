import { beforeEach, describe, expect, it, vi } from "vitest";

import { createTestContext } from "../context";
import type { CliCommand } from "../types";

const promptMocks = vi.hoisted(() => ({
  isCancel: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@clack/prompts", () => ({
  isCancel: promptMocks.isCancel,
  select: promptMocks.select,
}));

const { dispatchCommand, findCommand, selectCommand } =
  await import("../dispatch");

function createCommand(
  name: string,
  action = vi.fn(() => Promise.resolve()),
  overrides: Partial<CliCommand> = {}
): CliCommand {
  return {
    action,
    description: `${name} command`,
    hint: `Run ${name}`,
    label: name,
    name,
    ...overrides,
  };
}

describe(findCommand, () => {
  it("finds hidden commands by default but can exclude them", () => {
    const hiddenCommand = createCommand("internal", undefined, {
      hidden: true,
    });
    const commands = [hiddenCommand];

    expect(findCommand(commands, "internal")).toBe(hiddenCommand);
    expect(
      findCommand(commands, "internal", { includeHidden: false })
    ).toBeUndefined();
  });
});

describe(selectCommand, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    promptMocks.isCancel.mockReturnValue(false);
  });

  it("selects visible commands and excludes hidden commands by default", async () => {
    const visibleCommand = createCommand("visible");
    const hiddenCommand = createCommand("hidden", undefined, {
      hidden: true,
    });
    promptMocks.select.mockResolvedValue("visible");

    const result = await selectCommand(createTestContext(), [
      visibleCommand,
      hiddenCommand,
    ]);

    expect(result).toStrictEqual({
      command: visibleCommand,
      type: "selected",
    });
    expect(promptMocks.select).toHaveBeenCalledWith({
      message: "Select a command",
      options: [
        {
          hint: "Run visible",
          label: "visible",
          value: "visible",
        },
        {
          hint: undefined,
          label: "Exit",
          value: "__hexbus_exit__",
        },
      ],
    });
  });

  it("returns exited when the configured exit option is selected", async () => {
    promptMocks.select.mockResolvedValue("quit");

    const result = await selectCommand(createTestContext(), [], {
      exitLabel: "Quit",
      exitValue: "quit",
    });

    expect(result).toStrictEqual({ type: "exited" });
    expect(promptMocks.select).toHaveBeenCalledWith({
      message: "Select a command",
      options: [
        {
          hint: undefined,
          label: "Quit",
          value: "quit",
        },
      ],
    });
  });

  it("returns cancelled when the prompt is cancelled", async () => {
    const cancel = Symbol("cancel");
    promptMocks.select.mockResolvedValue(cancel);
    promptMocks.isCancel.mockImplementation((value) => value === cancel);

    const result = await selectCommand(createTestContext(), [
      createCommand("visible"),
    ]);

    expect(result).toStrictEqual({ type: "cancelled" });
  });
});

describe(dispatchCommand, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    promptMocks.isCancel.mockReturnValue(false);
  });

  it("dispatches a matched command and runs success hooks in order", async () => {
    const events: string[] = [];
    const action = vi.fn(() => {
      events.push("action");
      return Promise.resolve();
    });
    const command = createCommand("hello", action);
    const context = createTestContext({ commandName: "hello" });

    const result = await dispatchCommand(context, [command], {
      hooks: {
        onCommandStart: () => {
          events.push("start");
        },
        onCommandSuccess: () => {
          events.push("success");
        },
      },
    });

    expect(result).toStrictEqual({
      command,
      commandNames: ["hello"],
      commandPath: [command],
      type: "command_executed",
    });
    expect(action).toHaveBeenCalledWith(context);
    expect(events).toStrictEqual(["start", "action", "success"]);
  });

  it("dispatches hidden commands when invoked directly", async () => {
    const action = vi.fn(() => Promise.resolve());
    const command = createCommand("internal", action, { hidden: true });
    const context = createTestContext({ commandName: "internal" });

    const result = await dispatchCommand(context, [command]);

    expect(result).toStrictEqual({
      command,
      commandNames: ["internal"],
      commandPath: [command],
      type: "command_executed",
    });
    expect(action).toHaveBeenCalledOnce();
  });

  it("returns unknown command results after callbacks", async () => {
    const onUnknownCommand = vi.fn();
    const action = vi.fn(() => Promise.resolve());
    const context = createTestContext({ commandArgs: ["missing"] });

    const result = await dispatchCommand(context, [], {
      hooks: { onUnknownCommand },
      unknownCommand: { action },
    });

    const expectedOptions = {
      commandName: "missing",
      commandNames: [],
      commandPath: [],
      commands: [],
      context,
    };
    expect(onUnknownCommand).toHaveBeenCalledWith(expectedOptions);
    expect(action).toHaveBeenCalledWith(expectedOptions);
    expect(result).toStrictEqual({
      commandName: "missing",
      commandNames: [],
      commandPath: [],
      type: "unknown_command",
    });
  });

  it("runs no-command help callbacks", async () => {
    const action = vi.fn(() => Promise.resolve());
    const onNoCommand = vi.fn();
    const context = createTestContext();

    const result = await dispatchCommand(context, [], {
      hooks: { onNoCommand },
      noCommand: { action, mode: "help" },
    });

    expect(onNoCommand).toHaveBeenCalledWith({
      commandNames: [],
      commandPath: [],
      commands: [],
      context,
    });
    expect(action).toHaveBeenCalledWith({
      commandNames: [],
      commandPath: [],
      commands: [],
      context,
    });
    expect(result).toStrictEqual({ type: "no_command_help" });
  });

  it("runs custom no-command callbacks", async () => {
    const action = vi.fn(() => Promise.resolve());
    const context = createTestContext();

    const result = await dispatchCommand(context, [], {
      noCommand: { action, mode: "custom" },
    });

    expect(action).toHaveBeenCalledWith({
      commandNames: [],
      commandPath: [],
      commands: [],
      context,
    });
    expect(result).toStrictEqual({ type: "no_command_custom" });
  });

  it("dispatches a command selected interactively", async () => {
    const action = vi.fn(() => Promise.resolve());
    const visibleCommand = createCommand("visible", action);
    const hiddenCommand = createCommand("hidden", undefined, {
      hidden: true,
    });
    const context = createTestContext();
    const onSelectionClose = vi.fn();
    const onSelectionOpen = vi.fn();
    promptMocks.select.mockResolvedValue("visible");

    const result = await dispatchCommand(
      context,
      [visibleCommand, hiddenCommand],
      {
        hooks: {
          onSelectionClose,
          onSelectionOpen,
        },
        noCommand: {
          mode: "interactive",
          selection: {
            message: "Choose a command",
          },
        },
      }
    );

    expect(promptMocks.select).toHaveBeenCalledWith({
      message: "Choose a command",
      options: [
        {
          hint: "Run visible",
          label: "visible",
          value: "visible",
        },
        {
          hint: undefined,
          label: "Exit",
          value: "__hexbus_exit__",
        },
      ],
    });
    expect(action).toHaveBeenCalledWith(
      expect.objectContaining({
        commandArgs: [],
        commandName: "visible",
      })
    );
    expect(onSelectionOpen).toHaveBeenCalledWith({
      commandNames: [],
      commandPath: [],
      commands: [visibleCommand, hiddenCommand],
      context,
      reason: "no_command",
    });
    expect(onSelectionClose).toHaveBeenCalledWith({
      commandNames: [],
      commandPath: [],
      commands: [visibleCommand, hiddenCommand],
      context,
      reason: "no_command",
      result: {
        command: visibleCommand,
        type: "selected",
      },
    });
    expect(result).toStrictEqual({
      command: visibleCommand,
      commandNames: ["visible"],
      commandPath: [visibleCommand],
      type: "command_executed",
    });
  });

  it("returns selection exit and cancellation results", async () => {
    const command = createCommand("visible");
    const context = createTestContext();
    promptMocks.select.mockResolvedValueOnce("quit");

    const exitResult = await dispatchCommand(context, [command], {
      noCommand: {
        mode: "interactive",
        selection: {
          exitValue: "quit",
        },
      },
    });

    const cancel = Symbol("cancel");
    promptMocks.select.mockResolvedValueOnce(cancel);
    promptMocks.isCancel.mockImplementation((value) => value === cancel);

    const cancelResult = await dispatchCommand(context, [command], {
      noCommand: { mode: "interactive" },
    });

    expect(exitResult).toStrictEqual({ type: "selection_exited" });
    expect(cancelResult).toStrictEqual({ type: "selection_cancelled" });
  });

  it("returns command failures and runs failure hooks", async () => {
    const error = new Error("boom");
    const command = createCommand("explode", () => Promise.reject(error));
    const context = createTestContext({ commandName: "explode" });
    const onCommandFailure = vi.fn(() => Promise.resolve());

    const result = await dispatchCommand(context, [command], {
      hooks: { onCommandFailure },
    });

    expect(onCommandFailure).toHaveBeenCalledWith({
      command,
      commandNames: ["explode"],
      commandPath: [command],
      context,
      error,
    });
    expect(result).toStrictEqual({
      command,
      commandNames: ["explode"],
      commandPath: [command],
      error,
      type: "command_failed",
    });
  });

  it("can select without executing command actions", async () => {
    const action = vi.fn(() => Promise.resolve());
    const command = createCommand("hello", action);
    const context = createTestContext({ commandName: "hello" });

    const result = await dispatchCommand(context, [command], {
      execute: false,
    });

    expect(result).toStrictEqual({
      command,
      commandNames: ["hello"],
      commandPath: [command],
      type: "command_selected",
    });
    expect(action).not.toHaveBeenCalled();
  });

  it("dispatches nested subcommands with only remaining args", async () => {
    const action = vi.fn(() => Promise.resolve());
    const migrateCommand = createCommand("migrate", action);
    const toolsCommand = createCommand("tools", undefined, {
      action: undefined,
      subcommands: [migrateCommand],
    });
    const context = createTestContext({
      commandArgs: ["migrate", "prod"],
      commandName: "tools",
    });

    const result = await dispatchCommand(context, [toolsCommand]);

    expect(result).toStrictEqual({
      command: migrateCommand,
      commandNames: ["tools", "migrate"],
      commandPath: [toolsCommand, migrateCommand],
      type: "command_executed",
    });
    expect(action).toHaveBeenCalledWith(
      expect.objectContaining({
        commandArgs: ["prod"],
        commandName: "tools",
      })
    );
  });

  it("returns unknown command results for missing nested subcommands", async () => {
    const migrateCommand = createCommand("migrate");
    const toolsCommand = createCommand("tools", undefined, {
      action: undefined,
      subcommands: [migrateCommand],
    });
    const context = createTestContext({
      commandArgs: ["missing"],
      commandName: "tools",
    });
    const onUnknownCommand = vi.fn();
    const action = vi.fn(() => Promise.resolve());

    const result = await dispatchCommand(context, [toolsCommand], {
      hooks: { onUnknownCommand },
      unknownCommand: { action },
    });

    const expectedOptions = {
      commandName: "missing",
      commandNames: ["tools"],
      commandPath: [toolsCommand],
      commands: [migrateCommand],
      context,
    };
    expect(onUnknownCommand).toHaveBeenCalledWith(expectedOptions);
    expect(action).toHaveBeenCalledWith(expectedOptions);
    expect(result).toStrictEqual({
      commandName: "missing",
      commandNames: ["tools"],
      commandPath: [toolsCommand],
      type: "unknown_command",
    });
  });

  it("can select nested subcommands interactively", async () => {
    const action = vi.fn(() => Promise.resolve());
    const migrateCommand = createCommand("migrate", action);
    const hiddenCommand = createCommand("internal", undefined, {
      hidden: true,
    });
    const toolsCommand = createCommand("tools", undefined, {
      action: undefined,
      subcommands: [migrateCommand, hiddenCommand],
    });
    const context = createTestContext({ commandName: "tools" });
    const onSelectionClose = vi.fn();
    const onSelectionOpen = vi.fn();
    promptMocks.select.mockResolvedValue("migrate");

    const result = await dispatchCommand(context, [toolsCommand], {
      hooks: {
        onSelectionClose,
        onSelectionOpen,
      },
      noCommand: {
        mode: "interactive",
      },
    });

    expect(promptMocks.select).toHaveBeenCalledWith({
      message: "Select a command",
      options: [
        {
          hint: "Run migrate",
          label: "migrate",
          value: "migrate",
        },
        {
          hint: undefined,
          label: "Exit",
          value: "__hexbus_exit__",
        },
      ],
    });
    expect(onSelectionOpen).toHaveBeenCalledWith({
      commandNames: ["tools"],
      commandPath: [toolsCommand],
      commands: [migrateCommand, hiddenCommand],
      context,
      reason: "subcommand_required",
    });
    expect(onSelectionClose).toHaveBeenCalledWith({
      commandNames: ["tools"],
      commandPath: [toolsCommand],
      commands: [migrateCommand, hiddenCommand],
      context,
      reason: "subcommand_required",
      result: {
        command: migrateCommand,
        type: "selected",
      },
    });
    expect(result).toStrictEqual({
      command: migrateCommand,
      commandNames: ["tools", "migrate"],
      commandPath: [toolsCommand, migrateCommand],
      type: "command_executed",
    });
    expect(action).toHaveBeenCalledWith(
      expect.objectContaining({
        commandArgs: [],
        commandName: "tools",
      })
    );
  });

  it("can select nested subcommands without executing actions", async () => {
    const action = vi.fn(() => Promise.resolve());
    const migrateCommand = createCommand("migrate", action);
    const toolsCommand = createCommand("tools", undefined, {
      action: undefined,
      subcommands: [migrateCommand],
    });
    const context = createTestContext({
      commandArgs: ["migrate"],
      commandName: "tools",
    });

    const result = await dispatchCommand(context, [toolsCommand], {
      execute: false,
    });

    expect(result).toStrictEqual({
      command: migrateCommand,
      commandNames: ["tools", "migrate"],
      commandPath: [toolsCommand, migrateCommand],
      type: "command_selected",
    });
    expect(action).not.toHaveBeenCalled();
  });
});
