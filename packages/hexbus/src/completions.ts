import {
  getCommandArgFlagNames,
  getVisibleCommandAliases,
  resolveCommandArgScopes,
} from "./command-tree";
import type { CliCommand, CliContext, CliFlag } from "./types";

/**
 * Supported shell completion targets.
 */
export type CompletionShell = "bash" | "fish" | "zsh";

/**
 * Options for static shell completion generation.
 */
export interface GenerateCompletionOptions<
  TContext extends CliContext = CliContext,
> {
  appName: string;
  commands: CliCommand<TContext>[];
  globalFlags?: CliFlag[];
  shell: CompletionShell;
}

interface CompletionEntry {
  flags: string[];
  path: string[];
  subcommands: string[];
}

function collectCommandNames<TContext extends CliContext>(
  command: CliCommand<TContext>
): string[] {
  return [command.name, ...getVisibleCommandAliases(command)];
}

function collectEntries<TContext extends CliContext>(
  commands: CliCommand<TContext>[],
  path: CliCommand<TContext>[] = []
): CompletionEntry[] {
  const entries: CompletionEntry[] = [];
  const currentCommands = path.at(-1)?.subcommands ?? commands;
  if (path.length > 0 && !path.at(-1)?.subcommands) {
    const scopes = resolveCommandArgScopes(path);
    return [
      {
        flags: getCommandArgFlagNames(scopes.merged),
        path: path.map((command) => command.name),
        subcommands: [],
      },
    ];
  }
  const commandPath = path.map((command) => command.name);
  const subcommands = currentCommands.flatMap((command) =>
    collectCommandNames(command)
  );

  if (path.length > 0) {
    const scopes = resolveCommandArgScopes(path);
    entries.push({
      flags: getCommandArgFlagNames(scopes.merged),
      path: commandPath,
      subcommands,
    });
  } else {
    entries.push({ flags: [], path: [], subcommands });
  }

  for (const command of currentCommands) {
    entries.push(...collectEntries(commands, [...path, command]));
  }

  return entries;
}

function shellWords(values: string[]): string {
  return values.join(" ");
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function getGlobalFlagNames(flags: CliFlag[]): string[] {
  return flags.flatMap((flag) => flag.names);
}

function generateBashCompletion(
  appName: string,
  entries: CompletionEntry[],
  globalFlags: string[]
): string {
  const entryRows = entries
    .map(
      (entry) =>
        `${shellQuote(entry.path.join(" "))}:${shellQuote(shellWords(entry.subcommands))}:${shellQuote(shellWords(entry.flags))}`
    )
    .join("\n");
  return `_${appName}_completion() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  local path=""
  local command_index=1
  while [[ $command_index -lt $COMP_CWORD ]]; do
    local word="\${COMP_WORDS[$command_index]}"
    [[ "$word" == -* ]] && break
    [[ -n "$path" ]] && path="$path "
    path="$path$word"
    command_index=$((command_index + 1))
  done
  local commands=""
  local local_flags=""
  while IFS=: read -r entry_path entry_commands entry_flags; do
    if [[ "$entry_path" == "$path" ]]; then
      commands="$entry_commands"
      local_flags="$entry_flags"
      break
    fi
  done <<'EOF'
${entryRows}
EOF
  COMPREPLY=( $(compgen -W "$commands ${shellWords(globalFlags)} $local_flags" -- "$cur") )
}
complete -F _${appName}_completion ${appName}`;
}

function generateZshCompletion(
  appName: string,
  entries: CompletionEntry[],
  globalFlags: string[]
): string {
  const cases = entries
    .map((entry) => {
      const key = entry.path.join(" ");
      return `    ${shellQuote(key)}) commands=(${shellWords(entry.subcommands)}); flags=(${shellWords([...globalFlags, ...entry.flags])}) ;;`;
    })
    .join("\n");
  return `#compdef ${appName}
_${appName}() {
  local -a commands
  local -a flags
  local path="\${words[2,-2]}"
  commands=()
  flags=(${shellWords(globalFlags)})
  case "$path" in
${cases}
  esac
  _describe 'command' commands
  _describe 'option' flags
}
_${appName}`;
}

function generateFishCompletion(
  appName: string,
  entries: CompletionEntry[],
  globalFlags: string[]
): string {
  const lines: string[] = [];
  for (const entry of entries) {
    const seenFlags = new Set([...globalFlags, ...entry.flags]);
    const condition =
      entry.path.length === 0
        ? ""
        : ` -n '__fish_seen_subcommand_from ${entry.path.join(" ")}'`;
    for (const command of entry.subcommands) {
      lines.push(`complete -c ${appName}${condition} -f -a ${command}`);
    }
    for (const flag of seenFlags) {
      const option = flag.startsWith("--")
        ? `-l ${flag.slice(2)}`
        : `-s ${flag.slice(1)}`;
      lines.push(`complete -c ${appName}${condition} ${option}`);
    }
  }
  return lines.join("\n");
}

/**
 * Generates static shell completions from command and argument metadata.
 */
export function generateCompletion<TContext extends CliContext>(
  options: GenerateCompletionOptions<TContext>
): string {
  const entries = collectEntries(options.commands);
  const globalFlags = getGlobalFlagNames(options.globalFlags ?? []);

  switch (options.shell) {
    case "bash": {
      return generateBashCompletion(options.appName, entries, globalFlags);
    }
    case "fish": {
      return generateFishCompletion(options.appName, entries, globalFlags);
    }
    case "zsh": {
      return generateZshCompletion(options.appName, entries, globalFlags);
    }
    default: {
      return generateBashCompletion(options.appName, entries, globalFlags);
    }
  }
}
