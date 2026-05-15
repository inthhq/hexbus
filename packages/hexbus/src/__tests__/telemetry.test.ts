import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createDisabledTelemetry, createTelemetry } from "../telemetry";

type MockFetch = (endpoint: string, request: RequestInit) => Promise<Response>;
type ParsedTelemetryEvent = Record<string, unknown> & {
  apiKey?: string;
  event: string;
  nested?: {
    token?: string;
    value?: string;
  };
  url?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function hasOptionalString(
  record: Record<string, unknown>,
  key: string
): boolean {
  return !(key in record) || typeof record[key] === "string";
}

function isNestedTelemetryValue(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOptionalString(value, "token") &&
    hasOptionalString(value, "value")
  );
}

function isParsedTelemetryEvent(value: unknown): value is ParsedTelemetryEvent {
  return (
    isRecord(value) &&
    typeof value.event === "string" &&
    hasOptionalString(value, "apiKey") &&
    hasOptionalString(value, "url") &&
    (!("nested" in value) || isNestedTelemetryValue(value.nested))
  );
}

function parseTelemetryEvents(content: string): ParsedTelemetryEvent[] {
  const parsed: unknown = JSON.parse(content);

  if (!Array.isArray(parsed) || !parsed.every(isParsedTelemetryEvent)) {
    throw new Error("Expected telemetry payload to be an event array");
  }

  return parsed;
}

describe("telemetry", () => {
  it("creates disabled telemetry", () => {
    const telemetry = createDisabledTelemetry();

    expect(telemetry.isDisabled()).toBe(true);
    expect(() => telemetry.trackEvent("anything")).not.toThrow();
  });

  it("can queue and flush events without an endpoint", async () => {
    const telemetry = createTelemetry({
      appName: "test-cli",
      defaultProperties: { packageName: "test" },
    });

    telemetry.trackEvent("event");
    telemetry.trackCommand("setup", ["arg"], { force: true });
    expect(telemetry.isDisabled()).toBe(false);
    await expect(telemetry.flush()).resolves.toBeUndefined();
  });

  it("sends sanitized event batches to the configured endpoint", async () => {
    const fetchImpl = vi.fn<MockFetch>(() =>
      Promise.resolve(new Response(null, { status: 204 }))
    );
    const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), "hexbus-"));
    const telemetry = createTelemetry({
      appName: "test-cli",
      defaultProperties: { appName: "overridden-cli", cliVersion: "1.0.0" },
      endpoint: "https://telemetry.example.test/ingest",
      fetch: fetchImpl as unknown as typeof fetch,
      headers: { Authorization: "Bearer test" },
      storageDir,
    });

    telemetry.trackEvent("custom_event", {
      apiKey: "secret",
      nested: { token: "secret", value: "ok" },
      url: "https://example.test/path?token=secret#hash",
    });
    await telemetry.flush();

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [, request] = fetchImpl.mock.calls[0] ?? [];
    expect(request?.headers).toMatchObject({
      Authorization: "Bearer test",
      "content-type": "application/json",
    });

    const body = parseTelemetryEvents(String(request?.body));
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      apiKey: "[redacted]",
      appName: "test-cli",
      event: "custom_event",
      nested: { token: "[redacted]", value: "ok" },
      url: "https://example.test/path",
    });
  });

  it("persists dropped events for replay", async () => {
    const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), "hexbus-"));
    const queueFileName = "queue.json";
    const failingFetch = vi.fn<MockFetch>(() =>
      Promise.reject(new Error("network down"))
    );
    const replayFetch = vi.fn<MockFetch>(() =>
      Promise.resolve(new Response(null, { status: 204 }))
    );
    const telemetry = createTelemetry({
      appName: "test-cli",
      drainOptions: {
        batch: { intervalMs: 1, size: 1 },
        retry: { initialDelayMs: 1, maxAttempts: 1 },
      },
      endpoint: "https://telemetry.example.test/ingest",
      fetch: failingFetch as unknown as typeof fetch,
      queueFileName,
      storageDir,
    });

    telemetry.trackEvent("one");
    await telemetry.flush();

    const queued = parseTelemetryEvents(
      await fs.readFile(path.join(storageDir, queueFileName), "utf-8")
    );
    expect(queued.length).toBeGreaterThan(0);

    const replayTelemetry = createTelemetry({
      appName: "test-cli",
      endpoint: "https://telemetry.example.test/ingest",
      fetch: replayFetch as unknown as typeof fetch,
      queueFileName,
      storageDir,
    });
    await replayTelemetry.flush();

    expect(replayFetch).toHaveBeenCalledOnce();
    const [replayEndpoint, replayRequest] = replayFetch.mock.calls[0] ?? [];
    expect(replayEndpoint).toBe("https://telemetry.example.test/ingest");
    expect(replayRequest).toEqual(
      expect.objectContaining({
        method: "POST",
      })
    );

    const replayBody = parseTelemetryEvents(String(replayRequest?.body));
    expect(replayBody).toEqual(queued);
    expect(replayBody[0]).toEqual(expect.objectContaining({ event: "one" }));

    await expect(
      fs.readFile(path.join(storageDir, queueFileName), "utf-8")
    ).rejects.toThrow();
  });

  it("does not create telemetry state when disabled", async () => {
    const storageDir = path.join(
      os.tmpdir(),
      `hexbus-disabled-${crypto.randomUUID()}`
    );
    const telemetry = createTelemetry({
      appName: "test-cli",
      disabled: true,
      endpoint: "https://telemetry.example.test/ingest",
      storageDir,
    });

    telemetry.trackEvent("disabled_event");
    telemetry.flushSync();
    await telemetry.flush();
    await telemetry.shutdown();

    expect(telemetry.isDisabled()).toBe(true);
    await expect(fs.stat(storageDir)).rejects.toThrow();
  });
});
