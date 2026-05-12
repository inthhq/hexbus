import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { color } from './logger';
import type { CliLogger } from './types';

/**
 * Installation source inferred from the running binary path and package manager
 * environment.
 */
export type InstallSource =
	| 'npm-global'
	| 'brew'
	| 'npx'
	| 'bunx'
	| 'pnpm-dlx'
	| 'yarn-dlx'
	| 'local'
	| 'unknown';

/**
 * Result returned by an update check.
 */
export interface UpdateCheckResult {
	/**
	 * Version currently running.
	 */
	currentVersion: string;
	/**
	 * Latest version fetched from the registry or cache, or `null` when lookup
	 * failed.
	 */
	latestVersion: string | null;
	/**
	 * Whether `latestVersion` is newer than `currentVersion`.
	 */
	isOutdated: boolean;
	/**
	 * Detected installation source for the current binary.
	 */
	source: InstallSource;
	/**
	 * Update command appropriate for the detected source, when Hexbus can infer
	 * one.
	 */
	updateCommand: string | null;
	/**
	 * User-facing update hint, or `null` when no actionable update is available.
	 */
	hint: string | null;
}

/**
 * Options for checking package registry state and update hints.
 */
export interface UpdateCheckOptions {
	/**
	 * Published package name to query.
	 */
	packageName: string;
	/**
	 * Version currently running.
	 */
	currentVersion: string;
	/**
	 * Homebrew formula name used for Homebrew update hints.
	 *
	 * @default packageName
	 */
	brewFormula?: string;
	/**
	 * Registry base URL used to fetch latest package metadata.
	 *
	 * @default "https://registry.npmjs.org"
	 */
	registryUrl?: string;
	/**
	 * Maximum registry request duration in milliseconds.
	 *
	 * @default 1500
	 */
	timeoutMs?: number;
	/**
	 * Directory where latest-version cache files are stored.
	 *
	 * @default path.join(os.tmpdir(), "hexbus-version-cache")
	 */
	cacheDir?: string;
	/**
	 * How long cached latest-version data stays fresh.
	 *
	 * @default 86400000
	 */
	cacheTtlMs?: number;
	/**
	 * Binary path used for installation-source detection.
	 *
	 * @default process.argv[1]
	 */
	binPath?: string;
	/**
	 * Clock override used by tests and deterministic callers.
	 *
	 * @default Date.now
	 */
	now?: () => number;
}

type VersionInfoLogger = Pick<CliLogger, 'message' | 'note'> &
	Partial<Pick<CliLogger, 'debug'>>;

/**
 * Options for printing or background-checking CLI version information.
 */
export interface VersionInfoOptions extends UpdateCheckOptions {
	/**
	 * Application name shown in version output.
	 */
	appName: string;
	/**
	 * Logger used for version output, update hints, and optional debug messages.
	 */
	logger?: VersionInfoLogger;
}

interface CachedVersion {
	version: string;
	fetchedAt: number;
}

const DEFAULT_REGISTRY_URL = 'https://registry.npmjs.org';
const DEFAULT_TIMEOUT_MS = 1500;
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const defaultLogger: VersionInfoLogger = {
	message(message: string) {
		process.stdout.write(`${message}\n`);
	},
	note(content: string, title?: string) {
		const prefix = title ? `${title}\n` : '';
		process.stdout.write(`${prefix}${content}\n`);
	},
};

/**
 * Checks whether raw arguments request version output.
 *
 * @param rawArgs - Arguments after executable and script path.
 * @returns `true` when `-v` or `--version` is present.
 */
export function isVersionRequest(rawArgs: string[]): boolean {
	return rawArgs.includes('-v') || rawArgs.includes('--version');
}

function normalizePath(filePath: string): string {
	return filePath.replaceAll('\\', '/');
}

function expandHomePrefix(prefix: string): string {
	if (!prefix.startsWith('~/')) {
		return prefix;
	}
	return path.join(os.homedir(), prefix.slice(2));
}

function safeRealpath(filePath: string): string {
	try {
		return fsSync.realpathSync(filePath);
	} catch {
		return filePath;
	}
}

function isPathUnder(candidate: string, parent: string): boolean {
	const normalizedCandidate = normalizePath(path.resolve(candidate));
	const normalizedParent = normalizePath(
		path.resolve(expandHomePrefix(parent))
	);
	return (
		normalizedCandidate === normalizedParent ||
		normalizedCandidate.startsWith(`${normalizedParent}/`)
	);
}

function envValue(name: string): string | undefined {
	return process.env[name];
}

/**
 * Infers how the current CLI binary was installed.
 *
 * @remarks
 * Detection is heuristic and based on binary path, realpath, and package
 * manager environment variables. Unknown or transient install modes return
 * `unknown` instead of throwing.
 *
 * @param binPath - Binary path to inspect.
 * @returns The inferred installation source.
 */
