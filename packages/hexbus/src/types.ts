/**
 * Supported logger verbosity levels.
 *
 * @remarks
 * Levels are ordered from least verbose (`error`) to most verbose (`debug`).
 * `createCliLogger` uses this ordering to decide whether a message should be
 * emitted.
 */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

/**
 * Describes how a command-line flag should be parsed.
 *
 * @remarks
 * `special` flags behave like booleans during parsing but usually trigger
 * control flow outside command execution, such as showing help or version
 * output.
 */
export type FlagType = 'boolean' | 'string' | 'special';

/**
 * Defines a global command-line flag accepted by a Hexbus CLI.
 */
export interface CliFlag {
	/**
	 * Flag aliases accepted on the command line.
	 *
	 * @example ['--help', '-h']
	 */
	names: string[];
	/**
	 * Human-readable explanation shown in generated help output.
	 */
	description: string;
	/**
	 * Parser behavior for this flag.
	 */
	type: FlagType;
	/**
	 * Whether the flag consumes the following argument as its value.
	 */
	expectsValue: boolean;
	/**
	 * Initial value assigned before raw arguments are parsed.
	 */
	defaultValue?: string | boolean;
}

/**
 * Normalized representation of raw CLI arguments.
 */
export interface ParsedArgs {
	/**
	 * Name of the matched top-level command, if the first positional argument
	 * matched a registered command.
	 */
	commandName: string | undefined;
	/**
	 * Positional arguments remaining after the top-level command name is
	 * removed.
	 */
	commandArgs: string[];
	/**
	 * Parsed global flags keyed by their primary long name without leading
	 * dashes.
	 *
	 * @example
	 * The `--no-telemetry` flag is stored as `no-telemetry`.
	 */
	parsedFlags: Record<string, string | boolean | undefined>;
}

/**
 * Defines a command that can be rendered in help output and executed with a
 * fully resolved CLI context.
 *
 * @remarks
 * Commands are intentionally data-first so product CLIs can build menus,
 * telemetry labels, and nested command trees from the same object. The action
 * receives the resolved context after flags, package manager detection,
 * framework detection, logging, and telemetry have been initialized.
 *
 * @typeParam TContext - CLI context shape required by this command. Extend the
 * base context when a product CLI injects additional services or configuration.
 *
 * @example
 * ```ts
 * const command: CliCommand = {
 *   name: 'init',
 *   label: 'Initialize project',
 *   hint: 'Scaffold config files',
 *   description: 'Creates project configuration files.',
 *   async action(context) {
 *     context.logger.info(`Running in ${context.projectRoot}`);
 *   },
 * };
 * ```
 */
export interface CliCommand<TContext extends CliContext = CliContext> {
	/**
	 * Stable command name accepted on the command line.
	 */
	name: string;
	/**
	 * Short display label for menus or selection prompts.
	 */
	label: string;
	/**
	 * Compact hint for interactive command menus.
	 */
	hint: string;
	/**
	 * Longer explanation used in help output.
	 */
	description: string;
	/**
	 * Command implementation.
	 *
	 * @remarks
	 * Throw `CliError` when possible so shared error handling can render
	 * catalog hints and documentation links.
	 */
	action: (context: TContext) => Promise<void>;
	/**
	 * Optional nested command list consumed by `parseSubcommand` and custom
	 * command routers.
	 */
	subcommands?: CliCommand<TContext>[];
	/**
	 * Hides the command from generated help and menu UIs without preventing
	 * direct execution by a custom router.
	 */
	hidden?: boolean;
}

/**
 * Minimal package metadata loaded from a project's `package.json`.
 */
export interface PackageInfo {
	/**
	 * Package name, or `unknown` when no readable package name exists.
	 */
	name: string;
	/**
	 * Package version, or `unknown` when no readable package version exists.
	 */
	version: string;
	/**
	 * Additional package.json fields preserved for callers that need them.
	 */
	[key: string]: unknown;
}

