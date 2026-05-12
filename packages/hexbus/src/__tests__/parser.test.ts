import { describe, expect, it } from "vitest";

import {
  getFlagValue,
  hasFlag,
  parseCliArgs,
  parseSubcommand,
} from "../parser";
import type { CliCommand } from "../types";

const commands: CliCommand[] = [
  {
    action: async () => {},
    description: "Set up the project",
    hint: "Set up the project",
    label: "Setup",
    name: "setup",
  },
];

describe(parseCliArgs, () => {
  it("parses commands, flags, and command args", () => {
    const parsed = parseCliArgs(
      ["setup", "--logger", "debug", "--force", "extra"],
      commands
    );

    expect(parsed.commandName).toBe("setup");
    expect(parsed.commandArgs).toStrictEqual(["extra"]);
    expect(getFlagValue(parsed.parsedFlags, "logger")).toBe("debug");
    expect(hasFlag(parsed.parsedFlags, "force")).toBeTruthy();
  });

  it("parses no-color as a global flag", () => {
    const parsed = parseCliArgs(["setup", "--no-color"], commands);

    expect(parsed.commandName).toBe("setup");
    expect(parsed.commandArgs).toStrictEqual([]);
    expect(hasFlag(parsed.parsedFlags, "no-color")).toBeTruthy();
  });

  it("parses color as a global flag", () => {
    const parsed = parseCliArgs(["setup", "--color"], commands);

    expect(parsed.commandName).toBe("setup");
    expect(parsed.commandArgs).toStrictEqual([]);
    expect(hasFlag(parsed.parsedFlags, "color")).toBeTruthy();
  });

  it("parses caller-provided global flags", () => {
    const parsed = parseCliArgs(
      ["setup", "--resume", "--logger", "debug"],
      commands,
      [
        {
          defaultValue: false,
          description: "Resume a previous run",
          expectsValue: false,
          names: ["--resume"],
          type: "boolean",
        },
      ]
    );

    expect(parsed.commandName).toBe("setup");
    expect(parsed.commandArgs).toStrictEqual([]);
    expect(hasFlag(parsed.parsedFlags, "resume")).toBeTruthy();
    expect(getFlagValue(parsed.parsedFlags, "logger")).toBe("debug");
  });

  it("parses negative numbers as flag values", () => {
    const parsed = parseCliArgs(["setup", "--logger", "-1"], commands);

    expect(parsed.commandName).toBe("setup");
    expect(getFlagValue(parsed.parsedFlags, "logger")).toBe("-1");
  });

  it("parses subcommands", () => {
    const result = parseSubcommand(
      ["list", "--json"],
      [
        {
          action: async () => {},
          description: "List items",
          hint: "List items",
          label: "List",
          name: "list",
        },
      ]
    );

    expect(result.subcommand?.name).toBe("list");
    expect(result.remainingArgs).toStrictEqual(["--json"]);
  });
});
