import { defineCommandArgs, mergeCommandArgs } from "./command-args";
import type { CommandArgFlagSpec, ParseCommandArgsSpec } from "./command-args";
import type { CliCommand, CliContext } from "./types";

/**
 * Command-local argument scopes resolved from a command route.
 */
export interface CommandArgScopes<TContext extends CliContext = CliContext> {
  inherited: ParseCommandArgsSpec;
  local: ParseCommandArgsSpec;
  merged: ParseCommandArgsSpec;
  path: readonly CliCommand<TContext>[];
}

function getDefaultValueName(flag: CommandArgFlagSpec): string {
  switch (flag.type) {
    case "duration": {
      return "duration";
    }
    case "enum": {
      return flag.values.join("|");
    }
    case "integer": {
      return "n";
    }
    case "string-list": {
      return "list";
    }
    default: {
      return "value";
    }
  }
}

/**
 * Returns inherited and local argument specs for a command path.
 */
export function resolveCommandArgScopes<TContext extends CliContext>(
  commandPath: readonly CliCommand<TContext>[]
): CommandArgScopes<TContext> {
  const inheritedSpecs = commandPath
    .map((command) => command.inheritedArgs)
    .filter((spec): spec is ParseCommandArgsSpec => spec !== undefined);
  const leaf = commandPath.at(-1);
  const local = leaf?.args ?? {};
  const inherited =
    inheritedSpecs.length > 0 ? mergeCommandArgs(...inheritedSpecs) : {};
  const merged =
    inheritedSpecs.length > 0
      ? mergeCommandArgs(...inheritedSpecs, local)
      : defineCommandArgs(local);

  return { inherited, local, merged, path: commandPath };
}

function hasCommandArgs(spec: ParseCommandArgsSpec): boolean {
  return (
    Object.keys(spec.flags ?? {}).length > 0 ||
    (spec.positionals?.length ?? 0) > 0
  );
}

/**
 * Returns every accepted flag token in a command-local arg spec.
 */
export function getCommandArgFlagNames(spec: ParseCommandArgsSpec): string[] {
  const names: string[] = [];

  for (const flag of Object.values(spec.flags ?? {})) {
    names.push(...flag.names);
    if (flag.type === "boolean" && flag.negatedName) {
      names.push(flag.negatedName);
    }
    names.push(...(flag.deprecatedNames ?? []).map((alias) => alias.name));
  }

  return names;
}

/**
 * Tests whether a command-local arg spec accepts a flag token.
 */
export function commandArgsAcceptFlag(
  spec: ParseCommandArgsSpec,
  token: string
): boolean {
  const [name] = token.split("=", 1);
  return name !== undefined && getCommandArgFlagNames(spec).includes(name);
}

/**
 * Returns visible aliases for docs and completion generation.
 */
export function getVisibleCommandAliases<TContext extends CliContext>(
  command: CliCommand<TContext>
): string[] {
  return (command.aliases ?? [])
    .filter(
      (alias) =>
        alias.hidden !== true && !(alias.deprecated && alias.hidden !== false)
    )
    .map((alias) => alias.name);
}

/**
 * Returns whether a command-local arg spec has visible metadata.
 */
export function commandArgsHaveEntries(spec: ParseCommandArgsSpec): boolean {
  return hasCommandArgs(spec);
}

/**
 * Returns the display value hint for a command-local flag.
 */
export function getCommandArgValueHint(flag: CommandArgFlagSpec): string {
  if (flag.type === "boolean") {
    return "";
  }
  return ` <${flag.valueName ?? getDefaultValueName(flag)}>`;
}
