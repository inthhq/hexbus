import { color } from '../logger';
import { compareVersions } from './compare';
import { detectInstallSource, getUpdateCommand } from './install-source';
import { readCachedVersion, refreshCache } from './registry';
import type { UpdateCheckOptions, UpdateCheckResult } from './types';

/**
 * Checks whether raw arguments request version output.
 *
 * @param rawArgs - Arguments after executable and script path.
 * @returns `true` when `-v` or `--version` is present.
 */
export function isVersionRequest(rawArgs: string[]): boolean {
	return rawArgs.includes('-v') || rawArgs.includes('--version');
}

export function createUpdateCheckResult(
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
		return createUpdateCheckResult(options, cached.version);
	}

	const latestVersion = await refreshCache(options);
	return createUpdateCheckResult(options, latestVersion);
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
