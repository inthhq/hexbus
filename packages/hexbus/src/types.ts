export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export type FlagType = 'boolean' | 'string' | 'special';

export interface CliFlag {
	names: string[];
	description: string;
	type: FlagType;
	expectsValue: boolean;
	defaultValue?: string | boolean;
}

export interface ParsedArgs {
	commandName: string | undefined;
	commandArgs: string[];
	parsedFlags: Record<string, string | boolean | undefined>;
}

export interface CliCommand<TContext extends CliContext = CliContext> {
	name: string;
	label: string;
	hint: string;
	description: string;
	action: (context: TContext) => Promise<void>;
	subcommands?: CliCommand<TContext>[];
	hidden?: boolean;
}

export interface PackageInfo {
	name: string;
	version: string;
	[key: string]: unknown;
}

export interface FrameworkDetectionResult<TPackage extends string = string> {
	framework: string | null;
	frameworkVersion: string | null;
	pkg: TPackage | null;
	hasReact: boolean;
	reactVersion: string | null;
	tailwindVersion: string | null;
}

export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun';

export interface PackageManagerResult {
	name: PackageManager;
	installCommand: string;
	addCommand: string;
	runCommand: string;
	execCommand: string;
	version?: string | null;
}

export interface CliLogger {
	debug(message: string, ...args: unknown[]): void;
	info(message: string, ...args: unknown[]): void;
	warn(message: string, ...args: unknown[]): void;
	error(message: string, ...args: unknown[]): void;
	message(message: string): void;
	note(content: string, title?: string): void;
	outro(message: string): void;
	success(message: string): void;
	failed(message: string, exitCode?: number): never;
	step(current: number, total: number, label: string): void;
}

export interface ErrorHandlers {
	handleError(error: unknown, command: string): never;
	handleCancel(
		message?: string,
		context?: { command?: string; stage?: string }
	): never;
}

export interface ConfigManagement {
	loadConfig<TConfig = unknown>(): Promise<TConfig | null>;
	requireConfig<TConfig = unknown>(): Promise<TConfig>;
	getPathAliases(configPath?: string): Record<string, string> | null;
}

export interface FileSystemUtils {
	getPackageInfo(): PackageInfo;
	exists(path: string): Promise<boolean>;
	read(path: string): Promise<string>;
	write(path: string, content: string): Promise<void>;
	mkdir(path: string): Promise<void>;
}

export interface Telemetry {
	trackEvent(eventName: string, properties?: Record<string, unknown>): void;
	trackCommand(
		command: string,
		args?: string[],
		flags?: Record<string, string | number | boolean | undefined>
	): void;
	trackError(error: Error, command?: string): void;
	flush(): Promise<void>;
	shutdown(): Promise<void>;
	isDisabled(): boolean;
}

export interface CliContext<TPackage extends string = string> {
	logger: CliLogger;
	flags: ParsedArgs['parsedFlags'];
	commandName: string | undefined;
	commandArgs: string[];
	cwd: string;
	error: ErrorHandlers;
	config: ConfigManagement;
	fs: FileSystemUtils;
	telemetry: Telemetry;
	confirm(message: string, initialValue?: boolean): Promise<boolean>;
	projectRoot: string;
	framework: FrameworkDetectionResult<TPackage>;
	packageManager: PackageManagerResult;
}
