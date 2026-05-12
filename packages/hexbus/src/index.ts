/**
 * Core exports for building product CLIs with Hexbus.
 *
 * @remarks
 * The package provides a small CLI chassis: argument parsing, context
 * creation, command contracts, logging, confirmation prompts, error handling,
 * telemetry, environment detection, spinners, help output, and update hints.
 *
 * @packageDocumentation
 */

export {
	type CreateContextOptions,
	createCliContext,
	createTestContext,
} from './context';
export {
	detectFramework,
	detectPackageManager,
	detectProjectRoot,
	type FrameworkPackageMap,
	getExecCommand,
	getInstallCommand,
	getRunCommand,
} from './detection';
export {
	CliError,
	createErrorHandlers,
	DEFAULT_ERROR_CATALOG,
	type ErrorCatalog,
	type ErrorCatalogEntry,
	type ErrorCode,
	extendErrorCatalog,
	isCliError,
	withErrorHandling,
} from './errors';
export { type ShowHelpMenuOptions, showHelpMenu } from './help';
export { type DisplayIntroOptions, displayIntro } from './intro';
export {
	color,
	createCliLogger,
	formatLogMessage,
	formatStep,
	LOG_LEVELS,
	logMessage,
	validLogLevels,
} from './logger';
export {
	formatFlagHelp,
	generateFlagsHelp,
	getFlagValue,
	globalFlags,
	hasFlag,
	parseCliArgs,
	parseSubcommand,
} from './parser';
export {
	createSpinner,
	type Spinner,
	withSpinner,
} from './spinner';
export {
	createDisabledTelemetry,
	createTelemetry,
	TelemetryEventName,
	type TelemetryEventNameType,
	type TelemetryOptions,
} from './telemetry';
export type {
	CliCommand,
	CliContext,
	CliFlag,
	CliLogger,
	ConfigManagement,
	ErrorHandlers,
	FileSystemUtils,
	FlagType,
	FrameworkDetectionResult,
	LogLevel,
	PackageInfo,
	PackageManager,
	PackageManagerResult,
	ParsedArgs,
	Telemetry,
} from './types';
export {
	checkForUpdate,
	detectInstallSource,
	formatUpdateHint,
	getUpdateCommand,
	type InstallSource,
	isVersionRequest,
	printVersionInfo,
	startBackgroundUpdateCheck,
	type UpdateCheckOptions,
	type UpdateCheckResult,
	type VersionInfoOptions,
} from './version-check';
