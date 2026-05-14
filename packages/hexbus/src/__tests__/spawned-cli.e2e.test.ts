import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

const FIXTURE_PACKAGE_NAME = "hexbus-spawn-fixture";
const FIXTURE_VERSION = "9.8.7";
const PROCESS_TIMEOUT_MS = 5000;
const ESCAPE_CHARACTER = String.fromCodePoint(27);
const ANSI_PATTERN = new RegExp(`${ESCAPE_CHARACTER}\\[[0-?]*[ -/]*[@-~]`, "g");
const fixturePath = fileURLToPath(
  new URL("fixtures/spawned-cli.ts", import.meta.url)
);
const versionCacheDir = path.join(os.tmpdir(), "hexbus-version-cache");
const versionCachePath = path.join(
  versionCacheDir,
  `${FIXTURE_PACKAGE_NAME}.json`
);

interface FixtureCliResult {
  code: number | null;
  stderr: string;
  stdout: string;
  timedOut: boolean;
}

function stripAnsi(value: string): string {
  return value.replaceAll(ANSI_PATTERN, "");
}

function normalizeOutput(value: string): string {
  return stripAnsi(value).replaceAll("\r\n", "\n");
}

async function writeVersionCache(): Promise<void> {
  await fs.mkdir(versionCacheDir, { recursive: true });
  await fs.writeFile(
    versionCachePath,
    `${JSON.stringify({
      fetchedAt: Date.now(),
      version: FIXTURE_VERSION,
    })}\n`,
    "utf-8"
  );
}

function runFixtureCli(args: string[]): Promise<FixtureCliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("bun", [fixturePath, ...args], {
      cwd: path.dirname(fixturePath),
      env: {
        ...process.env,
        CI: "1",
        FORCE_COLOR: "0",
        NO_COLOR: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, PROCESS_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({
        code,
        stderr: normalizeOutput(Buffer.concat(stderrChunks).toString("utf-8")),
        stdout: normalizeOutput(Buffer.concat(stdoutChunks).toString("utf-8")),
        timedOut,
      });
    });
  });
}

function expectCleanExit(result: FixtureCliResult): void {
  expect(result.timedOut).toBe(false);
  expect(result.stderr).toBe("");
  expect(result.code).toBe(0);
}

beforeEach(async () => {
  await writeVersionCache();
});

afterAll(async () => {
  await fs.rm(versionCachePath, { force: true });
});

describe("spawned fixture CLI", () => {
  it.each(["--version", "-v"])(
    "prints version output for %s",
    async (versionFlag) => {
      const result = await runFixtureCli([versionFlag]);

      expectCleanExit(result);
      expect(result.stdout).toContain(`fixture-cli v${FIXTURE_VERSION}`);
    }
  );

  it.each(["--help", "-h"])("renders help for %s", async (helpFlag) => {
    const result = await runFixtureCli([helpFlag]);

    expectCleanExit(result);
    expect(result.stdout).toContain("fixture-cli 9.8.7");
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("Commands:");
    expect(result.stdout).toContain("hello");
    expect(result.stdout).toContain("telemetry");
  });

  it("renders help when no command is provided", async () => {
    const result = await runFixtureCli([]);

    expectCleanExit(result);
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("Commands:");
    expect(result.stdout).toContain("hello");
  });

  it("executes a known command with command args", async () => {
    const result = await runFixtureCli(["hello", "world", "again"]);

    expectCleanExit(result);
    expect(result.stdout).toContain("hello args: world,again");
  });

  it("renders help for an unknown command using the current runner contract", async () => {
    const result = await runFixtureCli(["missing"]);

    expectCleanExit(result);
    expect(result.stdout).toContain("Usage:");
    expect(result.stdout).toContain("Commands:");
  });

  it("supports telemetry-disabled execution", async () => {
    const result = await runFixtureCli(["--no-telemetry", "telemetry"]);

    expectCleanExit(result);
    expect(result.stdout).toContain("telemetry disabled: true");
  });
});
