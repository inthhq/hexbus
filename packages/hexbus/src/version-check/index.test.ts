import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { compareVersions } from "./compare";
import {
  checkForUpdate,
  detectInstallSource,
  formatUpdateHint,
  getUpdateCommand,
  isVersionRequest,
  printVersionInfo,
  startBackgroundUpdateCheck,
} from "./index";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
const originalArgv = [...process.argv];
const originalExecPath = process.execPath;
const tempDirs: string[] = [];

async function waitForCacheVersion(
  cachePath: string,
  version: string
): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      const cache = JSON.parse(fsSync.readFileSync(cachePath, "utf-8")) as {
        version: string;
      };
      if (cache.version === version) {
        return;
      }
    } catch {
      // The background refresh may not have written the cache yet.
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
  }
  expect(
    JSON.parse(fsSync.readFileSync(cachePath, "utf-8")) as { version: string }
  ).toMatchObject({ version });
}

function createTempDir(): string {
  const tempDir = fsSync.mkdtempSync(
    path.join(os.tmpdir(), "hexbus-version-test-")
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
    `${packageName.replaceAll("/", "__").replaceAll("@", "")}.json`
  );
  fsSync.mkdirSync(path.dirname(cachePath), { recursive: true });
  fsSync.writeFileSync(
    cachePath,
    `${JSON.stringify({ fetchedAt, version })}\n`
  );
}

function createFetchMock(version: string) {
  return vi.fn(
    async () =>
      new Response(JSON.stringify({ version }), {
        headers: { "content-type": "application/json" },
        status: 200,
      })
  );
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
  process.argv = [...originalArgv];
  Object.defineProperty(process, "execPath", {
    configurable: true,
    value: originalExecPath,
  });
  await Promise.all(
    tempDirs
      .splice(0)
      .map((tempDir) => fs.rm(tempDir, { force: true, recursive: true }))
  );
});

describe("isVersionRequest", () => {
  it("detects version flags without parsing full CLI args", () => {
    expect(isVersionRequest(["-v"])).toBe(true);
    expect(isVersionRequest(["--version"])).toBe(true);
    expect(isVersionRequest(["setup", "--force"])).toBe(false);
  });
});

describe("detectInstallSource", () => {
  it.each([
    ["/opt/homebrew/Cellar/minimal-cli/0.1.0/bin/minimal-cli", "brew"],
    ["/usr/local/lib/node_modules/minimal-cli/dist/index.mjs", "npm-global"],
    ["/Users/me/.npm/_npx/abc/node_modules/.bin/minimal-cli", "npx"],
    ["/Users/me/.bun/install/cache/minimal-cli/index.mjs", "bunx"],
    [
      "/Users/me/.pnpm-store/v3/dlx-abc/node_modules/.bin/minimal-cli",
      "pnpm-dlx",
    ],
    [
      "/Users/me/.yarn/berry/cache/minimal-cli.zip/node_modules/.bin/minimal-cli",
      "yarn-dlx",
    ],
    ["/path/to/project/node_modules/.bin/minimal-cli", "local"],
    ["/unknown/minimal-cli", "unknown"],
  ] as const)("detects %s as %s", (binPath, expected) => {
    expect(detectInstallSource(binPath)).toBe(expected);
  });

  it("does not treat BUN_INSTALL alone as bunx evidence", () => {
    process.env.BUN_INSTALL = "/Users/me/.bun";
    process.argv[0] = "/usr/local/bin/node";
    Object.defineProperty(process, "execPath", {
      configurable: true,
      value: "/usr/local/bin/node",
    });

    expect(detectInstallSource("/usr/local/bin/minimal-cli")).toBe("unknown");
  });

  it("detects bunx when BUN_INSTALL has Bun execution evidence", () => {
    process.env.BUN_INSTALL = "/Users/me/.bun";
    process.argv[0] = "/Users/me/.bun/bin/bun";

    expect(detectInstallSource("/Users/me/.bun/install/run/minimal-cli")).toBe(
      "bunx"
    );
  });
});

describe("compareVersions", () => {
  it("orders prerelease versions below their matching release", () => {
    expect(compareVersions("1.0.0-beta.1", "1.0.0")).toBeLessThan(0);
    expect(compareVersions("1.0.0", "1.0.0-beta.1")).toBeGreaterThan(0);
  });

  it("compares prerelease identifiers by semver precedence", () => {
    expect(compareVersions("1.0.0-alpha.2", "1.0.0-alpha.10")).toBeLessThan(0);
    expect(compareVersions("1.0.0-beta.1", "1.0.0-beta.alpha")).toBeLessThan(0);
    expect(compareVersions("1.0.0-beta.2", "1.0.0-beta.1")).toBeGreaterThan(0);
  });
});

describe("getUpdateCommand", () => {
  it.each([
    ["npm-global", "npm install -g minimal-cli@latest"],
    ["brew", "brew upgrade minimal-cli"],
    ["local", "npm install minimal-cli@latest"],
    ["npx", null],
    ["bunx", null],
    ["pnpm-dlx", null],
    ["yarn-dlx", null],
    ["unknown", null],
  ] as const)("returns the update command for %s", (source, expected) => {
    expect(getUpdateCommand(source, "minimal-cli")).toBe(expected);
  });
});

