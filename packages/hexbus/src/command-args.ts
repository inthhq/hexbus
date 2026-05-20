import { CliError } from "./errors";

const NUMBER_TOKEN_PATTERN = /^-\d+(\.\d+)?$/;
const DURATION_TOKEN_PATTERN = /^(\d+)(ms|s|m|h)$/;

/**
 * Metadata for aliases that remain accepted while callers migrate users to a
 * newer command or flag spelling.
 */
export interface DeprecatedAlias {
  /**
   * Deprecated command or flag spelling.
   */
  name: string;
  /**
   * Preferred replacement shown in warnings and generated documentation.
   */
  replacement?: string;
}

/**
 * Runtime default passed to `parseCommandArgs`.
 */
export interface CommandArgDefault<TValue = CommandArgValue> {
  /**
   * Value used when the command line omits this argument.
   */
  value: TValue;
  /**
   * Human-readable source label used by help or plan output.
   */
  source?: string;
  /**
   * Fully rendered default label. Takes precedence over `source` when both are
   * provided.
   */
  description?: string;
}

export type CommandArgValue =
  | boolean
  | number
  | string
  | string[]
  | true
  | undefined;

interface CommandArgFlagBaseSpec {
  /**
   * Flag aliases accepted by the command.
   */
  names: readonly string[];
  /**
   * Human-readable explanation shown in command-local help.
   */
  description?: string;
  /**
   * Deprecated aliases still accepted for compatibility.
   */
  deprecatedNames?: readonly DeprecatedAlias[];
  /**
   * Default label rendered by command-local help.
   */
  defaultDescription?: string;
  /**
   * Value hint used by callers when rendering command-local help.
   */
  valueName?: string;
}

/**
 * Boolean flag definition for command-local parsing.
 */
