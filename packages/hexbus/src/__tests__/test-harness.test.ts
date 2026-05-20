import { describe, expect, it } from "vitest";

import { runCliTest } from "../test-harness";
import type { CliCommand } from "../types";

describe(runCliTest, () => {
  it("captures output and reports the resolved command path", async () => {
    const command: CliCommand = {
      action: (context) => {
        context.logger.info(`args: ${context.commandArgs.join(",")}`);
        return Promise.resolve();
      },
      description: "Review repo",
      hint: "Review",
      label: "Review",
      name: "review",
    };

    const result = await runCliTest({
      args: ["review", "--mode", "server"],
      commands: [command],
    });

    expect(result.commandPath).toStrictEqual(["review"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("args: --mode,server");
    expect(result.type).toBe("command_executed");
  });
});
