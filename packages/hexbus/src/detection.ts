import fs from 'node:fs/promises';
import path from 'node:path';
import * as p from '@clack/prompts';
import type {
	CliLogger,
	FrameworkDetectionResult,
	PackageManager,
	PackageManagerResult,
} from './types';

export interface FrameworkPackageMap<TPackage extends string = string> {
	core?: TPackage;
	react?: TPackage;
	next?: TPackage;
}

const LOCK_FILE_MAP: Record<string, PackageManager> = {
	'bun.lockb': 'bun',
	'bun.lock': 'bun',
	'pnpm-lock.yaml': 'pnpm',
	'yarn.lock': 'yarn',
	'package-lock.json': 'npm',
};

const PACKAGE_MANAGER_CONFIG: Record<
	PackageManager,
	Omit<PackageManagerResult, 'name'>
> = {
	bun: {
		installCommand: 'bun install',
		addCommand: 'bun add',
		runCommand: 'bun run',
		execCommand: 'bunx',
	},
	pnpm: {
		installCommand: 'pnpm install',
		addCommand: 'pnpm add',
		runCommand: 'pnpm',
		execCommand: 'pnpm dlx',
	},
	yarn: {
		installCommand: 'yarn',
		addCommand: 'yarn add',
		runCommand: 'yarn',
		execCommand: 'yarn dlx',
	},
	npm: {
		installCommand: 'npm install',
		addCommand: 'npm install',
		runCommand: 'npm run',
		execCommand: 'npx',
	},
};

async function readPackageJson(projectRoot: string) {
	const packageJsonPath = path.join(projectRoot, 'package.json');
	const content = await fs.readFile(packageJsonPath, 'utf-8');
	return JSON.parse(content) as {
		dependencies?: Record<string, string>;
		devDependencies?: Record<string, string>;
		packageManager?: string;
	};
}

export async function detectFramework<TPackage extends string = string>(
	projectRoot: string,
	logger?: CliLogger,
	packageMap: FrameworkPackageMap<TPackage> = {}
): Promise<FrameworkDetectionResult<TPackage>> {
	try {
		logger?.debug(`Detecting framework in ${projectRoot}`);
		const packageJson = await readPackageJson(projectRoot);
		const deps = {
			...packageJson.dependencies,
			...packageJson.devDependencies,
		};

		const hasReact = 'react' in deps;
		const reactVersion = hasReact ? deps.react : null;
		const tailwindVersion = deps.tailwindcss ?? null;
		let framework: string | null = null;
		let frameworkVersion: string | null = null;
		let pkg: TPackage | null = hasReact ? (packageMap.react ?? null) : null;

		if ('next' in deps) {
			framework = 'Next.js';
			frameworkVersion = deps.next ?? null;
			pkg = packageMap.next ?? packageMap.react ?? null;
		} else if ('@remix-run/react' in deps) {
			framework = 'Remix';
			frameworkVersion = deps['@remix-run/react'] ?? null;
			pkg = packageMap.react ?? null;
		} else if (
			'@vitejs/plugin-react' in deps ||
			'@vitejs/plugin-react-swc' in deps
		) {
			framework = 'Vite + React';
			frameworkVersion =
				deps['@vitejs/plugin-react'] ??
				deps['@vitejs/plugin-react-swc'] ??
				null;
			pkg = packageMap.react ?? null;
		} else if ('gatsby' in deps) {
			framework = 'Gatsby';
			frameworkVersion = deps.gatsby ?? null;
			pkg = packageMap.react ?? null;
		} else if (hasReact) {
			framework = 'React';
			frameworkVersion = reactVersion ?? null;
			pkg = packageMap.react ?? null;
		} else {
			pkg = packageMap.core ?? null;
		}

		return {
			framework,
			frameworkVersion,
			pkg,
			hasReact,
			reactVersion: reactVersion ?? null,
			tailwindVersion,
		};
	} catch (error) {
		logger?.debug(
			`Framework detection failed: ${error instanceof Error ? error.message : String(error)}`
		);
		return {
			framework: null,
			frameworkVersion: null,
			pkg: packageMap.core ?? null,
			hasReact: false,
			reactVersion: null,
			tailwindVersion: null,
		};
	}
}