export interface BooleanCommandArgFlagSpec extends CommandArgFlagBaseSpec {
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
export interface StringCommandArgFlagSpec extends CommandArgFlagBaseSpec {
  /**
   * Parser behavior for this flag.
   */
  type: "string";
  /**
   * Initial value assigned before command arguments are parsed.
   */
  defaultValue?: string;
}

/**
 * Optional string flag definition for command-local parsing.
 */
export interface OptionalStringCommandArgFlagSpec extends CommandArgFlagBaseSpec {
  /**
   * Parser behavior for this flag.
   */
  type: "optional-string";
  /**
   * Initial value assigned before command arguments are parsed.
   */
  defaultValue?: string | true;
}

/**
 * Integer flag definition for command-local parsing.
 */
export interface IntegerCommandArgFlagSpec extends CommandArgFlagBaseSpec {
  /**
   * Parser behavior for this flag.
   */
  type: "integer";
  /**
   * Initial value assigned before command arguments are parsed.
   */
  defaultValue?: number;
  /**
   * Minimum allowed value.
   */
  min?: number;
  /**
   * Maximum allowed value.
   */
  max?: number;
}

/**
 * Duration flag definition for command-local parsing.
 *
 * @remarks
 * Duration values are parsed into milliseconds from `<n>ms`, `<n>s`, `<n>m`,
 * or `<n>h`.
 */
export interface DurationCommandArgFlagSpec extends CommandArgFlagBaseSpec {
  /**
   * Parser behavior for this flag.
   */
  type: "duration";
  /**
   * Initial value assigned before command arguments are parsed, in
   * milliseconds.
   */
  defaultValue?: number;
}

/**
 * Enum flag definition for command-local parsing.
 */
export interface EnumCommandArgFlagSpec<
  TValues extends readonly string[] = readonly string[],
> extends CommandArgFlagBaseSpec {
  /**
   * Parser behavior for this flag.
   */
  type: "enum";
  /**
   * Allowed values.
   */
  values: TValues;
  /**
   * Initial value assigned before command arguments are parsed.
   */
  defaultValue?: TValues[number];
}

/**
 * Delimited string-list flag definition for command-local parsing.
 */
export interface StringListCommandArgFlagSpec extends CommandArgFlagBaseSpec {
  /**
   * Parser behavior for this flag.
   */
  type: "string-list";
  /**
   * Initial value assigned before command arguments are parsed.
   */
  defaultValue?: readonly string[];
  /**
   * Separator used to split the provided value.
   *
   * @default ","
   */
  separator?: string;
}

/**
 * Flag definition accepted by `parseCommandArgs`.
 */
export type CommandArgFlagSpec =
  | BooleanCommandArgFlagSpec
  | DurationCommandArgFlagSpec
  | EnumCommandArgFlagSpec
  | IntegerCommandArgFlagSpec
  | StringCommandArgFlagSpec
  | StringListCommandArgFlagSpec
  | OptionalStringCommandArgFlagSpec;

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
  /**
   * Human-readable explanation shown in command-local help.
   */
  description?: string;
  /**
   * Value hint shown in usage/help output.
   */
  valueName?: string;
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

/**
 * Warning emitted while parsing compatibility aliases.
 */
export interface CommandArgWarning {
  /**
   * Stable warning code.
   */
  code: "DEPRECATED_FLAG_ALIAS";
  /**
   * Deprecated spelling used by the caller.
   */
  name: string;
  /**
   * Preferred replacement, when known.
   */
  replacement?: string;
  /**
   * Result key assigned by the parser.
   */
  key: string;
}

/**
 * Options for command-local parsing.
 */
export interface ParseCommandArgsOptions<
  TFlags extends CommandArgFlagSpecRecord,
> {
  /**
   * Runtime defaults keyed by flag result name.
   */
  defaults?: Partial<{
    [TKey in keyof TFlags]:
      | CommandArgDefault<CommandArgFlagValue<TFlags[TKey]>>
      | CommandArgFlagValue<TFlags[TKey]>;
  }>;
  /**
   * Whether `--` starts a passthrough tail preserved for child commands.
   *
   * @default false
   */
  passthrough?: boolean;
  /**
   * Optional warning callback for deprecated aliases.
   */
  onWarning?: (warning: CommandArgWarning) => void;
}

export type CommandArgFlagValue<TFlag extends CommandArgFlagSpec> =
  TFlag extends BooleanCommandArgFlagSpec
    ? boolean
    : TFlag extends IntegerCommandArgFlagSpec | DurationCommandArgFlagSpec
      ? TFlag extends { defaultValue: number }
        ? number
        : number | undefined
      : TFlag extends EnumCommandArgFlagSpec<infer TValues>
        ? TFlag extends { defaultValue: string }
          ? TValues[number]
          : TValues[number] | undefined
        : TFlag extends StringListCommandArgFlagSpec
          ? string[]
          : TFlag extends OptionalStringCommandArgFlagSpec
            ? TFlag extends { defaultValue: string | true }
              ? string | true
              : string | true | undefined
            : TFlag extends { defaultValue: string }
              ? string
              : string | undefined;

export type ParsedCommandArgFlags<TFlags extends CommandArgFlagSpecRecord> = {
  [TKey in keyof TFlags]: CommandArgFlagValue<TFlags[TKey]>;
};

export type ParsedCommandArgPositionals<
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
  /**
   * Arguments after `--` when passthrough parsing is enabled.
   */
  passthrough: string[];
}

interface FlagLookupEntry {
  key: string;
  deprecated?: DeprecatedAlias;
  negated: boolean;
  spec: CommandArgFlagSpec;
}

interface FlagTokenLookupResult {
  entry: FlagLookupEntry;
  inlineValue?: string;
}

function describeFlagLookupEntry(entry: FlagLookupEntry): string {
  return entry.negated ? `${entry.key} (negated)` : entry.key;
}

