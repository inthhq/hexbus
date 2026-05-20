import type { ParseCommandArgsSpec } from "./command-args";
import { getCommandArgValueHint } from "./command-tree";
import type { CliCommand, CliContext, CliFlag } from "./types";

/**
 * Metadata shown in the generated CLI help menu.
 */
export interface ShowHelpMenuOptions {
  /**
   * CLI application name shown in usage and title text.
   */
  appName: string;
  /**
   * CLI version shown near the top of the help menu.
   */
  version: string;
  /**
   * Optional documentation URL shown after commands and global flags.
   */
  docsUrl?: string;
  /**
   * Command path whose children are being rendered.
   */
  commandPath?: string[];
  /**
   * Inherited command-local args for the selected command path.
   */
  inheritedArgs?: ParseCommandArgsSpec;
  /**
   * Local args for the selected leaf command.
   */
  localArgs?: ParseCommandArgsSpec;
}

function formatCommandArgRows(spec: ParseCommandArgsSpec): string {
  return Object.values(spec.flags ?? {})
    .map((flag) => {
      const valueHint = getCommandArgValueHint(flag);
      const defaultText = flag.defaultDescription
        ? ` default: ${flag.defaultDescription}`
        : "";
      return `  ${flag.names.join(", ")}${valueHint}\t${flag.description ?? ""}${defaultText}`;
    })
    .join("\n");
}

function formatPositionalRows(spec: ParseCommandArgsSpec): string {
  return (spec.positionals ?? [])
    .map((positional) => {
      const requiredText = positional.required ? " required" : "";
      const valueName = positional.valueName ?? positional.name;
      return `  <${valueName}>\t${positional.description ?? ""}${requiredText}`;
    })
    .join("\n");
}

function formatSection(title: string, rows: string): string {
  if (!rows) {
    return "";
  }
  return `\n\n${title}:\n${rows}`;
}

/**
 * Renders a help menu for commands and global flags.
 *
 * @param context - Context subset providing the logger used for output.
 * @param options - Application metadata for the help menu.
 * @param commands - Commands to list; commands with `hidden: true` are
 * omitted.
 * @param flags - Global flags to list.
 */
export function showHelpMenu(
  context: Pick<CliContext, "logger">,
  options: ShowHelpMenuOptions,
  commands: CliCommand[],
  flags: CliFlag[]
): void {
  const visibleCommands = commands.filter((command) => !command.hidden);
  const commandPath = options.commandPath ?? [];
  const scopedCommand = commandPath.join(" ");
  const commandPrefix = [options.appName, scopedCommand]
    .filter(Boolean)
    .join(" ");
  const commandPlaceholder = visibleCommands.length > 0 ? " <command>" : "";
  const commandRows = visibleCommands
    .map((command) => `  ${command.name.padEnd(16)} ${command.description}`)
    .join("\n");
  const flagRows = flags
    .map((flag) => {
      const valueHint = flag.expectsValue ? " <value>" : "";
      return `  ${flag.names.join(", ")}${valueHint}\t${flag.description}`;
    })
    .join("\n");
  const inheritedArgRows = formatCommandArgRows(options.inheritedArgs ?? {});
  const localArgRows = formatCommandArgRows(options.localArgs ?? {});
  const positionalRows = formatPositionalRows(options.localArgs ?? {});
  const docsLine = options.docsUrl ? `\n\nDocs:\n  ${options.docsUrl}` : "";
  const commandsSection = formatSection("Commands", commandRows);
  const inheritedSection = formatSection("Inherited Flags", inheritedArgRows);
  const localSection = formatSection("Command Flags", localArgRows);
  const positionalSection = formatSection("Positionals", positionalRows);
  const globalSection = formatSection("Global Flags", flagRows);

  context.logger.note(
    `${options.appName} ${options.version}\n\nUsage:\n  ${commandPrefix}${commandPlaceholder} [options]${commandsSection}${inheritedSection}${localSection}${positionalSection}${globalSection}${docsLine}`,
    `${options.appName} CLI`
  );
}