/**
 * Result of inspecting project dependencies for a known frontend framework.
 *
 * @typeParam TPackage - Product-specific package identifier selected from a
 * `FrameworkPackageMap`.
 */
export interface FrameworkDetectionResult<TPackage extends string = string> {
	/**
	 * Detected framework display name, or `null` when no supported framework was
	 * found.
	 */
	framework: string | null;
	/**
	 * Version range read from `package.json` for the detected framework.
	 */
	frameworkVersion: string | null;
	/**
	 * Product package identifier associated with the detected framework.
	 */
	pkg: TPackage | null;
	/**
	 * Whether any React dependency was found.
	 */
	hasReact: boolean;
	/**
	 * React version range read from `package.json`, if present.
	 */
	reactVersion: string | null;
	/**
	 * Tailwind CSS version range read from `package.json`, if present.
	 */
	tailwindVersion: string | null;
}

/**
 * Package managers Hexbus can detect and render commands for.
 */
export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'bun';

/**
 * Package manager command templates resolved for the current project.
 */
export interface PackageManagerResult {
	/**
	 * Detected package manager name.
	 */
	name: PackageManager;
	/**
	 * Command used to install existing dependencies.
	 */
	installCommand: string;
	/**
	 * Command prefix used to add new dependencies.
	 */
	addCommand: string;
	/**
	 * Command prefix used to run package scripts.
	 */
	runCommand: string;
	/**
	 * Command prefix used to execute package binaries without installing them
	 * globally.
	 */
	execCommand: string;
	/**
	 * Optional detected package manager version.
	 */
	version?: string | null;
}

/**
 * User-facing logger abstraction used by Hexbus commands.
 *
 * @remarks
 * The interface mirrors the small subset of logging and prompt output that
 * command authors need. It keeps command code independent from the concrete
 * prompt renderer used by `createCliLogger`.
 */
export interface CliLogger {
	/**
	 * Emits a debug message when the active log level allows debug output.
	 */
	debug(message: string, ...args: unknown[]): void;
	/**
	 * Emits an informational message.
	 */
	info(message: string, ...args: unknown[]): void;
	/**
	 * Emits a warning message.
	 */
	warn(message: string, ...args: unknown[]): void;
	/**
	 * Emits an error message.
	 */
	error(message: string, ...args: unknown[]): void;
	/**
	 * Emits an unadorned message without log-level filtering.
	 */
	message(message: string): void;
	/**
	 * Renders a note block with optional title.
	 */
	note(content: string, title?: string): void;
	/**
	 * Renders a closing message for a completed interaction.
	 */
	outro(message: string): void;
	/**
	 * Renders a successful completion message.
	 */
	success(message: string): void;
	/**
	 * Renders a failure message and terminates the process.
	 *
	 * @throws Never returns because it exits the current process.
	 */
	failed(message: string, exitCode?: number): never;
	/**
	 * Renders a numbered progress step.
	 */
	step(current: number, total: number, label: string): void;
}

/**
 * Shared process-ending error and cancellation handlers.
 */
export interface ErrorHandlers {
	/**
	 * Normalizes, displays, tracks, and exits for an unknown thrown value.
	 */
	handleError(error: unknown, command: string): never;
	/**
	 * Displays a cancellation message and exits successfully.
	 */
	handleCancel(
		message?: string,
		context?: { command?: string; stage?: string }
	): never;
}

/**
 * Configuration loading helpers attached to a CLI context.
 */
export interface ConfigManagement {
	/**
	 * Loads optional configuration for the current project.
	 *
	 * @typeParam TConfig - Expected user configuration shape.
	 * @returns The parsed config object, or `null` when no config is found.
	 */
	loadConfig<TConfig = unknown>(): Promise<TConfig | null>;
	/**
	 * Loads required configuration for the current project.
	 *
	 * @typeParam TConfig - Expected user configuration shape.
	 * @throws `CliError` with `CONFIG_NOT_FOUND` when no config is found.
	 */
	requireConfig<TConfig = unknown>(): Promise<TConfig>;
	/**
	 * Reads TypeScript-style path aliases from configuration when supported.
	 *
	 * @remarks
	 * The default Hexbus context currently returns `null`; product CLIs can
	 * override this method when they provide config-aware file resolution.
	 */
	getPathAliases(configPath?: string): Record<string, string> | null;
}

