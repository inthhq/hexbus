import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	checkForUpdate,
	detectInstallSource,
	formatUpdateHint,
	getUpdateCommand,
	isVersionRequest,
	printVersionInfo,
	startBackgroundUpdateCheck,
} from './index';

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
const tempDirs: string[] = [];

function createTempDir(): string {
	const tempDir = fsSync.mkdtempSync(
		path.join(os.tmpdir(), 'hexbus-version-test-')
	);
	tempDirs.push(tempDir);
	return tempDir;
}

function writeCache(
	cacheDir: string,
	packageName: string,
	version: string,
	fetchedAt: number
): void {
	const cachePath = path.join(
		cacheDir,
		`${packageName.replaceAll('/', '__').replaceAll('@', '')}.json`
	);
	fsSync.mkdirSync(path.dirname(cachePath), { recursive: true });
	fsSync.writeFileSync(
		cachePath,
		`${JSON.stringify({ version, fetchedAt })}\n`
	);
}

function createFetchMock(version: string) {
	return vi.fn(async () => {
		return new Response(JSON.stringify({ version }), {
			status: 200,
			headers: { 'content-type': 'application/json' },
		});
	});
}

beforeEach(() => {
	process.env = { ...originalEnv };
	delete process.env.BUN_INSTALL;
	delete process.env.npm_command;
	delete process.env.npm_config_prefix;
});

afterEach(async () => {
	vi.restoreAllMocks();
	globalThis.fetch = originalFetch;
	process.env = { ...originalEnv };
	await Promise.all(
		tempDirs
			.splice(0)
			.map((tempDir) => fs.rm(tempDir, { recursive: true, force: true }))
	);
});

describe('isVersionRequest', () => {
	it('detects version flags without parsing full CLI args', () => {
		expect(isVersionRequest(['-v'])).toBe(true);
		expect(isVersionRequest(['--version'])).toBe(true);
		expect(isVersionRequest(['setup', '--force'])).toBe(false);
	});
});

describe('detectInstallSource', () => {
	it.each([
		['/opt/homebrew/Cellar/minimal-cli/0.1.0/bin/minimal-cli', 'brew'],
		['/usr/local/lib/node_modules/minimal-cli/dist/index.mjs', 'npm-global'],
		['/Users/me/.npm/_npx/abc/node_modules/.bin/minimal-cli', 'npx'],
		['/Users/me/.bun/install/cache/minimal-cli/index.mjs', 'bunx'],
		[
			'/Users/me/.pnpm-store/v3/dlx-abc/node_modules/.bin/minimal-cli',
			'pnpm-dlx',
		],
		[
			'/Users/me/.yarn/berry/cache/minimal-cli.zip/node_modules/.bin/minimal-cli',
			'yarn-dlx',
		],
		['/path/to/project/node_modules/.bin/minimal-cli', 'local'],
		['/unknown/minimal-cli', 'unknown'],
	] as const)('detects %s as %s', (binPath, expected) => {
		expect(detectInstallSource(binPath)).toBe(expected);
	});
});

describe('getUpdateCommand', () => {
	it.each([
		['npm-global', 'npm install -g minimal-cli@latest'],
		['brew', 'brew upgrade minimal-cli'],
		['local', 'npm install minimal-cli@latest'],
		['npx', null],
		['bunx', null],
		['pnpm-dlx', null],
		['yarn-dlx', null],
		['unknown', null],
	] as const)('returns the update command for %s', (source, expected) => {
		expect(getUpdateCommand(source, 'minimal-cli')).toBe(expected);
	});
});