export function detectInstallSource(
	binPath = process.argv[1] ?? ''
): InstallSource {
	const rawPath = binPath || '';
	const resolvedPath = normalizePath(safeRealpath(rawPath));
	const npmPrefix = envValue('npm_config_prefix');

	if (
		resolvedPath.includes('/opt/homebrew/') ||
		resolvedPath.includes('/usr/local/Cellar/') ||
		resolvedPath.includes('/home/linuxbrew/') ||
		resolvedPath.includes('/Homebrew/Cellar/')
	) {
		return 'brew';
	}

	if (
		resolvedPath.includes('/.npm/_npx/') ||
		resolvedPath.includes('/_npx/') ||
		process.env.npm_command === 'exec'
	) {
		return 'npx';
	}

	if (
		resolvedPath.includes('/.bun/install/cache/') ||
		Boolean(envValue('BUN_INSTALL'))
	) {
		return 'bunx';
	}

	if (
		resolvedPath.includes('/.pnpm-store/') ||
		resolvedPath.includes('/dlx-')
	) {
		return 'pnpm-dlx';
	}

	if (
		resolvedPath.includes('/.yarn/berry/cache/') ||
		resolvedPath.includes('/yarn/dlx-')
	) {
		return 'yarn-dlx';
	}

	if (
		resolvedPath.includes('/node_modules/.bin/') ||
		resolvedPath.endsWith('/node_modules/.bin')
	) {
		return 'local';
	}

	const npmGlobalPrefixes = [
		'/usr/local/lib/node_modules',
		'~/.npm-global/lib/node_modules',
		'~/.nvm/versions/node',
		process.env.APPDATA ? `${process.env.APPDATA}/npm/node_modules` : null,
		npmPrefix ? `${npmPrefix}/lib/node_modules` : null,
	].filter((item): item is string => typeof item === 'string');

	if (
		npmGlobalPrefixes.some((prefix) => {
			const expandedPrefix = expandHomePrefix(prefix);
			if (prefix.endsWith('/node')) {
				return (
					resolvedPath.includes('/.nvm/versions/node/') &&
					resolvedPath.includes('/lib/node_modules/')
				);
			}
			return isPathUnder(resolvedPath, expandedPrefix);
		})
	) {
		return 'npm-global';
	}

	return 'unknown';
}

/**
 * Builds an update command for an installation source.
 *
 * @param source - Installation source returned by `detectInstallSource`.
 * @param packageName - Package name to update.
 * @param brewFormula - Homebrew formula name when `source` is `brew`.
 * @returns A command string when the source has an actionable update path,
 * otherwise `null`.
 */
export function getUpdateCommand(
	source: InstallSource,
	packageName: string,
	brewFormula = packageName
): string | null {
	switch (source) {
		case 'npm-global':
			return `npm install -g ${packageName}@latest`;
		case 'brew':
			return `brew upgrade ${brewFormula}`;
		case 'local':
			return `npm install ${packageName}@latest`;
		default:
			return null;
	}
}

function sanitizeCacheName(packageName: string): string {
	return packageName.replaceAll('/', '__').replaceAll('@', '');
}

function getCacheDir(options: UpdateCheckOptions): string {
	return options.cacheDir ?? path.join(os.tmpdir(), 'hexbus-version-cache');
}

function getCachePath(options: UpdateCheckOptions): string {
	return path.join(
		getCacheDir(options),
		`${sanitizeCacheName(options.packageName)}.json`
	);
}

function readCachedVersion(options: UpdateCheckOptions): CachedVersion | null {
	try {
		const content = fsSync.readFileSync(getCachePath(options), 'utf-8');
		const parsed = JSON.parse(content) as Partial<CachedVersion>;
		if (
			typeof parsed.version === 'string' &&
			typeof parsed.fetchedAt === 'number'
		) {
			return { version: parsed.version, fetchedAt: parsed.fetchedAt };
		}
	} catch {
		// Cache misses and corrupt cache files are non-fatal.
	}
	return null;
}

function isCacheFresh(
	cache: CachedVersion,
	options: UpdateCheckOptions
): boolean {
	const now = options.now?.() ?? Date.now();
	const ttl = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
	return now - cache.fetchedAt < ttl;
}

async function writeCachedVersion(
	options: UpdateCheckOptions,
	version: string
): Promise<void> {
	const cachePath = getCachePath(options);
	const cacheDir = path.dirname(cachePath);
	const tempPath = `${cachePath}.${process.pid}.tmp`;
	const payload: CachedVersion = {
		version,
		fetchedAt: options.now?.() ?? Date.now(),
	};

	await fs.mkdir(cacheDir, { recursive: true });
	await fs.writeFile(tempPath, `${JSON.stringify(payload)}\n`, 'utf-8');
	await fs.rename(tempPath, cachePath);
}

function parseVersionParts(version: string): number[] {
	const coreVersion = version.replace(/^[^\d]*/, '').split('-')[0] ?? '';
	return coreVersion.split('.').map((part) => {
		const parsed = Number.parseInt(part.replace(/\D.*$/, ''), 10);
		return Number.isNaN(parsed) ? 0 : parsed;
	});
}

