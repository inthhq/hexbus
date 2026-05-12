import { describe, expect, it } from "vitest";

import { createDisabledTelemetry, createTelemetry } from "../telemetry";

describe("telemetry", () => {
  it("creates disabled telemetry", () => {
    const telemetry = createDisabledTelemetry();

    expect(telemetry.isDisabled()).toBeTruthy();
    expect(() => telemetry.trackEvent("anything")).not.toThrow();
  });

  it("can queue and flush events without an endpoint", async () => {
    const telemetry = createTelemetry({
      appName: "test-cli",
      defaultProperties: { packageName: "test" },
    });

    telemetry.trackEvent("event");
    telemetry.trackCommand("setup", ["arg"], { force: true });
    expect(telemetry.isDisabled()).toBeFalsy();
    await expect(telemetry.flush()).resolves.toBeUndefined();
  });
});
