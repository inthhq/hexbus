import figlet from "figlet";

import type { CliContext } from "./types";

export interface DisplayIntroOptions {
  appName: string;
  version?: string;
  tagline?: string;
  figletText?: string;
}

function renderFiglet(text: string): Promise<string> {
  return new Promise((resolve) => {
    figlet(text, (error, data) => {
      if (error || !data) {
        resolve(text);
        return;
      }
      resolve(data);
    });
  });
}

export async function displayIntro(
  context: Pick<CliContext, "logger">,
  options: DisplayIntroOptions
): Promise<void> {
  const banner = await renderFiglet(options.figletText ?? options.appName);
  const versionLabel = options.version ? ` v${options.version}` : "";

  context.logger.message(banner);
  context.logger.note(
    options.tagline ?? `${options.appName}${versionLabel}`,
    options.appName
  );
}
