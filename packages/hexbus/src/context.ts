import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as p from '@clack/prompts';
import { loadConfig } from 'c12';
import {
	detectFramework,
	detectPackageManager,
	detectProjectRoot,
} from './detection';
import { CliError, createErrorHandlers } from './errors';
import { createCliLogger, validLogLevels } from './logger';
import { parseCliArgs } from './parser';
import {
	createDisabledTelemetry,
	createTelemetry,
	TelemetryEventName,
} from './telemetry';
import type {
	CliCommand,
	CliContext,
	ErrorHandlers,
	FileSystemUtils,
	FrameworkDetectionResult,
	LogLevel,
	PackageInfo,
	PackageManagerResult,
	ParsedArgs,
	Telemetry,
} from './types';

export interface CreateContextOptions<TPackage extends string = string> {
	rawArgs: string[];
	cwd?: string;
	commands: CliCommand[];
	appName?: string;
	configName?: string;
	telemetry?: {
		disabled?: boolean;
		debug?: boolean;
		endpoint?: string;
		envVarPrefix?: string;
		defaultProperties?: Record<string, unknown>;
	};
	packageMap?: {
		core?: TPackage;
		react?: TPackage;
		next?: TPackage;
	};
	interactivePackageManagerDetection?: boolean;
}

function getLogLevel(parsedFlags: ParsedArgs['parsedFlags']): LogLevel {
	const levelArg = parsedFlags.logger;

	if (typeof levelArg === 'string') {
		if ((validLogLevels as string[]).includes(levelArg)) {
			return levelArg as LogLevel;
		}

		process.stderr.write(
			`[CLI Setup] Invalid log level '${levelArg}' provided via --logger. Using default 'info'.\n`
		);
	}

	return 'info';
}

function createFileSystem(cwd: string): FileSystemUtils {
	return {
		getPackageInfo(): PackageInfo {
			const packageJsonPath = path.join(cwd, 'package.json');
			try {
				const content = fsSync.readFileSync(packageJsonPath, 'utf-8');
				const packageInfo = JSON.parse(content) as PackageInfo;
				return {
					...packageInfo,
					name: packageInfo.name || 'unknown',
					version: packageInfo.version || 'unknown',
				};
			} catch {
				return {
					name: 'unknown',
					version: 'unknown',
				};
			}
		},
		async exists(filePath: string) {
			try {
				await fs.access(filePath);
				return true;
			} catch {
				return false;
			}
		},
		read(filePath: string) {
			return fs.readFile(filePath, 'utf-8');
		},
		write(filePath: string, content: string) {
			return fs.writeFile(filePath, content, 'utf-8');
		},
		async mkdir(dirPath: string) {
			await fs.mkdir(dirPath, { recursive: true });
		},
	};
}

export async function createCliContext<TPackage extends string = string>(
	options: CreateContextOptions<TPackage>
): Promise<CliContext<TPackage>> {
	const cwd = options.cwd ?? process.cwd();
	const appName = options.appName ?? 'cli';
	const { commandName, commandArgs, parsedFlags } = parseCliArgs(
		options.rawArgs,
		options.commands
	);

	const logger = createCliLogger(getLogLevel(parsedFlags));
	const fsUtils = createFileSystem(cwd);
	const projectRoot = await detectProjectRoot(cwd, logger);
	const framework = await detectFramework(
		projectRoot,
		logger,
		options.packageMap
	);
	const packageManager = await detectPackageManager(projectRoot, logger, {
		interactive: options.interactivePackageManagerDetection,
	});

	const telemetry = createTelemetry({
		disabled:
			options.telemetry?.disabled === true ||
			parsedFlags['no-telemetry'] === true,
		debug:
			options.telemetry?.debug === true ||
			parsedFlags['telemetry-debug'] === true,
		endpoint: options.telemetry?.endpoint,
		appName,
		envVarPrefix: options.telemetry?.envVarPrefix ?? appName.toUpperCase(),
		defaultProperties: {
			entryCommand: commandName ?? 'interactive',
			commandArgsCount: commandArgs.length,
			cliVersion: fsUtils.getPackageInfo().version,
			framework: framework.framework ?? 'unknown',
			frameworkVersion: framework.frameworkVersion ?? 'unknown',
			packageManager: packageManager.name,
			...options.telemetry?.defaultProperties,
		},
		logger,
	});

	const errorHandlers = createErrorHandlers(logger, telemetry);

	const context: CliContext<TPackage> = {
		logger,
		flags: parsedFlags,
		commandName,
		commandArgs,
		cwd,
		error: errorHandlers,
		config: {
			async loadConfig<TConfig = unknown>() {
				const configPath =
					typeof parsedFlags.config === 'string'
						? parsedFlags.config
						: undefined;
				const { config } = await loadConfig({
					name: options.configName ?? appName,
					cwd: projectRoot,
					configFile: configPath,
				});
				return (config as TConfig | undefined) ?? null;
			},
			async requireConfig<TConfig = unknown>() {
				const config = await this.loadConfig<TConfig>();
				if (!config) {
					throw new CliError('CONFIG_NOT_FOUND');
				}
				return config;
			},
			getPathAliases() {
				return null;
			},
		},
		fs: fsUtils,
		telemetry,
		async confirm(message: string, initialValue = true) {
			if (parsedFlags.y === true || parsedFlags.yes === true) {
				return true;
			}

			const result = await p.confirm({ message, initialValue });
			if (p.isCancel(result)) {
				errorHandlers.handleCancel('Confirmation cancelled');
			}
			return result as boolean;
		},
		projectRoot,
		framework,
		packageManager,
	};

	telemetry.trackEvent(TelemetryEventName.CLI_ENVIRONMENT_DETECTED, {
		command: commandName ?? 'interactive',
		projectRootChanged: projectRoot !== cwd,
		framework: framework.framework ?? 'unknown',
		frameworkVersion: framework.frameworkVersion ?? 'unknown',
		packageManager: packageManager.name,
		hasReact: framework.hasReact,
		reactVersion: framework.reactVersion ?? 'unknown',
		tailwindVersion: framework.tailwindVersion ?? 'unknown',
	});

	return context;
}

export function createTestContext(
	overrides: Partial<CliContext> = {}
): CliContext {
	const logger = createCliLogger('error');
	const telemetry = createDisabledTelemetry();
	const error = createErrorHandlers(logger, telemetry) as ErrorHandlers;
	const framework: FrameworkDetectionResult = {
		framework: null,
		frameworkVersion: null,
		pkg: null,
		hasReact: false,
		reactVersion: null,
		tailwindVersion: null,
	};
	const packageManager: PackageManagerResult = {
		name: 'npm',
		installCommand: 'npm install',
		addCommand: 'npm install',
		runCommand: 'npm run',
		execCommand: 'npx',
	};

	return {
		logger,
		flags: {},
		commandName: undefined,
		commandArgs: [],
		cwd: process.cwd(),
		error,
		config: {
			loadConfig: async () => null,
			requireConfig: async () => {
				throw new CliError('CONFIG_NOT_FOUND');
			},
			getPathAliases: () => null,
		},
		fs: {
			getPackageInfo: () => ({ name: 'test', version: '0.0.0' }),
			exists: async () => false,
			read: async () => '',
			write: async () => {},
			mkdir: async () => {},
		},
		telemetry: telemetry as Telemetry,
		confirm: async () => true,
		projectRoot: process.cwd(),
		framework,
		packageManager,
		...overrides,
	};
}
