import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CreateContextOptions } from "../context";
import type { CliCommand, CliContext, CliFlag, Telemetry } from "../types";

const mocks = vi.hoisted(() => ({
  createCliContext: vi.fn(),
  displayIntro: vi.fn(),
  isVersionRequest: vi.fn(),
  printVersionInfo: vi.fn(),
  showHelpMenu: vi.fn(),
  startBackgroundUpdateCheck: vi.fn(),
}));

vi.mock("../context", () => ({
  createCliContext: mocks.createCliContext,
}));

vi.mock("../help", () => ({
  showHelpMenu: mocks.showHelpMenu,
}));

vi.mock("../intro", () => ({
  displayIntro: mocks.displayIntro,
}));

vi.mock("../version-check", () => ({
  isVersionRequest: mocks.isVersionRequest,
  printVersionInfo: mocks.printVersionInfo,
  startBackgroundUpdateCheck: mocks.startBackgroundUpdateCheck,
}));

const { runCli } = await import("../runner");
const { TelemetryEventName } = await import("../telemetry");

function createTelemetry(): Telemetry {
  return {
    flush: vi.fn(() => Promise.resolve()),
    flushBackground: vi.fn(),
    flushSync: vi.fn(),
    isDisabled: vi.fn(() => false),
    shutdown: vi.fn(() => Promise.resolve()),
    trackCommand: vi.fn(),
    trackError: vi.fn(),
    trackEvent: vi.fn(),
  };
}

function createContext(overrides: Partial<CliContext> = {}): CliContext {
  const telemetry = createTelemetry();
  return {
    commandArgs: [],
    commandName: undefined,
    config: {
      getPathAliases: vi.fn(() => null),
      loadConfig: vi.fn(() => Promise.resolve(null)),
      requireConfig: vi.fn(() => Promise.reject(new Error("missing config"))),
    },
    confirm: vi.fn(() => Promise.resolve(true)),
    cwd: "/repo",
    error: {
      handleCancel: vi.fn(() => {
        throw new Error("cancelled");
      }),
      handleError: vi.fn(() => {
        throw new Error("handled");
      }),
    },
    flags: {},
    framework: {
      framework: null,
      frameworkVersion: null,
      hasReact: false,
      pkg: null,
      reactVersion: null,
      tailwindVersion: null,
    },
    fs: {
      exists: vi.fn(() => Promise.resolve(false)),
      getPackageInfo: vi.fn(() => ({ name: "test", version: "0.0.0" })),
      mkdir: vi.fn(() => Promise.resolve()),
      read: vi.fn(() => Promise.resolve("")),
      write: vi.fn(() => Promise.resolve()),
    },
    logger: {
      debug: vi.fn(),
      error: vi.fn(),
      failed: vi.fn(() => {
        throw new Error("failed");
      }),
      info: vi.fn(),
      message: vi.fn(),
      note: vi.fn(),
      outro: vi.fn(),
      step: vi.fn(),
      success: vi.fn(),
      warn: vi.fn(),
    },
    packageManager: {
      addCommand: "npm install",
      execCommand: "npx",
      installCommand: "npm install",
      name: "npm",
      runCommand: "npm run",
    },
    projectRoot: "/repo",
    telemetry,
    ...overrides,
  };
}

const packageInfo = {
  name: "@scope/test-cli",
  version: "1.2.3",
};

