import { describe, expect, expectTypeOf, it } from "vitest";

import { parseCommandArgs } from "../command-args";
import { CliError } from "../errors";

function captureCliError(action: () => unknown): CliError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(CliError);
    return error as CliError;
  }

  throw new Error("Expected action to throw CliError");
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

  it("parses optional string flags with bare, equals, and next-arg values", () => {
    const bare = parseCommandArgs(["--reinvestigate", "--limit", "1"], {
      flags: {
        limit: { names: ["--limit"], type: "string" },
        reinvestigate: {
          names: ["--reinvestigate"],
          type: "optional-string",
        },
      },
    } as const);
    const equals = parseCommandArgs(["--reinvestigate=2"], {
      flags: {
        reinvestigate: {
          names: ["--reinvestigate"],
          type: "optional-string",
        },
      },
    } as const);
    const nextArg = parseCommandArgs(["--reinvestigate", "3"], {
      flags: {
        reinvestigate: {
          names: ["--reinvestigate"],
          type: "optional-string",
        },
      },
    } as const);

    expect(bare.flags.limit).toBe("1");
    expect(bare.flags.reinvestigate).toBe(true);
    expect(equals.flags.reinvestigate).toBe("2");
    expect(nextArg.flags.reinvestigate).toBe("3");
    expectTypeOf(bare.flags.reinvestigate).toEqualTypeOf<
      string | true | undefined
    >();
  });

  it("leaves equals-form parsing opt-in for optional string flags", () => {
    const error = captureCliError(() =>
      parseCommandArgs(["--ref=main"], {
        flags: {
          ref: {
            names: ["--ref"],
            type: "string",
          },
        },
      } as const)
    );

    expect(error.code).toBe("UNKNOWN_OPTION");
    expect(error.context?.details).toBe("--ref=main");
  });

  it("throws for missing required positionals", () => {
    const error = captureCliError(() =>
      parseCommandArgs([], {
        positionals: [{ name: "name", required: true }],
      } as const)
    );

    expect(error.code).toBe("POSITIONAL_REQUIRED");
    expect(error.context?.details).toBe("name");
  });

  it("throws for unknown options", () => {
    const error = captureCliError(() => parseCommandArgs(["--wat"], {}));

    expect(error.code).toBe("UNKNOWN_OPTION");
    expect(error.context?.details).toBe("--wat");
  });

  it("throws for missing string flag values", () => {
    const error = captureCliError(() =>
      parseCommandArgs(["--git"], {
        flags: {
          git: {
            names: ["--git"],
            type: "string",
          },
        },
      } as const)
    );

    expect(error.code).toBe("FLAG_VALUE_REQUIRED");
    expect(error.context?.details).toBe("--git");
  });

  it("throws for string flag values followed by another known flag", () => {
    const error = captureCliError(() =>
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
      } as const)
    );

    expect(error.code).toBe("FLAG_VALUE_REQUIRED");
    expect(error.context?.details).toBe("--git");
  });

  it("throws for unexpected extra positionals", () => {
    const error = captureCliError(() =>
      parseCommandArgs(["src/index.ts", "extra"], {
        positionals: [{ name: "path" }],
      } as const)
    );

    expect(error.code).toBe("UNEXPECTED_POSITIONAL");
    expect(error.context?.details).toBe("extra");
  });

  it("throws for duplicate flag aliases", () => {
    expect(() =>
      parseCommandArgs([], {
        flags: {
          debug: {
            names: ["--dev"],
            type: "boolean",
          },
          dev: {
            names: ["--dev"],
            type: "boolean",
          },
        },
      } as const)
    ).toThrow(
      /Duplicate flag name "--dev" for (debug|dev) conflicts with (debug|dev)/
    );
  });

  it("throws for duplicate negated flag names", () => {
    expect(() =>
      parseCommandArgs([], {
        flags: {
          cache: {
            names: ["--cache"],
            negatedName: "--no",
            type: "boolean",
          },
          save: {
            names: ["--save"],
            negatedName: "--no",
            type: "boolean",
          },
        },
      } as const)
    ).toThrow(
      /Duplicate flag name "--no" for (cache|save) \(negated\) conflicts with (cache|save) \(negated\)/
    );
  });
});
