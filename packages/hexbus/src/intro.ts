import figlet from 'figlet';
import type { CliContext } from './types';

/**
 * Options for rendering a CLI intro banner.
 */
export interface DisplayIntroOptions {
	/**
	 * Application name used as the note title and default banner text.
	 */
	appName: string;
	/**
	 * Optional application version shown in the fallback tagline.
	 */
	version?: string;
	/**
	 * Optional tagline shown below the banner.
	 */
	tagline?: string;
	/**
	 * Optional text passed to figlet instead of `appName`.
	 */
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

/**
 * Renders a figlet banner and short intro note.
 *
 * @remarks
 * If figlet rendering fails, the plain banner text is displayed instead.
 *
 * @param context - Context subset providing the logger used for output.
 * @param options - Intro banner metadata.
 */
export async function displayIntro(
	context: Pick<CliContext, 'logger'>,
	options: DisplayIntroOptions
): Promise<void> {
	const banner = await renderFiglet(options.figletText ?? options.appName);
	const versionLabel = options.version ? ` v${options.version}` : '';

	context.logger.message(banner);
	context.logger.note(
		options.tagline ?? `${options.appName}${versionLabel}`,
		options.appName
	);
}