describe(runCli, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isVersionRequest.mockReturnValue(false);
    mocks.printVersionInfo.mockImplementation(() => Promise.resolve());
    mocks.displayIntro.mockImplementation(() => Promise.resolve());
    mocks.createCliContext.mockImplementation((options: CreateContextOptions) =>
      Promise.resolve(createContext({ commandName: options.rawArgs[0] }))
    );
  });

  it("uses the fast version path before context creation", async () => {
    mocks.isVersionRequest.mockReturnValue(true);

    await runCli({
      appName: "test-cli",
      commands: [],
      packageInfo,
      rawArgs: ["--version"],
    });

    expect(mocks.printVersionInfo).toHaveBeenCalledWith({
      appName: "test-cli",
      currentVersion: "1.2.3",
      packageName: "@scope/test-cli",
    });
    expect(mocks.createCliContext).not.toHaveBeenCalled();
  });

  it("renders help and shuts down telemetry for help requests", async () => {
    const context = createContext({ flags: { help: true } });
    mocks.createCliContext.mockResolvedValue(context);

    await runCli({
      appName: "test-cli",
      commands: [],
      packageInfo,
      rawArgs: ["--help"],
    });

    expect(mocks.showHelpMenu).toHaveBeenCalledWith(
      context,
      { appName: "test-cli", docsUrl: undefined, version: "1.2.3" },
      [],
      expect.any(Array)
    );
    expect(mocks.displayIntro).not.toHaveBeenCalled();
    expect(context.telemetry.trackEvent).toHaveBeenCalledWith(
      TelemetryEventName.HELP_DISPLAYED,
      { command: "none" }
    );
    expect(context.telemetry.shutdown).toHaveBeenCalledOnce();
  });

  it("dispatches a matched command with lifecycle hooks", async () => {
    const action = vi.fn((baseContext: CliContext) => {
      void baseContext;
      return Promise.resolve();
    });
    const command: CliCommand = {
      action,
      description: "Say hello",
      hint: "Say hello",
      label: "Hello",
      name: "hello",
    };
    const context = createContext({
      commandArgs: ["world"],
      commandName: "hello",
      flags: { logger: "debug" },
    });
    const afterContext = vi.fn(() => context);
    const beforeCommand = vi.fn();
    const afterCommand = vi.fn();
    mocks.createCliContext.mockResolvedValue(context);

    await runCli({
      appName: "test-cli",
      commands: [command],
      hooks: {
        afterCommand,
        afterContext,
        beforeCommand,
      },
      intro: { tagline: "A test CLI" },
      packageInfo,
      rawArgs: ["hello", "world"],
    });

    expect(mocks.createCliContext).toHaveBeenCalledWith({
      appName: "test-cli",
      commands: [command],
      rawArgs: ["hello", "world"],
    });
    expect(afterContext).toHaveBeenCalledWith(context);
    expect(mocks.startBackgroundUpdateCheck).toHaveBeenCalledWith({
      appName: "test-cli",
      currentVersion: "1.2.3",
      logger: context.logger,
      packageName: "@scope/test-cli",
    });
    expect(mocks.displayIntro).toHaveBeenCalledWith(context, {
      appName: "test-cli",
      tagline: "A test CLI",
      version: "1.2.3",
    });
    expect(context.telemetry.trackCommand).toHaveBeenCalledWith(
      "hello",
      ["world"],
      { logger: "debug" }
    );
    expect(beforeCommand).toHaveBeenCalledWith({
      command,
      commandNames: ["hello"],
      commandPath: [command],
      context,
    });
    expect(action).toHaveBeenCalledWith(context);
    expect(afterCommand).toHaveBeenCalledWith({
      command,
      commandNames: ["hello"],
      commandPath: [command],
      context,
      result: undefined,
    });
    expect(context.telemetry.trackEvent).toHaveBeenCalledWith(
      TelemetryEventName.COMMAND_SUCCEEDED,
      { command: "hello" }
    );
    expect(context.telemetry.shutdown).toHaveBeenCalledOnce();
  });

  it("passes the same telemetry instance through context, hooks, and command actions", async () => {
    const action = vi.fn((baseContext: CliContext) => {
      void baseContext;
      return Promise.resolve();
    });
    const command: CliCommand = {
      action,
      description: "Share telemetry",
      hint: "Share",
      label: "Share",
      name: "share",
    };
    const context = createContext({
      commandName: "share",
    });
    const afterContext = vi.fn((baseContext: CliContext) => baseContext);
    const beforeCommand = vi.fn();
    const afterCommand = vi.fn();
    mocks.createCliContext.mockResolvedValue(context);

    await runCli({
      appName: "test-cli",
      commands: [command],
      hooks: {
        afterCommand,
        afterContext,
        beforeCommand,
      },
      packageInfo,
      rawArgs: ["share"],
    });

    expect(afterContext).toHaveBeenCalled();
    const afterContextArg = afterContext.mock.calls[0]?.[0];
    expect(afterContextArg?.telemetry).toBe(context.telemetry);

    expect(beforeCommand).toHaveBeenCalled();
    const beforeCommandArg = beforeCommand.mock.calls[0]?.[0] as
      | { context: CliContext }
      | undefined;
    expect(beforeCommandArg?.context.telemetry).toBe(context.telemetry);

    expect(action).toHaveBeenCalled();
    const actionArg = action.mock.calls[0]?.[0];
    expect(actionArg?.telemetry).toBe(context.telemetry);

    expect(afterCommand).toHaveBeenCalled();
    const afterCommandArg = afterCommand.mock.calls[0]?.[0] as
      | { context: CliContext }
      | undefined;
    expect(afterCommandArg?.context.telemetry).toBe(context.telemetry);
  });

  it("dispatches nested commands and tracks the command path", async () => {
    const action = vi.fn(() => Promise.resolve());
    const migrateCommand: CliCommand = {
      action,
      description: "Run migrations",
      hint: "Migrate",
      label: "Migrate",
      name: "migrate",
    };
    const toolsCommand: CliCommand = {
      description: "Developer tools",
      hint: "Tools",
      label: "Tools",
      name: "tools",
      subcommands: [migrateCommand],
    };
    const context = createContext({
      commandArgs: ["migrate", "prod"],
      commandName: "tools",
    });
    const beforeCommand = vi.fn();
    const afterCommand = vi.fn();
    mocks.createCliContext.mockResolvedValue(context);

    await runCli({
      appName: "test-cli",
      commands: [toolsCommand],
      hooks: {
        afterCommand,
        beforeCommand,
      },
      packageInfo,
      rawArgs: ["tools", "migrate", "prod"],
    });

    expect(context.telemetry.trackCommand).toHaveBeenCalledWith(
      "tools migrate",
      ["prod"],
      context.flags
    );
    expect(beforeCommand).toHaveBeenCalledWith({
      command: migrateCommand,
      commandNames: ["tools", "migrate"],
      commandPath: [toolsCommand, migrateCommand],
      context: expect.objectContaining({
        commandArgs: ["prod"],
        commandName: "tools",
      }),
    });
    expect(action).toHaveBeenCalledWith(
      expect.objectContaining({
        commandArgs: ["prod"],
        commandName: "tools",
      })
    );
    expect(afterCommand).toHaveBeenCalledWith({
      command: migrateCommand,
      commandNames: ["tools", "migrate"],
      commandPath: [toolsCommand, migrateCommand],
      context: expect.objectContaining({
        commandArgs: ["prod"],
        commandName: "tools",
      }),
      result: undefined,
    });
    expect(context.telemetry.trackEvent).toHaveBeenCalledWith(
      TelemetryEventName.COMMAND_SUCCEEDED,
      { command: "tools migrate" }
    );
  });

  it("renders scoped help for command groups", async () => {
    const migrateCommand: CliCommand = {
      action: vi.fn(() => Promise.resolve()),
      description: "Run migrations",
      hint: "Migrate",
      label: "Migrate",
      name: "migrate",
    };
    const toolsCommand: CliCommand = {
      description: "Developer tools",
      hint: "Tools",
      label: "Tools",
      name: "tools",
      subcommands: [migrateCommand],
    };
    const context = createContext({
      commandArgs: [],
      commandName: "tools",
      flags: { help: true },
    });
    mocks.createCliContext.mockResolvedValue(context);

    await runCli({
      appName: "test-cli",
      commands: [toolsCommand],
      packageInfo,
      rawArgs: ["tools", "--help"],
    });

    expect(mocks.showHelpMenu).toHaveBeenCalledWith(
      context,
      {
        appName: "test-cli",
        commandPath: ["tools"],
        docsUrl: undefined,
        version: "1.2.3",
      },
      [migrateCommand],
      expect.any(Array)
    );
    expect(context.telemetry.trackEvent).toHaveBeenCalledWith(
      TelemetryEventName.HELP_DISPLAYED,
      { command: "tools" }
    );
  });

  it("tracks unknown commands and falls back to help", async () => {
    const context = createContext({
      commandArgs: ["missing"],
      commandName: undefined,
    });
    mocks.createCliContext.mockResolvedValue(context);

    await runCli({
      appName: "test-cli",
      commands: [],
      packageInfo,
      rawArgs: ["missing"],
    });

    expect(context.telemetry.trackEvent).toHaveBeenCalledWith(
      TelemetryEventName.COMMAND_UNKNOWN,
      { command: "missing" }
    );
    expect(mocks.showHelpMenu).toHaveBeenCalledOnce();
    expect(context.telemetry.shutdown).toHaveBeenCalledOnce();
  });

  it("tracks unknown nested commands and falls back to scoped help", async () => {
    const migrateCommand: CliCommand = {
      action: vi.fn(() => Promise.resolve()),
      description: "Run migrations",
      hint: "Migrate",
      label: "Migrate",
      name: "migrate",
    };
    const toolsCommand: CliCommand = {
      description: "Developer tools",
      hint: "Tools",
      label: "Tools",
      name: "tools",
      subcommands: [migrateCommand],
    };
    const context = createContext({
      commandArgs: ["missing"],
      commandName: "tools",
    });
    mocks.createCliContext.mockResolvedValue(context);

    await runCli({
      appName: "test-cli",
      commands: [toolsCommand],
      packageInfo,
      rawArgs: ["tools", "missing"],
    });

    expect(context.telemetry.trackEvent).toHaveBeenCalledWith(
      TelemetryEventName.COMMAND_UNKNOWN,
      { command: "tools missing" }
    );
    expect(mocks.showHelpMenu).toHaveBeenCalledWith(
      context,
      {
        appName: "test-cli",
        commandPath: ["tools"],
        docsUrl: undefined,
        version: "1.2.3",
      },
      [migrateCommand],
      expect.any(Array)
    );
    expect(context.telemetry.shutdown).toHaveBeenCalledOnce();
  });

  it("supports custom no-command behavior", async () => {
    const context = createContext();
    const action = vi.fn(() => Promise.resolve());
    mocks.createCliContext.mockResolvedValue(context);

    await runCli({
      appName: "test-cli",
      commands: [],
      noCommand: { action, mode: "custom" },
      packageInfo,
      rawArgs: [],
    });

    expect(action).toHaveBeenCalledWith({
      commandNames: [],
      commandPath: [],
      commands: [],
      context,
      packageInfo,
      rawArgs: [],
    });
    expect(mocks.showHelpMenu).not.toHaveBeenCalled();
    expect(context.telemetry.shutdown).toHaveBeenCalledOnce();
  });

  it("shuts down telemetry before rendering command errors", async () => {
    const error = new Error("boom");
    const command: CliCommand = {
      action: vi.fn(() => Promise.reject(error)),
      description: "Explode",
      hint: "Explode",
      label: "Explode",
      name: "explode",
    };
    const context = createContext({ commandName: "explode" });
    const onError = vi.fn();
    mocks.createCliContext.mockResolvedValue(context);

    await expect(
      runCli({
        appName: "test-cli",
        commands: [command],
        hooks: { onError },
        packageInfo,
        rawArgs: ["explode"],
      })
    ).rejects.toThrow("handled");

    expect(context.telemetry.trackEvent).toHaveBeenCalledWith(
      TelemetryEventName.COMMAND_FAILED,
      {
        command: "explode",
        errorMessage: "boom",
        errorName: "Error",
      }
    );
    expect(context.telemetry.trackError).toHaveBeenCalledWith(error, "explode");
    expect(onError).toHaveBeenCalledWith({
      command,
      commandNames: ["explode"],
      context,
      error,
    });
    expect(context.telemetry.shutdown).toHaveBeenCalledOnce();
    expect(context.error.handleError).toHaveBeenCalledWith(error, "explode");
    expect(
      vi.mocked(context.telemetry.shutdown).mock.invocationCallOrder[0]
    ).toBeLessThan(
      vi.mocked(context.error.handleError).mock.invocationCallOrder[0]
    );
  });

  it("forwards context flags to parsing and help rendering", async () => {
    const extraFlag: CliFlag = {
      defaultValue: false,
      description: "Resume a previous run",
      expectsValue: false,
      names: ["--resume"],
      type: "boolean",
    };
    const context = createContext({ flags: { help: true } });
    mocks.createCliContext.mockResolvedValue(context);

    await runCli({
      appName: "test-cli",
      commands: [],
      context: { globalFlags: [extraFlag] },
      packageInfo,
      rawArgs: ["--help"],
      updateCheck: false,
    });

    expect(mocks.createCliContext).toHaveBeenCalledWith({
      appName: "test-cli",
      commands: [],
      globalFlags: [extraFlag],
      rawArgs: ["--help"],
    });
    expect(mocks.startBackgroundUpdateCheck).not.toHaveBeenCalled();
    expect(mocks.showHelpMenu).toHaveBeenCalledWith(
      context,
      expect.any(Object),
      [],
      expect.arrayContaining([extraFlag])
    );
  });
});
