import { describe, expect, expectTypeOf, it } from "vitest";

import { parseCommandArgs } from "../command-args";
import { CliError } from "../errors";

function expectCliError(
  action: () => unknown,
  code: string,
  details: string
): void {
  expect(action).toThrow(CliError);

  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(CliError);
    const cliError = error as CliError;
    expect(cliError.code).toBe(code);
    expect(cliError.context?.details).toBe(details);
  }
}

describe(parseCommandArgs, () => {
  it("parses add-style required positionals, aliases, strings, and negated booleans", () => {
    const args = parseCommandArgs(
      [
        "react",
        "-D",
        "--git",
        "https://github.com/acme/react.git",
        "--ref",
        "main",
        "--no-save",
      ],
      {
        flags: {
          dev: {
            defaultValue: false,
            names: ["-D", "--dev"],
            type: "boolean",
          },
          git: {
            names: ["--git"],
            type: "string",
            valueName: "url",
          },
          ref: {
            names: ["--ref"],
            type: "string",
            valueName: "ref",
          },
          save: {
            defaultValue: true,
            names: ["--save"],
            negatedName: "--no-save",
            type: "boolean",
          },
        },
        positionals: [{ name: "name", required: true }],
      } as const
    );

    expect(args.positionals.name).toBe("react");
    expect(args.flags.dev).toBe(true);
    expect(args.flags.git).toBe("https://github.com/acme/react.git");
    expect(args.flags.ref).toBe("main");
    expect(args.flags.save).toBe(false);
    expectTypeOf(args.positionals.name).toEqualTypeOf<string>();
    expectTypeOf(args.flags.dev).toEqualTypeOf<boolean>();
    expectTypeOf(args.flags.git).toEqualTypeOf<string | undefined>();
  });

  it("applies defaults and supports positive boolean forms", () => {
    const args = parseCommandArgs(["react", "--save"], {
      flags: {
        save: {
          defaultValue: false,
          names: ["--save"],
          negatedName: "--no-save",
          type: "boolean",
        },
      },
      positionals: [{ name: "name", required: true }],
    } as const);

    expect(args.positionals.name).toBe("react");
    expect(args.flags.save).toBe(true);
  });

  it("parses sync-style local force flags for caller-owned global merging", () => {
    const args = parseCommandArgs(["--force"], {
      flags: {
        force: {
          defaultValue: false,
          names: ["--force"],
          type: "boolean",
        },
      },
    } as const);
    const globalForce = true;

    expect(args.flags.force).toBe(true);
    expect(args.flags.force || globalForce).toBe(true);
  });

  it("parses patch-style optional zero-or-one positionals", () => {
    const withoutPath = parseCommandArgs([], {
      positionals: [{ name: "path" }],
    } as const);
    const withPath = parseCommandArgs(["src/index.ts"], {
      positionals: [{ name: "path" }],
    } as const);

    expect(withoutPath.positionals.path).toBeUndefined();
    expect(withPath.positionals.path).toBe("src/index.ts");
    expectTypeOf(withoutPath.positionals.path).toEqualTypeOf<
      string | undefined
    >();
  });

  it("accepts negative numbers as string flag values", () => {
    const args = parseCommandArgs(["--ref", "-1"], {
      flags: {
        ref: {
          names: ["--ref"],
          type: "string",
        },
      },
    } as const);

    expect(args.flags.ref).toBe("-1");
  });

  it("throws for missing required positionals", () => {
    expectCliError(
      () =>
        parseCommandArgs([], {
          positionals: [{ name: "name", required: true }],
        } as const),
      "POSITIONAL_REQUIRED",
      "name"
    );
  });

  it("throws for unknown options", () => {
    expectCliError(
      () => parseCommandArgs(["--wat"], {}),
      "UNKNOWN_OPTION",
      "--wat"
    );
  });

  it("throws for missing string flag values", () => {
    expectCliError(
      () =>
        parseCommandArgs(["--git"], {
          flags: {
            git: {
              names: ["--git"],
              type: "string",
            },
          },
        } as const),
      "FLAG_VALUE_REQUIRED",
      "--git"
    );
  });

  it("throws for string flag values followed by another known flag", () => {
    expectCliError(
      () =>
        parseCommandArgs(["--git", "--dev"], {
          flags: {
            dev: {
              names: ["--dev"],
              type: "boolean",
            },
            git: {
              names: ["--git"],
              type: "string",
            },
          },
        } as const),
      "FLAG_VALUE_REQUIRED",
      "--git"
    );
  });

  it("throws for unexpected extra positionals", () => {
    expectCliError(
      () =>
        parseCommandArgs(["src/index.ts", "extra"], {
          positionals: [{ name: "path" }],
        } as const),
      "UNEXPECTED_POSITIONAL",
      "extra"
    );
  });
});
