import { spawn } from 'node:child_process';
import { once } from 'node:events';

export type PackageManagerName = 'npm' | 'pnpm' | 'yarn' | 'bun';

export interface InstallSkillsOptions {
	skillRef: string;
	cwd?: string;
	packageManager?: PackageManagerName | string;
	logger?: SkillsLogger;
	onSuccess?: () => void;
	onFailure?: (error: unknown) => void;
}

export interface SkillsLogger {
	info(message: string): void;
	error(message: string): void;
	success?: (message: string) => void;
}

export function getSkillsRunnerCommand(packageManager?: string): string {
	switch (packageManager) {
		case 'bun':
			return 'bunx';
		case 'pnpm':
			return 'pnpm dlx';
		case 'yarn':
			return 'yarn dlx';
		case 'npm':
		default:
			return 'npx';
	}
}

export async function installSkills(
	options: InstallSkillsOptions
): Promise<void> {
	const logger: SkillsLogger = options.logger ?? console;
	const execCommand = getSkillsRunnerCommand(options.packageManager);
	const [cmd, ...baseArgs] = execCommand.split(' ');

	logger.info(`Running: ${execCommand} skills add ${options.skillRef}`);

	try {
		const child = spawn(
			cmd!,
			[...baseArgs, 'skills', 'add', options.skillRef],
			{
				cwd: options.cwd ?? process.cwd(),
				stdio: 'inherit',
			}
		);

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
			`${error.message}. Install manually with: npx skills add ${options.skillRef}`
		);
		options.onFailure?.(error);
	} catch (error) {
		logger.error(
			`Skills installation failed: ${error instanceof Error ? error.message : String(error)}`
		);
		logger.info(`Install manually with: npx skills add ${options.skillRef}`);
		options.onFailure?.(error);
	}
}
