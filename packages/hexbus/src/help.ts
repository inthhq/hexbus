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
  const docsLine = options.docsUrl ? `\n\nDocs:\n  ${options.docsUrl}` : "";

  context.logger.note(
    `${options.appName} ${options.version}\n\nUsage:\n  ${commandPrefix}${commandPlaceholder} [options]\n\nCommands:\n${commandRows}\n\nGlobal Flags:\n${flagRows}${docsLine}`,
    `${options.appName} CLI`
  );
}
