import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { CachedVersion, UpdateCheckOptions } from './types';

const DEFAULT_REGISTRY_URL = 'https://registry.npmjs.org';
const DEFAULT_TIMEOUT_MS = 1500;
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

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

export function readCachedVersion(
	options: UpdateCheckOptions
): CachedVersion | null {
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

export function isCacheFresh(
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

export async function refreshCache(
	options: UpdateCheckOptions
): Promise<string | null> {
	const latestVersion = await fetchLatestVersion(options);
	if (latestVersion) {
		await writeCachedVersion(options, latestVersion);
	}
	return latestVersion;
}
