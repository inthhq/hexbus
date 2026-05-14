import { CliError } from "./errors";

/**
 * Boolean flag definition for command-local parsing.
 */
export interface BooleanCommandArgFlagSpec {
  /**
   * Flag aliases accepted by the command.
   */
  names: readonly string[];
  /**
   * Parser behavior for this flag.
   */
  type: "boolean";
  /**
   * Initial value assigned before command arguments are parsed.
   *
   * @default false
   */
  defaultValue?: boolean;
  /**
   * Optional negated spelling that sets the flag to `false`.
   */
  negatedName?: string;
}

/**
 * String flag definition for command-local parsing.
 */
export interface StringCommandArgFlagSpec {
  /**
   * Flag aliases accepted by the command.
   */
  names: readonly string[];
  /**
   * Parser behavior for this flag.
   */
  type: "string";
  /**
   * Initial value assigned before command arguments are parsed.
   */
  defaultValue?: string;
  /**
   * Value hint used by callers when rendering command-local help.
   */
  valueName?: string;
}

/**
 * Flag definition accepted by `parseCommandArgs`.
 */
export type CommandArgFlagSpec =
  | BooleanCommandArgFlagSpec
  | StringCommandArgFlagSpec;

/**
 * Command-local flag spec keyed by the desired result property name.
 */
export type CommandArgFlagSpecRecord = Record<string, CommandArgFlagSpec>;

/**
 * Positional command argument definition.
 */
export interface CommandArgPositionSpec<TName extends string = string> {
  /**
   * Result property name for this positional.
   */
  name: TName;
  /**
   * Whether this positional must be present.
   *
   * @default false
   */
  required?: boolean;
}

/**
 * Command-local parser configuration.
 */
export interface ParseCommandArgsSpec<
  TFlags extends CommandArgFlagSpecRecord = CommandArgFlagSpecRecord,
  TPositionals extends readonly CommandArgPositionSpec[] =
    readonly CommandArgPositionSpec[],
> {
  /**
   * Command-local flags keyed by the desired result property name.
   */
  flags?: TFlags;
  /**
   * Positional arguments accepted by this command, in order.
   */
  positionals?: TPositionals;
}

type CommandArgFlagValue<TFlag extends CommandArgFlagSpec> =
  TFlag extends BooleanCommandArgFlagSpec
    ? boolean
    : TFlag extends { defaultValue: string }
      ? string
      : string | undefined;

type ParsedCommandArgFlags<TFlags extends CommandArgFlagSpecRecord> = {
  [TKey in keyof TFlags]: CommandArgFlagValue<TFlags[TKey]>;
};

type ParsedCommandArgPositionals<
  TPositionals extends readonly CommandArgPositionSpec[],
> = {
  [TPosition in TPositionals[number] as TPosition["name"]]: TPosition extends {
    required: true;
  }
    ? string
    : string | undefined;
};

/**
 * Parsed command-local arguments.
 */
export interface ParseCommandArgsResult<
  TFlags extends CommandArgFlagSpecRecord = CommandArgFlagSpecRecord,
  TPositionals extends readonly CommandArgPositionSpec[] =
    readonly CommandArgPositionSpec[],
> {
  /**
   * Parsed command-local flags keyed by the caller-provided spec keys.
   */
  flags: ParsedCommandArgFlags<TFlags>;
  /**
   * Parsed positional arguments keyed by positional names.
   */
  positionals: ParsedCommandArgPositionals<TPositionals>;
}

interface FlagLookupEntry {
  key: string;
  negated: boolean;
  spec: CommandArgFlagSpec;
}

function describeFlagLookupEntry(entry: FlagLookupEntry): string {
  return entry.negated ? `${entry.key} (negated)` : entry.key;
}

function createParserError(
  code:
    | "FLAG_VALUE_REQUIRED"
    | "POSITIONAL_REQUIRED"
    | "UNEXPECTED_POSITIONAL"
    | "UNKNOWN_OPTION",
  details: string
): CliError {
  return new CliError(code, { details });
}

function addFlagName(
  lookup: Map<string, FlagLookupEntry>,
  name: string,
  entry: FlagLookupEntry
): void {
  const existing = lookup.get(name);
  if (existing) {
    throw new Error(
      `Duplicate flag name "${name}" for ${describeFlagLookupEntry(entry)} conflicts with ${describeFlagLookupEntry(existing)}`
    );
  }

  lookup.set(name, entry);
}