function createParserError(
  code:
    | "FLAG_VALUE_REQUIRED"
    | "FLAG_VALUE_INVALID"
    | "FLAG_VALUE_NOT_ALLOWED"
    | "FLAG_VALUE_OUT_OF_RANGE"
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

    for (const deprecatedName of spec.deprecatedNames ?? []) {
      addFlagName(lookup, deprecatedName.name, {
        deprecated: deprecatedName,
        key,
        negated: false,
        spec,
      });
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

function getDefaultValue(value: unknown): CommandArgValue {
  if (value && typeof value === "object" && "value" in value) {
    return (value as CommandArgDefault).value;
  }
  return value as CommandArgValue;
}

function createDefaultFlags<TFlags extends CommandArgFlagSpecRecord>(
  flags: TFlags,
  defaults: ParseCommandArgsOptions<TFlags>["defaults"] = {}
): ParsedCommandArgFlags<TFlags> {
  const parsedFlags: Record<string, CommandArgValue> = {};

  for (const [key, spec] of Object.entries(flags)) {
    const runtimeDefault = getDefaultValue(defaults[key]);
    if (runtimeDefault !== undefined) {
      parsedFlags[key] = runtimeDefault;
      continue;
    }

    if (spec.type === "boolean") {
      parsedFlags[key] = spec.defaultValue ?? false;
      continue;
    }

    if (spec.type === "string-list") {
      parsedFlags[key] = [...(spec.defaultValue ?? [])] as never;
      continue;
    }

    parsedFlags[key] = spec.defaultValue as never;
  }

  return parsedFlags as ParsedCommandArgFlags<TFlags>;
}

function lookupFlagToken(
  arg: string,
  flagLookup: Map<string, FlagLookupEntry>
): FlagTokenLookupResult | undefined {
  const entry = flagLookup.get(arg);
  if (entry) {
    return { entry };
  }

  const equalsIndex = arg.indexOf("=");
  if (equalsIndex === -1) {
    return undefined;
  }

  const name = arg.slice(0, equalsIndex);
  const inlineEntry = flagLookup.get(name);
  if (
    !inlineEntry ||
    inlineEntry.spec.type === "boolean" ||
    inlineEntry.spec.type === "string" ||
    inlineEntry.negated
  ) {
    return undefined;
  }

  return {
    entry: inlineEntry,
    inlineValue: arg.slice(equalsIndex + 1),
  };
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

function isNegativeNumberToken(value: string | undefined): boolean {
  return typeof value === "string" && NUMBER_TOKEN_PATTERN.test(value);
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

function requireValue(
  args: readonly string[],
  index: number,
  entry: FlagLookupEntry,
  inlineValue: string | undefined,
  flagLookup: Map<string, FlagLookupEntry>
): { nextIndex: number; value: string } {
  if (inlineValue !== undefined) {
    return { nextIndex: index, value: inlineValue };
  }

  const nextArg = args[index + 1];
  if (typeof nextArg !== "string" || flagLookup.has(nextArg)) {
    throw createParserError(
      "FLAG_VALUE_REQUIRED",
      entry.spec.names[0] ?? entry.key
    );
  }

  return { nextIndex: index + 1, value: nextArg };
}

function parseIntegerValue(entry: FlagLookupEntry, value: string): number {
  if (!/^-?\d+$/.test(value)) {
    throw createParserError("FLAG_VALUE_INVALID", entry.spec.names[0] ?? value);
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed)) {
    throw createParserError("FLAG_VALUE_INVALID", entry.spec.names[0] ?? value);
  }

  if (
    entry.spec.type === "integer" &&
    ((entry.spec.min !== undefined && parsed < entry.spec.min) ||
      (entry.spec.max !== undefined && parsed > entry.spec.max))
  ) {
    throw createParserError(
      "FLAG_VALUE_OUT_OF_RANGE",
      entry.spec.names[0] ?? value
    );
  }

  return parsed;
}

function parseDurationValue(entry: FlagLookupEntry, value: string): number {
  const match = DURATION_TOKEN_PATTERN.exec(value);
  if (!match) {
    throw createParserError("FLAG_VALUE_INVALID", entry.spec.names[0] ?? value);
  }

  const [, rawAmount = "", unit = "ms"] = match;
  const amount = Number.parseInt(rawAmount, 10);
  const multipliers: Record<string, number> = {
    h: 60 * 60 * 1000,
    m: 60 * 1000,
    ms: 1,
    s: 1000,
  };
  return amount * (multipliers[unit ?? "ms"] ?? 1);
}

function parseEnumValue(entry: FlagLookupEntry, value: string): string {
  if (entry.spec.type !== "enum" || entry.spec.values.includes(value)) {
    return value;
  }

  throw createParserError("FLAG_VALUE_NOT_ALLOWED", value);
}

function parseStringListValue(entry: FlagLookupEntry, value: string): string[] {
  const separator =
    entry.spec.type === "string-list" ? (entry.spec.separator ?? ",") : ",";
  if (value.length === 0) {
    return [];
  }
  return value.split(separator).filter(Boolean);
}

function assignFlagValue<TFlags extends CommandArgFlagSpecRecord>(
  args: readonly string[],
  index: number,
  entry: FlagLookupEntry,
  inlineValue: string | undefined,
  flagLookup: Map<string, FlagLookupEntry>,
  parsedFlags: ParsedCommandArgFlags<TFlags>
): number {
  if (entry.spec.type === "boolean") {
    parsedFlags[entry.key as keyof ParsedCommandArgFlags<TFlags>] =
      !entry.negated as ParsedCommandArgFlags<TFlags>[keyof ParsedCommandArgFlags<TFlags>];
    return index;
  }

  if (entry.spec.type === "optional-string") {
    if (inlineValue !== undefined) {
      parsedFlags[entry.key as keyof ParsedCommandArgFlags<TFlags>] =
        inlineValue as ParsedCommandArgFlags<TFlags>[keyof ParsedCommandArgFlags<TFlags>];
      return index;
    }

    const nextArg = args[index + 1];
    if (
      typeof nextArg === "string" &&
      (!nextArg.startsWith("-") || isNegativeNumberToken(nextArg))
    ) {
      parsedFlags[entry.key as keyof ParsedCommandArgFlags<TFlags>] =
        nextArg as ParsedCommandArgFlags<TFlags>[keyof ParsedCommandArgFlags<TFlags>];
      return index + 1;
    }

    parsedFlags[entry.key as keyof ParsedCommandArgFlags<TFlags>] =
      true as ParsedCommandArgFlags<TFlags>[keyof ParsedCommandArgFlags<TFlags>];
    return index;
  }

  const { nextIndex, value } = requireValue(
    args,
    index,
    entry,
    inlineValue,
    flagLookup
  );
  let parsedValue: CommandArgValue = value;
  if (entry.spec.type === "integer") {
    parsedValue = parseIntegerValue(entry, value);
  } else if (entry.spec.type === "duration") {
    parsedValue = parseDurationValue(entry, value);
  } else if (entry.spec.type === "enum") {
    parsedValue = parseEnumValue(entry, value);
  } else if (entry.spec.type === "string-list") {
    parsedValue = parseStringListValue(entry, value);
  }
  parsedFlags[entry.key as keyof ParsedCommandArgFlags<TFlags>] =
    parsedValue as ParsedCommandArgFlags<TFlags>[keyof ParsedCommandArgFlags<TFlags>];
  return nextIndex;
}

/**
 * Defines a reusable command-local argument spec and validates duplicate
 * aliases eagerly.
 */
export function defineCommandArgs<
  const TFlags extends CommandArgFlagSpecRecord = Record<never, never>,
  const TPositionals extends readonly CommandArgPositionSpec[] = [],
>(
  spec: ParseCommandArgsSpec<TFlags, TPositionals>
): ParseCommandArgsSpec<TFlags, TPositionals> {
  createFlagLookup((spec.flags ?? {}) as TFlags);
  return spec;
}

type UnionToIntersection<TValue> = (
  TValue extends unknown ? (value: TValue) => void : never
) extends (value: infer TResult) => void
  ? TResult
  : never;

type MergedFlags<TSpecs extends readonly ParseCommandArgsSpec[]> =
  UnionToIntersection<
    TSpecs[number] extends ParseCommandArgsSpec<
      infer TFlags,
      readonly CommandArgPositionSpec[]
    >
      ? TFlags
      : Record<never, never>
  > &
    CommandArgFlagSpecRecord;

type MergedPositionals<TSpecs extends readonly ParseCommandArgsSpec[]> =
  TSpecs[number] extends ParseCommandArgsSpec<
    CommandArgFlagSpecRecord,
    infer TPositionals
  >
    ? TPositionals
    : readonly CommandArgPositionSpec[];

/**
 * Merges reusable command-local argument specs.
 */
export function mergeCommandArgs<
  const TSpecs extends readonly ParseCommandArgsSpec[],
>(
  ...specs: TSpecs
): ParseCommandArgsSpec<MergedFlags<TSpecs>, MergedPositionals<TSpecs>> {
  const flags: CommandArgFlagSpecRecord = {};
  const positionals: CommandArgPositionSpec[] = [];

  for (const spec of specs) {
    for (const [key, flag] of Object.entries(spec.flags ?? {})) {
      if (Object.hasOwn(flags, key)) {
        throw new Error(
          `Duplicate flag key "${key}" while merging command args`
        );
      }
      flags[key] = flag;
    }
    positionals.push(...(spec.positionals ?? []));
  }

  const mergedSpec: ParseCommandArgsSpec<
    MergedFlags<TSpecs>,
    MergedPositionals<TSpecs>
  > = {
    flags: flags as MergedFlags<TSpecs>,
  };
  if (positionals.length > 0) {
    mergedSpec.positionals =
      positionals as unknown as MergedPositionals<TSpecs>;
  }

  return defineCommandArgs(mergedSpec);
}

function splitPassthrough(
  args: readonly string[],
  enabled: boolean | undefined
): { parseArgs: readonly string[]; passthrough: string[] } {
  if (!enabled) {
    return { parseArgs: args, passthrough: [] };
  }

  const separatorIndex = args.indexOf("--");
  if (separatorIndex === -1) {
    return { parseArgs: args, passthrough: [] };
  }

  return {
    parseArgs: args.slice(0, separatorIndex),
    passthrough: args.slice(separatorIndex + 1),
  };
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
  spec: ParseCommandArgsSpec<TFlags, TPositionals> = {},
  options: ParseCommandArgsOptions<TFlags> = {}
): ParseCommandArgsResult<TFlags, TPositionals> {
  const flags = (spec.flags ?? {}) as TFlags;
  const positionals = (spec.positionals ?? []) as unknown as TPositionals;
  const flagLookup = createFlagLookup(flags);
  const parsedFlags = createDefaultFlags(flags, options.defaults);
  const positionalValues: string[] = [];
  const { parseArgs, passthrough } = splitPassthrough(
    args,
    options.passthrough
  );

  for (let index = 0; index < parseArgs.length; index++) {
    const arg = parseArgs[index];
    if (typeof arg !== "string") {
      continue;
    }

    if (arg.startsWith("-")) {
      const result = lookupFlagToken(arg, flagLookup);
      if (!result) {
        throw createParserError("UNKNOWN_OPTION", arg);
      }
      if (result.entry.deprecated) {
        options.onWarning?.({
          code: "DEPRECATED_FLAG_ALIAS",
          key: result.entry.key,
          name: result.entry.deprecated.name,
          replacement: result.entry.deprecated.replacement,
        });
      }

      index = assignFlagValue(
        parseArgs,
        index,
        result.entry,
        result.inlineValue,
        flagLookup,
        parsedFlags
      );
      continue;
    }

    positionalValues.push(arg);
  }

  const parsedPositionals = createDefaultPositionals(positionals);
  assignPositionals(positionalValues, positionals, parsedPositionals);

  return {
    flags: parsedFlags,
    passthrough,
    positionals: parsedPositionals,
  };
}
