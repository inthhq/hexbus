import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { color } from './logger';
import type { CliLogger } from './types';

export type InstallSource =
	| 'npm-global'
	| 'brew'
	| 'npx'
	| 'bunx'
	| 'pnpm-dlx'
	| 'yarn-dlx'
	| 'local'
	| 'unknown';

export interface UpdateCheckResult {
	currentVersion: string;
	latestVersion: string | null;
	isOutdated: boolean;
	source: InstallSource;
	updateCommand: string | null;
	hint: string | null;
}

export interface UpdateCheckOptions {
	packageName: string;
	currentVersion: string;
	brewFormula?: string;
	registryUrl?: string;
	timeoutMs?: number;
	cacheDir?: string;
	cacheTtlMs?: number;
	binPath?: string;
	now?: () => number;
}

type VersionInfoLogger = Pick<CliLogger, 'message' | 'note'> &
	Partial<Pick<CliLogger, 'debug'>>;

export interface VersionInfoOptions extends UpdateCheckOptions {
	appName: string;
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
