/**
 * Skill installer utilities for invoking the Agent Skills CLI through the
 * caller's package manager.
 *
 * @packageDocumentation
 */

import { spawn } from 'node:child_process';
import { once } from 'node:events';

/**
 * Package managers with known one-off execution commands.
 */
export type PackageManagerName = 'npm' | 'pnpm' | 'yarn' | 'bun';

/**
 * Options for installing an agent skill.
 */
export interface InstallSkillsOptions {
	/**
	 * Skill reference passed to `skills add`.
	 *
	 * @example "@scope/my-skill"
	 */
	skillRef: string;
	/**
	 * Working directory for the spawned installer process.
	 *
	 * @default process.cwd()
	 */
	cwd?: string;
	/**
	 * Package manager used to select the one-off runner command.
	 *
	 * @remarks
	 * Unknown values fall back to `npx`.
	 */
	packageManager?: PackageManagerName | string;
	/**
	 * Logger used for install progress and fallback instructions.
	 *
	 * @default console
	 */
	logger?: SkillsLogger;
	/**
	 * Callback invoked after a successful installer exit.
	 */
	onSuccess?: () => void;
	/**
	 * Callback invoked when the installer exits unsuccessfully or cannot start.
	 */
	onFailure?: (error: unknown) => void;
}

/**
 * Logger interface used by the skills installer.
 */
export interface SkillsLogger {
	/**
	 * Emits informational installer output.
	 */
	info(message: string): void;
	/**
	 * Emits installer failure output.
	 */
	error(message: string): void;
	/**
	 * Emits optional success output.
	 */
	success?: (message: string) => void;
}

/**
 * Returns the one-off execution command for a package manager.
 *
 * @param packageManager - Package manager name. Unknown names use `npx`.
 * @returns Command prefix used before `skills add`.
 */
export function getSkillsRunnerCommand(packageManager?: string): string {
	switch (packageManager) {
		case 'bun':
			return 'bunx';
		case 'pnpm':
			return 'pnpm dlx';
		case 'yarn':
			return 'yarn dlx';
		default:
			return 'npx';
	}
}

/**
 * Installs an agent skill by spawning the Skills CLI.
 *
 * @remarks
 * The spawned process inherits stdio so the user can interact with the
 * installer directly. Failures do not throw; they are logged and routed to
 * `onFailure` so product CLIs can continue or provide additional guidance.
 *
 * @param options - Installation options and callbacks.
 */
export async function installSkills(
	options: InstallSkillsOptions
): Promise<void> {
	const logger: SkillsLogger = options.logger ?? console;
	const execCommand = getSkillsRunnerCommand(options.packageManager);
	const [cmd, ...baseArgs] = execCommand.trim().split(/\s+/).filter(Boolean);

	if (!cmd) {
		const error = new Error(
			`Invalid package manager command: ${JSON.stringify(execCommand)}`
		);
		logger.error(error.message);
		options.onFailure?.(error);
		return;
	}

	logger.info(`Running: ${execCommand} skills add ${options.skillRef}`);

	try {
		const child = spawn(cmd, [...baseArgs, 'skills', 'add', options.skillRef], {
			cwd: options.cwd ?? process.cwd(),
			stdio: 'inherit',
		});

		const [exitCode] = await once(child, 'exit');

		if (exitCode === 0) {
			if (logger.success) {
				logger.success('Agent skills installed successfully.');
			} else {
				logger.info('Agent skills installed successfully.');
			}
			options.onSuccess?.();
			return;
		}

		const error = new Error(
			`Skills installation failed with exit code ${String(exitCode)}`
		);
		logger.error(
			`${error.message}. Install manually with: ${execCommand} skills add ${options.skillRef}`
		);
		options.onFailure?.(error);
	} catch (error) {
		logger.error(
			`Skills installation failed: ${error instanceof Error ? error.message : String(error)}`
		);
		logger.info(
			`Install manually with: ${execCommand} skills add ${options.skillRef}`
		);
		options.onFailure?.(error);
	}
}
