import { beforeEach, describe, expect, it, vi } from "vitest";

import { CliError } from "../errors";
import { TelemetryEventName } from "../telemetry";

const promptMocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  multiselect: vi.fn(),
  select: vi.fn(),
  text: vi.fn(),
}));

vi.mock("../opentui", () => {
  const cancel = Symbol("cancel");

  return {
    isOpenTuiCancel: (value: unknown) => value === cancel,
    openTuiConfirm: promptMocks.confirm,
    openTuiMultiselect: promptMocks.multiselect,
    openTuiSelect: promptMocks.select,
    openTuiText: promptMocks.text,
    promptCancel: cancel,
  };
});

const {
  createPromptToolkit,
  promptConfirm,
  promptMultiselect,
  promptSelect,
  promptText,
} = await import("../prompts");
const { promptCancel } = await import("../opentui");

describe("prompt helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a selected value and tracks submitted telemetry", async () => {
    const telemetry = {
      isDisabled: vi.fn(() => false),
      trackEvent: vi.fn(),
    };
    promptMocks.select.mockResolvedValue("billing");

    const result = await promptSelect({
      message: "Choose a feature",
      options: [{ label: "Billing", value: "billing" }],
      stage: "onboarding.feature",
      telemetry,
    });

    expect(result).toBe("billing");
    expect(promptMocks.select).toHaveBeenCalledWith(
      "Choose a feature",
      [{ label: "Billing", value: "billing" }],
      undefined
    );
    expect(telemetry.trackEvent).toHaveBeenCalledWith(
      TelemetryEventName.PROMPT_INTERACTION,
      {
        kind: "select",
        outcome: "submitted",
        stage: "onboarding.feature",
      }
    );
  });

  it("returns undefined for silent cancellation", async () => {
    const telemetry = {
      isDisabled: vi.fn(() => false),
      trackEvent: vi.fn(),
    };
    promptMocks.text.mockResolvedValue(promptCancel);

    const result = await promptText({
      cancel: "silent",
      message: "Project name",
      stage: "onboarding.name",
      telemetry,
    });

    expect(result).toBeUndefined();
    expect(telemetry.trackEvent).toHaveBeenCalledWith(
      TelemetryEventName.PROMPT_INTERACTION,
      {
        kind: "text",
        outcome: "cancelled",
        stage: "onboarding.name",
      }
    );
  });

  it("throws CliError when cancellation is not silent", async () => {
    promptMocks.confirm.mockResolvedValue(promptCancel);

    await expect(
      promptConfirm({
        cancelMessage: "Confirmation cancelled",
        message: "Continue?",
        stage: "dangerous-action",
      })
    ).rejects.toMatchObject({
      code: "CANCELLED",
      context: {
        details: "Confirmation cancelled",
        stage: "dangerous-action",
      },
    } satisfies Partial<CliError>);
  });

  it("tracks selected count for multiselect submissions", async () => {
    const telemetry = {
      isDisabled: vi.fn(() => false),
      trackEvent: vi.fn(),
    };
    promptMocks.multiselect.mockResolvedValue(["auth", "billing"]);

    const result = await promptMultiselect({
      message: "Choose features",
      options: [
        { label: "Auth", value: "auth" },
        { label: "Billing", value: "billing" },
      ],
      telemetry,
    });

    expect(result).toStrictEqual(["auth", "billing"]);
    expect(telemetry.trackEvent).toHaveBeenCalledWith(
      TelemetryEventName.PROMPT_INTERACTION,
      {
        kind: "multiselect",
        outcome: "submitted",
        selectedCount: 2,
        stage: undefined,
      }
    );
  });

  it("does not track prompt telemetry when disabled", async () => {
    const telemetry = {
      isDisabled: vi.fn(() => true),
      trackEvent: vi.fn(),
    };
    promptMocks.text.mockResolvedValue("demo");

    await promptText({
      message: "Project name",
      telemetry,
    });

    expect(telemetry.trackEvent).not.toHaveBeenCalled();
  });

  it("can bind prompts to context telemetry and cancellation handlers", async () => {
    const handleCancel = vi.fn(() => {
      throw new CliError("CANCELLED");
    });
    const telemetry = {
      isDisabled: vi.fn(() => false),
      trackEvent: vi.fn(),
    };
    promptMocks.select.mockResolvedValue(promptCancel);

    const prompts = createPromptToolkit(
      { error: { handleCancel }, telemetry },
      { cancel: "handle" }
    );

    await expect(
      prompts.select({
        cancelMessage: "Selection cancelled",
        message: "Choose a feature",
        options: [{ label: "Billing", value: "billing" }],
        stage: "onboarding.feature",
      })
    ).rejects.toMatchObject({ code: "CANCELLED" });
    expect(handleCancel).toHaveBeenCalledWith("Selection cancelled", {
      stage: "onboarding.feature",
    });
  });
});
