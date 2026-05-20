import { describe, expect, it } from "vitest";

import { generateCompletion } from "../completions";
import type { CliCommand } from "../types";

describe(generateCompletion, () => {
  it("generates static completions from command trees and arg specs", () => {
    const commands: CliCommand[] = [
      {
        description: "Stage work",
        hint: "Stage",
        inheritedArgs: {
          flags: {
            projectId: { names: ["--project-id"], type: "string" },
          },
        },
        label: "Stage",
        name: "stage",
        subcommands: [
          {
            args: {
              flags: {
                limit: { names: ["--limit"], type: "integer" },
              },
            },
            description: "Scan",
            hint: "Scan",
            label: "Scan",
            name: "scan",
          },
        ],
      },
    ];

    const completion = generateCompletion({
      appName: "amberline",
      commands,
      globalFlags: [
        {
          description: "Help",
          expectsValue: false,
          names: ["--help", "-h"],
          type: "special",
        },
      ],
      shell: "bash",
    });

    expect(completion).toContain("complete -F _amberline_completion amberline");
    expect(completion).toContain("''");
    expect(completion).toContain("'stage'");
    expect(completion).toContain("scan");
    expect(completion).toContain("--project-id");
    expect(completion).toContain("--limit");
    expect(completion).toContain("--help");
  });
});