/**
 * File-system helpers rooted in the detected project.
 */
export interface FileSystemUtils {
	/**
	 * Reads project package metadata.
	 */
	getPackageInfo(): PackageInfo;
	/**
	 * Tests whether a file-system path exists.
	 */
	exists(path: string): Promise<boolean>;
	/**
	 * Reads a UTF-8 text file.
	 */
	read(path: string): Promise<string>;
	/**
	 * Writes a UTF-8 text file.
	 */
	write(path: string, content: string): Promise<void>;
	/**
	 * Creates a directory and any missing parents.
	 */
	mkdir(path: string): Promise<void>;
}

/**
 * Telemetry client used by CLI lifecycle and command code.
 *
 * @remarks
 * The built-in implementation queues events in memory and flushes them only
 * when an endpoint is configured. Commands should treat telemetry as best
 * effort and never depend on it for core behavior.
 */
export interface Telemetry {
	/**
	 * Queues a named telemetry event.
	 */
	trackEvent(eventName: string, properties?: Record<string, unknown>): void;
	/**
	 * Queues a standardized command invocation event.
	 */
	trackCommand(
		command: string,
		args?: string[],
		flags?: Record<string, string | number | boolean | undefined>
	): void;
	/**
	 * Queues a standardized error event.
	 */
	trackError(error: Error, command?: string): void;
	/**
	 * Sends queued events when possible and clears the local queue.
	 */
	flush(): Promise<void>;
	/**
	 * Performs final telemetry cleanup before process exit.
	 */
	shutdown(): Promise<void>;
	/**
	 * Indicates whether this telemetry instance is disabled.
	 */
	isDisabled(): boolean;
}

/**
 * Fully resolved execution context passed to command actions.
 *
 * @remarks
 * `createCliContext` builds this object once per invocation after parsing raw
 * arguments, detecting the project root, selecting framework/package-manager
 * metadata, and initializing logger, config, file-system, and telemetry
 * services.
 *
 * @typeParam TPackage - Product-specific package identifier selected during
 * framework detection.
 */
export interface CliContext<TPackage extends string = string> {
	/**
	 * Logger for command output.
	 */
	logger: CliLogger;
	/**
	 * Parsed global flags keyed by primary flag name.
	 */
	flags: ParsedArgs['parsedFlags'];
	/**
	 * Matched top-level command name, if one was provided.
	 */
	commandName: string | undefined;
	/**
	 * Positional arguments remaining after command parsing.
	 */
	commandArgs: string[];
	/**
	 * Original working directory where context creation began.
	 */
	cwd: string;
	/**
	 * Shared process-ending error handlers.
	 */
	error: ErrorHandlers;
	/**
	 * Configuration loading helpers.
	 */
	config: ConfigManagement;
	/**
	 * File-system helpers rooted at `projectRoot`.
	 */
	fs: FileSystemUtils;
	/**
	 * Telemetry client for lifecycle and command events.
	 */
	telemetry: Telemetry;
	/**
	 * Prompts the user to confirm an action.
	 *
	 * @remarks
	 * Returns `true` without prompting when `-y` or `--yes` was provided.
	 */
	confirm(message: string, initialValue?: boolean): Promise<boolean>;
	/**
	 * Nearest ancestor directory containing `package.json`, or `cwd` when none
	 * was found.
	 */
	projectRoot: string;
	/**
	 * Framework and package selection metadata for the detected project.
	 */
	framework: FrameworkDetectionResult<TPackage>;
	/**
	 * Package manager commands for the detected project.
	 */
	packageManager: PackageManagerResult;
}
