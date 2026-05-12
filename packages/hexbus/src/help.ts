import type { CliCommand, CliContext, CliFlag } from "./types";

export interface ShowHelpMenuOptions {
  appName: string;
  version: string;
  docsUrl?: string;
}

export function showHelpMenu(
  context: Pick<CliContext, "logger">,
  options: ShowHelpMenuOptions,
  commands: CliCommand[],
  flags: CliFlag[]
): void {
  const visibleCommands = commands.filter((command) => !command.hidden);
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
    `${options.appName} ${options.version}\n\nUsage:\n  ${options.appName} <command> [options]\n\nCommands:\n${commandRows}\n\nGlobal Flags:\n${flagRows}${docsLine}`,
    `${options.appName} CLI`
  );
}
