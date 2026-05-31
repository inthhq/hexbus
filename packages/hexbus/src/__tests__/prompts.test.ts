import { beforeEach, describe, expect, it, vi } from "vitest";

import { CliError } from "../errors";
import { TelemetryEventName } from "../telemetry";

const promptMocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  isCancel: vi.fn(),
  multiselect: vi.fn(),
  select: vi.fn(),
  text: vi.fn(),
}));

vi.mock("@clack/prompts", () => ({
  confirm: promptMocks.confirm,
  isCancel: promptMocks.isCancel,
  multiselect: promptMocks.multiselect,
  select: promptMocks.select,
  text: promptMocks.text,
}));

const {
  createPromptToolkit,
  promptConfirm,
  promptMultiselect,
  promptSelect,
  promptText,
} = await import("../prompts");

describe("prompt helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    promptMocks.isCancel.mockReturnValue(false);
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
    expect(promptMocks.select).toHaveBeenCalledWith({
      message: "Choose a feature",
      options: [{ label: "Billing", value: "billing" }],
    });
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
    const cancel = Symbol("cancel");
    const telemetry = {
      isDisabled: vi.fn(() => false),
      trackEvent: vi.fn(),
    };
    promptMocks.text.mockResolvedValue(cancel);
    promptMocks.isCancel.mockImplementation((value) => value === cancel);

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
    const cancel = Symbol("cancel");
    promptMocks.confirm.mockResolvedValue(cancel);
    promptMocks.isCancel.mockImplementation((value) => value === cancel);

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
    const cancel = Symbol("cancel");
    promptMocks.select.mockResolvedValue(cancel);
    promptMocks.isCancel.mockImplementation((value) => value === cancel);

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