function createFlagLookup(
  flags: CommandArgFlagSpecRecord
): Map<string, FlagLookupEntry> {
  const lookup = new Map<string, FlagLookupEntry>();

  for (const [key, spec] of Object.entries(flags)) {
    for (const name of spec.names) {
      addFlagName(lookup, name, { key, negated: false, spec });
    }

    if (spec.type === "boolean" && spec.negatedName) {
      addFlagName(lookup, spec.negatedName, {
        key,
        negated: true,
        spec,
      });
    }
  }

  return lookup;
}

function createDefaultFlags<TFlags extends CommandArgFlagSpecRecord>(
  flags: TFlags
): ParsedCommandArgFlags<TFlags> {
  const parsedFlags: Record<string, boolean | string | undefined> = {};

  for (const [key, spec] of Object.entries(flags)) {
    parsedFlags[key] =
      spec.type === "boolean"
        ? (spec.defaultValue ?? false)
        : spec.defaultValue;
  }

  return parsedFlags as ParsedCommandArgFlags<TFlags>;
}

function createDefaultPositionals<
  TPositionals extends readonly CommandArgPositionSpec[],
>(positionals: TPositionals): ParsedCommandArgPositionals<TPositionals> {
  const parsedPositionals: Record<string, string | undefined> = {};

  for (const positional of positionals) {
    parsedPositionals[positional.name] = undefined;
  }

  return parsedPositionals as ParsedCommandArgPositionals<TPositionals>;
}

function assignPositionals<
  TPositionals extends readonly CommandArgPositionSpec[],
>(
  values: string[],
  positionals: TPositionals,
  parsedPositionals: ParsedCommandArgPositionals<TPositionals>
): void {
  for (const [index, positional] of positionals.entries()) {
    const value = values[index];
    if (typeof value === "string") {
      parsedPositionals[positional.name as keyof typeof parsedPositionals] =
        value as (typeof parsedPositionals)[keyof typeof parsedPositionals];
      continue;
    }

    if (positional.required) {
      throw createParserError("POSITIONAL_REQUIRED", positional.name);
    }
  }

  const unexpected = values[positionals.length];
  if (typeof unexpected === "string") {
    throw createParserError("UNEXPECTED_POSITIONAL", unexpected);
  }
}

function assignFlagValue<TFlags extends CommandArgFlagSpecRecord>(
  args: readonly string[],
  index: number,
  entry: FlagLookupEntry,
  flagLookup: Map<string, FlagLookupEntry>,
  parsedFlags: ParsedCommandArgFlags<TFlags>
): number {
  if (entry.spec.type === "boolean") {
    parsedFlags[entry.key as keyof ParsedCommandArgFlags<TFlags>] =
      !entry.negated as ParsedCommandArgFlags<TFlags>[keyof ParsedCommandArgFlags<TFlags>];
    return index;
  }

  const nextArg = args[index + 1];
  if (typeof nextArg !== "string" || flagLookup.has(nextArg)) {
    throw createParserError(
      "FLAG_VALUE_REQUIRED",
      entry.spec.names[0] ?? entry.key
    );
  }

  parsedFlags[entry.key as keyof ParsedCommandArgFlags<TFlags>] =
    nextArg as ParsedCommandArgFlags<TFlags>[keyof ParsedCommandArgFlags<TFlags>];
  return index + 1;
}

/**
 * Parses command-local flags and positionals from the provided `args`.
 *
 * @remarks
 * This helper intentionally handles only command-local parsing. Top-level
 * command routing and global flags remain the responsibility of `parseCliArgs`
 * and `createCliContext`.
 *
 * @param args - Explicit array of CLI inputs to parse.
 */
export function parseCommandArgs<
  const TFlags extends CommandArgFlagSpecRecord = Record<never, never>,
  const TPositionals extends readonly CommandArgPositionSpec[] = [],
>(
  args: readonly string[],
  spec: ParseCommandArgsSpec<TFlags, TPositionals> = {}
): ParseCommandArgsResult<TFlags, TPositionals> {
  const flags = (spec.flags ?? {}) as TFlags;
  const positionals = (spec.positionals ?? []) as unknown as TPositionals;
  const flagLookup = createFlagLookup(flags);
  const parsedFlags = createDefaultFlags(flags);
  const positionalValues: string[] = [];

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (typeof arg !== "string") {
      continue;
    }

    if (arg.startsWith("-")) {
      const entry = flagLookup.get(arg);
      if (!entry) {
        throw createParserError("UNKNOWN_OPTION", arg);
      }

      index = assignFlagValue(args, index, entry, flagLookup, parsedFlags);
      continue;
    }

    positionalValues.push(arg);
  }

  const parsedPositionals = createDefaultPositionals(positionals);
  assignPositionals(positionalValues, positionals, parsedPositionals);

  return {
    flags: parsedFlags,
    positionals: parsedPositionals,
  };
}
