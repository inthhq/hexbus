import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { createDisabledTelemetry, createTelemetry } from "../telemetry";

type MockFetch = (endpoint: string, request: RequestInit) => Promise<Response>;

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
      defaultProperties: { cliVersion: "1.0.0" },
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

    const body = JSON.parse(String(request?.body)) as {
      event: string;
      apiKey?: string;
      nested?: { token?: string; value?: string };
      url?: string;
    }[];
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      apiKey: "[redacted]",
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

    const queued = JSON.parse(
      await fs.readFile(path.join(storageDir, queueFileName), "utf-8")
    ) as Record<string, unknown>[];
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

    const replayBody = JSON.parse(String(replayRequest?.body)) as Record<
      string,
      unknown
    >[];
    expect(replayBody).toEqual(queued);
    expect(replayBody[0]).toEqual(expect.objectContaining({ event: "one" }));

    await expect(
      fs.readFile(path.join(storageDir, queueFileName), "utf-8")
    ).rejects.toThrow();
  });
});