describe('checkForUpdate', () => {
	it('fetches and writes cache when cache is missing', async () => {
		const cacheDir = createTempDir();
		const fetchMock = createFetchMock('1.2.0');
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const result = await checkForUpdate({
			packageName: 'minimal-cli',
			currentVersion: '1.0.0',
			cacheDir,
			binPath: '/usr/local/lib/node_modules/minimal-cli/dist/index.mjs',
			now: () => 1000,
		});

		expect(fetchMock).toHaveBeenCalledOnce();
		expect(result.latestVersion).toBe('1.2.0');
		expect(result.isOutdated).toBe(true);
		expect(result.updateCommand).toBe('npm install -g minimal-cli@latest');

		const cachePath = path.join(cacheDir, 'minimal-cli.json');
		const cache = JSON.parse(fsSync.readFileSync(cachePath, 'utf-8')) as {
			version: string;
			fetchedAt: number;
		};
		expect(cache).toEqual({ version: '1.2.0', fetchedAt: 1000 });
	});

	it('uses cached versions without fetching, even when stale', async () => {
		const cacheDir = createTempDir();
		writeCache(cacheDir, 'minimal-cli', '1.10.0', 0);
		const fetchMock = createFetchMock('2.0.0');
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const result = await checkForUpdate({
			packageName: 'minimal-cli',
			currentVersion: '1.2.0',
			cacheDir,
			cacheTtlMs: 1,
			binPath: '/usr/local/lib/node_modules/minimal-cli/dist/index.mjs',
			now: () => 1000,
		});

		expect(fetchMock).not.toHaveBeenCalled();
		expect(result.latestVersion).toBe('1.10.0');
		expect(result.isOutdated).toBe(true);
	});

	it('returns a null latest version on fetch failure', async () => {
		const cacheDir = createTempDir();
		globalThis.fetch = vi.fn(async () => {
			throw new Error('network down');
		}) as unknown as typeof fetch;

		const result = await checkForUpdate({
			packageName: 'minimal-cli',
			currentVersion: '1.0.0',
			cacheDir,
			binPath: '/usr/local/lib/node_modules/minimal-cli/dist/index.mjs',
		});

		expect(result.latestVersion).toBeNull();
		expect(result.isOutdated).toBe(false);
	});

	it('uses filesystem-safe cache names for unusual package names', async () => {
		const cacheDir = createTempDir();
		const fetchMock = createFetchMock('1.2.0');
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		await checkForUpdate({
			packageName: '@Scope/CON:bad package',
			currentVersion: '1.0.0',
			cacheDir,
		});

		const entries = fsSync.readdirSync(cacheDir);
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatch(/^[a-z0-9._-]+\.json$/);
		expect(entries[0]).not.toMatch(/^con(?:\.|$)/i);
	});

	it('cleans up temp cache files when atomic writes fail', async () => {
		const cacheDir = createTempDir();
		const fetchMock = createFetchMock('1.2.0');
		const cachePath = path.join(cacheDir, 'minimal-cli.json');
		fsSync.mkdirSync(cachePath);
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		await expect(
			checkForUpdate({
				packageName: 'minimal-cli',
				currentVersion: '1.0.0',
				cacheDir,
			})
		).rejects.toThrow();

		const tempPath = `${cachePath}.${process.pid}.tmp`;
		expect(fsSync.existsSync(tempPath)).toBe(false);
	});
});

describe('formatUpdateHint', () => {
	it('uses careful Homebrew wording', () => {
		const hint = formatUpdateHint({
			currentVersion: '1.0.0',
			latestVersion: '1.2.0',
			isOutdated: true,
			source: 'brew',
			updateCommand: 'brew upgrade minimal-cli',
			hint: null,
		});

		expect(hint).toContain('Latest npm version is');
		expect(hint).toContain('brew upgrade minimal-cli');
	});
});

describe('printVersionInfo', () => {
	it('prints version before update hints', async () => {
		const cacheDir = createTempDir();
		writeCache(cacheDir, 'minimal-cli', '1.2.0', 1000);
		const calls: string[] = [];

		await printVersionInfo({
			appName: 'minimal-cli',
			packageName: 'minimal-cli',
			currentVersion: '1.0.0',
			cacheDir,
			binPath: '/usr/local/lib/node_modules/minimal-cli/dist/index.mjs',
			logger: {
				message: (message) => calls.push(`message:${message}`),
				note: (content, title) => calls.push(`note:${title}:${content}`),
			},
		});

		expect(calls[0]).toBe('message:minimal-cli v1.0.0');
		expect(calls[1]).toContain('note:Update available:');
	});
});

describe('startBackgroundUpdateCheck', () => {
	it('prints cached hints synchronously and refreshes stale cache without awaiting it', async () => {
		const cacheDir = createTempDir();
		writeCache(cacheDir, 'minimal-cli', '1.2.0', 0);
		const fetchMock = createFetchMock('1.3.0');
		globalThis.fetch = fetchMock as unknown as typeof fetch;
		const calls: string[] = [];

		startBackgroundUpdateCheck({
			appName: 'minimal-cli',
			packageName: 'minimal-cli',
			currentVersion: '1.0.0',
			cacheDir,
			cacheTtlMs: 1,
			binPath: '/usr/local/lib/node_modules/minimal-cli/dist/index.mjs',
			now: () => 1000,
			logger: {
				message: (message) => calls.push(`message:${message}`),
				note: (content, title) => calls.push(`note:${title}:${content}`),
			},
		});

		expect(calls).toHaveLength(1);
		expect(calls[0]).toContain('Update available');
		expect(fetchMock).toHaveBeenCalledOnce();

		await vi.waitFor(() => {
			const cache = JSON.parse(
				fsSync.readFileSync(path.join(cacheDir, 'minimal-cli.json'), 'utf-8')
			) as { version: string };
			expect(cache.version).toBe('1.3.0');
		});
	});
});
