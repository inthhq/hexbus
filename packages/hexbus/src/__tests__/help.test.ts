import { describe, expect, it, vi } from "vitest";

import { showHelpMenu } from "../help";
import type { CliCommand, CliLogger } from "../types";

function createLogger() {
  return {
    logger: {
      note: vi.fn(),
    } as unknown as CliLogger,
  };
}

describe(showHelpMenu, () => {
  it("renders inherited flags, command flags, positionals, and global flags", () => {
    const context = createLogger();
    const commands: CliCommand[] = [
      {
        description: "Scan project",
        hint: "Scan",
        label: "Scan",
        name: "scan",
      },
    ];

    showHelpMenu(
      context,
      {
        appName: "amberline",
        commandPath: ["stage", "scan"],
        inheritedArgs: {
          flags: {
            projectId: {
              defaultDescription: "from amberline.config.ts",
              description: "Project id",
              names: ["--project-id"],
              type: "string",
              valueName: "id",
            },
          },
        },
        localArgs: {
          flags: {
            limit: {
              description: "Maximum findings",
              names: ["--limit"],
              type: "integer",
              valueName: "n",
            },
          },
          positionals: [
            {
              description: "Path to scan",
              name: "path",
              required: true,
            },
          ],
        },
        version: "1.0.0",
      },
      commands,
      [
        {
          description: "Show help",
          expectsValue: false,
          names: ["--help"],
          type: "special",
        },
      ]
    );

    const message = vi.mocked(context.logger.note).mock.calls[0]?.[0];
    expect(message).toContain("Inherited Flags:");
    expect(message).toContain("--project-id <id>");
    expect(message).toContain("default: from amberline.config.ts");
    expect(message).toContain("Command Flags:");
    expect(message).toContain("--limit <n>");
    expect(message).toContain("Positionals:");
    expect(message).toContain("<path>");
    expect(message).toContain("Global Flags:");
  });
});