export async function detectProjectRoot(
	cwd: string,
	logger?: CliLogger
): Promise<string> {
	let projectRoot = cwd;
	let previousDirectory = '';
	let depth = 0;
	const maxDepth = 10;

	while (projectRoot !== previousDirectory && depth < maxDepth) {
		try {
			await fs.access(path.join(projectRoot, 'package.json'));
			return projectRoot;
		} catch {
			previousDirectory = projectRoot;
			projectRoot = path.dirname(projectRoot);
			depth++;
		}
	}

	logger?.warn('Could not find project root; using current working directory');
	return cwd;
}

async function detectFromLockFile(
	projectRoot: string,
	logger?: CliLogger
): Promise<PackageManager | null> {
	for (const [lockFile, pm] of Object.entries(LOCK_FILE_MAP)) {
		try {
			await fs.access(path.join(projectRoot, lockFile));
			logger?.debug(`Found ${lockFile}, using ${pm}`);
			return pm;
		} catch {
			// Continue checking other lockfiles.
		}
	}
	return null;
}

async function detectFromPackageJson(
	projectRoot: string,
	logger?: CliLogger
): Promise<PackageManager | null> {
	try {
		const packageJson = await readPackageJson(projectRoot);
		const match = packageJson.packageManager?.match(/^(npm|yarn|pnpm|bun)@/);
		if (match) {
			logger?.debug(`Found packageManager field: ${match[1]}`);
			return match[1] as PackageManager;
		}
	} catch {
		// Ignore package.json detection errors.
	}
	return null;
}

async function promptForPackageManager(
	logger?: CliLogger
): Promise<PackageManager> {
	logger?.debug('Prompting user to select package manager');

	const result = await p.select({
		message: 'Which package manager do you use?',
		options: [
			{ value: 'bun', label: 'bun', hint: 'Fast all-in-one toolkit' },
			{ value: 'pnpm', label: 'pnpm', hint: 'Fast, disk space efficient' },
			{ value: 'yarn', label: 'yarn', hint: 'Classic package manager' },
			{ value: 'npm', label: 'npm', hint: 'Default Node.js package manager' },
		],
	});

	if (p.isCancel(result)) {
		throw new Error('Package manager selection cancelled');
	}

	return result as PackageManager;
}

export async function detectPackageManager(
	projectRoot: string,
	logger?: CliLogger,
	options?: { interactive?: boolean }
): Promise<PackageManagerResult> {
	let pm = await detectFromLockFile(projectRoot, logger);

	if (!pm) {
		pm = await detectFromPackageJson(projectRoot, logger);
	}

	if (!pm) {
		if (
			options?.interactive === true &&
			process.stdin.isTTY &&
			!process.env.CI
		) {
			pm = await promptForPackageManager(logger);
		} else {
			pm = 'npm';
			logger?.debug('Defaulting to npm');
		}
	}

	return {
		name: pm,
		...PACKAGE_MANAGER_CONFIG[pm],
	};
}

export function getInstallCommand(
	pm: PackageManagerResult,
	packages: string[],
	options?: { dev?: boolean }
): string {
	const pkgList = packages.join(' ');
	const devFlag = options?.dev ? (pm.name === 'npm' ? '--save-dev' : '-D') : '';
	return `${pm.addCommand} ${devFlag} ${pkgList}`.trim().replace(/\s+/g, ' ');
}

export function getRunCommand(
	pm: PackageManagerResult,
	script: string
): string {
	return `${pm.runCommand} ${script}`;
}

export function getExecCommand(
	pm: PackageManagerResult,
	binary: string,
	args?: string[]
): string {
	const argString = args?.join(' ') || '';
	return `${pm.execCommand} ${binary} ${argString}`.trim();
}