function compareVersions(left: string, right: string): number {
	const leftParts = parseVersionParts(left);
	const rightParts = parseVersionParts(right);
	const length = Math.max(leftParts.length, rightParts.length);

	for (let index = 0; index < length; index++) {
		const leftValue = leftParts[index] ?? 0;
		const rightValue = rightParts[index] ?? 0;
		if (leftValue > rightValue) {
			return 1;
		}
		if (leftValue < rightValue) {
			return -1;
		}
	}

	return 0;
}

function createResult(
	options: UpdateCheckOptions,
	latestVersion: string | null
): UpdateCheckResult {
	const source = detectInstallSource(options.binPath);
	const updateCommand = getUpdateCommand(
		source,
		options.packageName,
		options.brewFormula
	);
	const isOutdated =
		typeof latestVersion === 'string' &&
		compareVersions(options.currentVersion, latestVersion) < 0;
	const result: Omit<UpdateCheckResult, 'hint'> = {
		currentVersion: options.currentVersion,
		latestVersion,
		isOutdated,
		source,
		updateCommand,
	};
	const hint = formatUpdateHint({ ...result, hint: null });
	return { ...result, hint };
}

async function fetchLatestVersion(
	options: UpdateCheckOptions
): Promise<string | null> {
	const controller = new AbortController();
	const timeout = setTimeout(
		() => controller.abort(),
		options.timeoutMs ?? DEFAULT_TIMEOUT_MS
	);
	const registryUrl = options.registryUrl ?? DEFAULT_REGISTRY_URL;
	const encodedName = encodeURIComponent(options.packageName);

	try {
		const response = await fetch(
			`${registryUrl.replace(/\/$/, '')}/${encodedName}/latest`,
			{
				signal: controller.signal,
			}
		);
		if (!response.ok) {
			return null;
		}
		const payload = (await response.json()) as { version?: unknown };
		return typeof payload.version === 'string' ? payload.version : null;
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}

async function refreshCache(
	options: UpdateCheckOptions
): Promise<string | null> {
	const latestVersion = await fetchLatestVersion(options);
	if (latestVersion) {
		await writeCachedVersion(options, latestVersion);
	}
	return latestVersion;
}

/**
 * Checks whether a newer package version is available.
 *
 * @remarks
 * The function first reads the local cache. On a cache miss it fetches the
 * latest version from the configured registry and writes the cache on success.
 * Registry failures produce a result with `latestVersion: null` rather than
 * throwing.
 *
 * @param options - Update-check configuration.
 * @returns Update metadata and a formatted hint when an update is available.
 */
export async function checkForUpdate(
	options: UpdateCheckOptions
): Promise<UpdateCheckResult> {
	const cached = readCachedVersion(options);
	if (cached) {
		return createResult(options, cached.version);
	}

	const latestVersion = await refreshCache(options);
	return createResult(options, latestVersion);
}

/**
 * Formats a user-facing update hint from an update-check result.
 *
 * @param result - Update-check result to render.
 * @returns A formatted hint when the result is outdated and has an update
 * command, otherwise `null`.
 */
export function formatUpdateHint(result: UpdateCheckResult): string | null {
	if (
		!result.isOutdated ||
		result.updateCommand === null ||
		result.latestVersion === null
	) {
		return null;
	}

	if (result.source === 'brew') {
		return [
			`Latest npm version is ${color.green(result.latestVersion)}.`,
			'If you installed with Homebrew, update with:',
			`  ${color.cyan(result.updateCommand)}`,
		].join('\n');
	}

	return [
		`A new version is available: ${color.dim(result.currentVersion)} -> ${color.green(result.latestVersion)}`,
		'Update with:',
		`  ${color.cyan(result.updateCommand)}`,
	].join('\n');
}

/**
 * Prints CLI version information and any available update hint.
 *
 * @param options - Version display and update-check options.
 */
export async function printVersionInfo(
	options: VersionInfoOptions
): Promise<void> {
	const logger = options.logger ?? defaultLogger;
	logger.message(`${options.appName} v${options.currentVersion}`);

	const result = await checkForUpdate(options);
	if (result.hint) {
		logger.note(result.hint, 'Update available');
	}
}

/**
 * Starts a non-blocking update check.
 *
 * @remarks
 * Cached hints are displayed synchronously when available. If the cache is
 * stale or missing, a refresh is started in the background and failures are
 * only logged at debug level.
 *
 * @param options - Version display and update-check options.
 */
export function startBackgroundUpdateCheck(options: VersionInfoOptions): void {
	const logger = options.logger ?? defaultLogger;
	const cached = readCachedVersion(options);

	if (cached) {
		const result = createResult(options, cached.version);
		if (result.hint) {
			logger.note(result.hint, 'Update available');
		}
	}

	if (cached && isCacheFresh(cached, options)) {
		return;
	}

	void refreshCache(options).catch((error: unknown) => {
		logger.debug?.(
			`Update check failed: ${error instanceof Error ? error.message : String(error)}`
		);
	});
}
