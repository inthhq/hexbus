import { defineCommandArgs, parseCommandArgs } from "./command-args";

/**
 * Conventional output modes for product CLIs.
 */
export type OutputMode = "human" | "json" | "quiet";

/**
 * Reusable command-local output flags.
 */
export const outputModeArgs = defineCommandArgs({
  flags: {
    json: {
      description: "Render machine-readable JSON output",
      names: ["--json"],
      type: "boolean",
    },
    quiet: {
      description: "Suppress human progress output",
      names: ["--quiet", "-q"],
      type: "boolean",
    },
  },
} as const);

/**
 * Parses conventional output mode flags from command-local args.
 */
export function parseOutputMode(args: readonly string[]): OutputMode {
  const parsed = parseCommandArgs(args, outputModeArgs, { passthrough: true });
  if (parsed.flags.quiet) {
    return "quiet";
  }
  if (parsed.flags.json) {
    return "json";
  }
  return "human";
}

/**
 * Returns whether human progress UI should render for an output mode.
 */
export function shouldRenderHumanProgress(mode: OutputMode): boolean {
  return mode === "human";
}

/**
 * Returns whether structured machine output was requested.
 */
export function shouldRenderJson(mode: OutputMode): boolean {
  return mode === "json";
}