describe("checkForUpdate", () => {
  it("fetches and writes cache when cache is missing", async () => {
    const cacheDir = createTempDir();
    const fetchMock = createFetchMock("1.2.0");
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await checkForUpdate({
      binPath: "/usr/local/lib/node_modules/minimal-cli/dist/index.mjs",
      cacheDir,
      currentVersion: "1.0.0",
      now: () => 1000,
      packageName: "minimal-cli",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.latestVersion).toBe("1.2.0");
    expect(result.isOutdated).toBe(true);
    expect(result.updateCommand).toBe("npm install -g minimal-cli@latest");

    const cachePath = path.join(cacheDir, "minimal-cli.json");
    const cache = JSON.parse(fsSync.readFileSync(cachePath, "utf-8")) as {
      version: string;
      fetchedAt: number;
    };
    expect(cache).toEqual({ fetchedAt: 1000, version: "1.2.0" });
  });

  it("uses cached versions without fetching, even when stale", async () => {
    const cacheDir = createTempDir();
    writeCache(cacheDir, "minimal-cli", "1.10.0", 0);
    const fetchMock = createFetchMock("2.0.0");
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await checkForUpdate({
      binPath: "/usr/local/lib/node_modules/minimal-cli/dist/index.mjs",
      cacheDir,
      cacheTtlMs: 1,
      currentVersion: "1.2.0",
      now: () => 1000,
      packageName: "minimal-cli",
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.latestVersion).toBe("1.10.0");
    expect(result.isOutdated).toBe(true);
  });

  it("returns a null latest version on fetch failure", async () => {
    const cacheDir = createTempDir();
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    const result = await checkForUpdate({
      binPath: "/usr/local/lib/node_modules/minimal-cli/dist/index.mjs",
      cacheDir,
      currentVersion: "1.0.0",
      packageName: "minimal-cli",
    });

    expect(result.latestVersion).toBeNull();
    expect(result.isOutdated).toBe(false);
  });

  it("uses filesystem-safe cache names for unusual package names", async () => {
    const cacheDir = createTempDir();
    const fetchMock = createFetchMock("1.2.0");
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await checkForUpdate({
      cacheDir,
      currentVersion: "1.0.0",
      packageName: "@Scope/CON:bad package",
    });

    const entries = fsSync.readdirSync(cacheDir);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatch(/^[a-z0-9._-]+\.json$/);
    expect(entries[0]).not.toMatch(/^con(?:\.|$)/i);
  });

  it("returns a graceful result and cleans temp cache files when atomic writes fail", async () => {
    const cacheDir = createTempDir();
    const fetchMock = createFetchMock("1.2.0");
    fsSync.mkdirSync(path.join(cacheDir, "minimal-cli.json"));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await checkForUpdate({
      cacheDir,
      currentVersion: "1.0.0",
      packageName: "minimal-cli",
    });

    expect(result.latestVersion).toBeNull();
    expect(result.isOutdated).toBe(false);
    expect(
      fsSync
        .readdirSync(cacheDir)
        .filter((entry) => entry.startsWith("minimal-cli.json."))
    ).toEqual([]);
  });
});

describe("formatUpdateHint", () => {
  it("uses careful Homebrew wording", () => {
    const hint = formatUpdateHint({
      currentVersion: "1.0.0",
      hint: null,
      isOutdated: true,
      latestVersion: "1.2.0",
      source: "brew",
      updateCommand: "brew upgrade minimal-cli",
    });

    expect(hint).toContain("Latest npm version is");
    expect(hint).toContain("brew upgrade minimal-cli");
  });
});

describe("printVersionInfo", () => {
  it("prints version before update hints", async () => {
    const cacheDir = createTempDir();
    writeCache(cacheDir, "minimal-cli", "1.2.0", 1000);
    const calls: string[] = [];

    await printVersionInfo({
      appName: "minimal-cli",
      binPath: "/usr/local/lib/node_modules/minimal-cli/dist/index.mjs",
      cacheDir,
      currentVersion: "1.0.0",
      logger: {
        message: (message) => calls.push(`message:${message}`),
        note: (content, title) => calls.push(`note:${title}:${content}`),
      },
      packageName: "minimal-cli",
    });

    expect(calls[0]).toBe("message:minimal-cli v1.0.0");
    expect(calls[1]).toContain("note:Update available:");
  });
});

describe("startBackgroundUpdateCheck", () => {
  it("prints cached hints synchronously and refreshes stale cache without awaiting it", async () => {
    const cacheDir = createTempDir();
    writeCache(cacheDir, "minimal-cli", "1.2.0", 0);
    const fetchMock = createFetchMock("1.3.0");
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const calls: string[] = [];

    startBackgroundUpdateCheck({
      appName: "minimal-cli",
      binPath: "/usr/local/lib/node_modules/minimal-cli/dist/index.mjs",
      cacheDir,
      cacheTtlMs: 1,
      currentVersion: "1.0.0",
      logger: {
        message: (message) => calls.push(`message:${message}`),
        note: (content, title) => calls.push(`note:${title}:${content}`),
      },
      now: () => 1000,
      packageName: "minimal-cli",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("Update available");
    expect(fetchMock).toHaveBeenCalledOnce();

    await waitForCacheVersion(path.join(cacheDir, "minimal-cli.json"), "1.3.0");
  });
});
