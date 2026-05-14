import * as p from "@clack/prompts";

import { CliError } from "./errors";
import { TelemetryEventName } from "./telemetry";
import type { ErrorHandlers, Telemetry } from "./types";

/**
 * How a prompt helper should behave when the user cancels.
 */
export type PromptCancelMode = "silent" | "throw";

/**
 * Prompt kinds emitted in prompt telemetry.
 */
export type PromptKind = "confirm" | "multiselect" | "select" | "text";

type PromptTelemetry = Pick<Telemetry, "trackEvent"> &
  Partial<Pick<Telemetry, "isDisabled">>;
type ClackSelectOption<TValue extends string> = Parameters<
  typeof p.select<TValue>
>[0]["options"][number];

interface PromptBaseOptions {
  /**
   * Cancellation behavior for the prompt.
   *
   * @default "throw"
   */
  cancel?: PromptCancelMode;
  /**
   * Message attached to the thrown `CliError` when `cancel` is `"throw"`.
   *
   * @default "Operation cancelled"
   */
  cancelMessage?: string;
  /**
   * Optional product-defined prompt stage, useful for telemetry.
   */
  stage?: string;
  /**
   * Optional telemetry sink for prompt interactions.
   */
  telemetry?: PromptTelemetry;
}

/**
 * Option rendered by `promptSelect` and `promptMultiselect`.
 */
export interface PromptChoice<TValue = string> {
  /**
   * User-facing option label.
   */
  label: string;
  /**
   * Value returned when the option is selected.
   */
  value: TValue;
  /**
   * Optional secondary text rendered next to the option.
   */
  hint?: string;
}

/**
 * Options for `promptSelect`.
 */
export interface PromptSelectOptions<
  TValue extends string = string,
> extends PromptBaseOptions {
  /**
   * Prompt text shown above the choices.
   */
  message: string;
  /**
   * Choices shown in the select prompt.
   */
  options: PromptChoice<TValue>[];
  /**
   * Initial selected value.
   */
  initialValue?: TValue;
}

/**
 * Options for `promptMultiselect`.
 */
export interface PromptMultiselectOptions<
  TValue extends string = string,
> extends PromptBaseOptions {
  /**
   * Prompt text shown above the choices.
   */
  message: string;
  /**
   * Choices shown in the multiselect prompt.
   */
  options: PromptChoice<TValue>[];
  /**
   * Initial selected values.
   */
  initialValues?: TValue[];
  /**
   * Whether at least one value must be selected.
   *
   * @default true
   */
  required?: boolean;
}

/**
 * Options for `promptText`.
 */
export interface PromptTextOptions extends PromptBaseOptions {
  /**
   * Prompt text shown above the input.
   */
  message: string;
  /**
   * Placeholder shown before the user types.
   */
  placeholder?: string;
  /**
   * Initial editable value.
   */
  initialValue?: string;
  /**
   * Default value used when the user submits an empty input.
   */
  defaultValue?: string;
  /**
   * Optional validation callback. Return a string to show a validation error.
   */
  validate?: (value: string | undefined) => Error | string | undefined;
}

/**
 * Options for `promptConfirm`.
 */
export interface PromptConfirmOptions extends PromptBaseOptions {
  /**
   * Confirmation question.
   */
  message: string;
  /**
   * Initial selected answer.
   *
   * @default true
   */
  initialValue?: boolean;
}

/**
 * Context used to build bound prompt helpers.
 */
export interface CreatePromptToolkitContext {
  /**
   * Error handlers used when `cancel` is `"handle"`.
   */
  error?: Pick<ErrorHandlers, "handleCancel">;
  /**
   * Telemetry sink attached to every prompt helper.
   */
  telemetry?: PromptTelemetry;
}

/**
 * Cancellation behavior for helpers returned by `createPromptToolkit`.
 */
export type PromptToolkitCancelMode = "handle" | PromptCancelMode;

/**
 * Options for `createPromptToolkit`.
 */
export interface CreatePromptToolkitOptions {
  /**
   * Default cancellation behavior for bound prompt helpers.
   *
   * @default "throw"
   */
  cancel?: PromptToolkitCancelMode;
}

/**
 * Bound prompt helpers that share telemetry and cancellation defaults.
 */
export interface PromptToolkit {
  confirm(options: PromptConfirmOptions): Promise<boolean | undefined>;
  multiselect<TValue extends string = string>(
    options: PromptMultiselectOptions<TValue>
  ): Promise<TValue[] | undefined>;
  select<TValue extends string = string>(
    options: PromptSelectOptions<TValue>
  ): Promise<TValue | undefined>;
  text(options: PromptTextOptions): Promise<string | undefined>;
}

function shouldTrackTelemetry(telemetry: PromptTelemetry | undefined): boolean {
  return telemetry !== undefined && telemetry.isDisabled?.() !== true;
}

function toClackOptions<TValue extends string>(
  options: PromptChoice<TValue>[]
): ClackSelectOption<TValue>[] {
  const clackOptions = options.map((option) =>
    option.hint === undefined
      ? {
          label: option.label,
          value: option.value,
        }
      : {
          hint: option.hint,
          label: option.label,
          value: option.value,
        }
  );
  return clackOptions as ClackSelectOption<TValue>[];
}

function trackPrompt(
  kind: PromptKind,
  outcome: "cancelled" | "submitted",
  options: PromptBaseOptions,
  properties: Record<string, unknown> = {}
): void {
  if (!shouldTrackTelemetry(options.telemetry)) {
    return;
  }

  options.telemetry?.trackEvent(TelemetryEventName.PROMPT_INTERACTION, {
    kind,
    outcome,
    stage: options.stage,
    ...properties,
  });
}

function handleCancelledPrompt<TValue>(
  kind: PromptKind,
  options: PromptBaseOptions
): TValue | undefined {
  trackPrompt(kind, "cancelled", options);

  if (options.cancel === "silent") {
    return undefined;
  }

  throw new CliError("CANCELLED", {
    details: options.cancelMessage ?? "Operation cancelled",
    stage: options.stage,
  });
}

/**
 * Prompts the user to choose a single option.
 */
export async function promptSelect<TValue extends string = string>(
  options: PromptSelectOptions<TValue> & { cancel: "silent" }
): Promise<TValue | undefined>;
export async function promptSelect<TValue extends string = string>(
  options: PromptSelectOptions<TValue>
): Promise<TValue>;
export async function promptSelect<TValue extends string = string>(
  options: PromptSelectOptions<TValue>
): Promise<TValue | undefined> {
  const promptOptions = {
    message: options.message,
    options: toClackOptions(options.options),
  };
  const result = await p.select(
    options.initialValue === undefined
      ? promptOptions
      : { ...promptOptions, initialValue: options.initialValue }
  );

  if (p.isCancel(result)) {
    return handleCancelledPrompt<TValue>("select", options);
  }

  trackPrompt("select", "submitted", options);
  return result as TValue;
}

/**
 * Prompts the user to choose zero or more options.
 */
export async function promptMultiselect<TValue extends string = string>(
  options: PromptMultiselectOptions<TValue> & { cancel: "silent" }
): Promise<TValue[] | undefined>;
export async function promptMultiselect<TValue extends string = string>(
  options: PromptMultiselectOptions<TValue>
): Promise<TValue[]>;
export async function promptMultiselect<TValue extends string = string>(
  options: PromptMultiselectOptions<TValue>
): Promise<TValue[] | undefined> {
  const promptOptions = {
    message: options.message,
    options: toClackOptions(options.options),
  };
  const result = await p.multiselect({
    ...promptOptions,
    ...(options.initialValues === undefined
      ? {}
      : { initialValues: options.initialValues }),
    ...(options.required === undefined ? {} : { required: options.required }),
  });

  if (p.isCancel(result)) {
    return handleCancelledPrompt<TValue[]>("multiselect", options);
  }

  const values = result as TValue[];
  trackPrompt("multiselect", "submitted", options, {
    selectedCount: values.length,
  });
  return values;
}

/**
 * Prompts the user for free-form text.
 */
export async function promptText(
  options: PromptTextOptions & { cancel: "silent" }
): Promise<string | undefined>;
export async function promptText(options: PromptTextOptions): Promise<string>;
export async function promptText(
  options: PromptTextOptions
): Promise<string | undefined> {
  const promptOptions = {
    message: options.message,
  };
  const result = await p.text({
    ...promptOptions,
    ...(options.defaultValue === undefined
      ? {}
      : { defaultValue: options.defaultValue }),
    ...(options.initialValue === undefined
      ? {}
      : { initialValue: options.initialValue }),
    ...(options.placeholder === undefined
      ? {}
      : { placeholder: options.placeholder }),
    ...(options.validate === undefined ? {} : { validate: options.validate }),
  });

  if (p.isCancel(result)) {
    return handleCancelledPrompt<string>("text", options);
  }

  trackPrompt("text", "submitted", options);
  return result as string;
}

/**
 * Prompts the user to confirm an action.
 *
 * @remarks
 * This helper always prompts. Use `CliContext.confirm` when `-y` and `--yes`
 * should automatically accept the confirmation.
 */
export async function promptConfirm(
  options: PromptConfirmOptions & { cancel: "silent" }
): Promise<boolean | undefined>;
export async function promptConfirm(
  options: PromptConfirmOptions
): Promise<boolean>;
export async function promptConfirm(
  options: PromptConfirmOptions
): Promise<boolean | undefined> {
  const promptOptions = {
    message: options.message,
  };
  const result = await p.confirm(
    options.initialValue === undefined
      ? promptOptions
      : { ...promptOptions, initialValue: options.initialValue }
  );

  if (p.isCancel(result)) {
    return handleCancelledPrompt<boolean>("confirm", options);
  }

  trackPrompt("confirm", "submitted", options);
  return result as boolean;
}

function mergePromptOptions<TOptions extends PromptBaseOptions>(
  options: TOptions,
  telemetry: PromptTelemetry | undefined,
  cancel: PromptCancelMode
): TOptions & { cancel: PromptCancelMode } {
  return {
    ...options,
    cancel: options.cancel ?? cancel,
    telemetry: options.telemetry ?? telemetry,
  };
}

function handleToolkitCancel<TValue>(
  result: TValue | undefined,
  options: PromptBaseOptions,
  context: CreatePromptToolkitContext,
  cancel: PromptToolkitCancelMode
): TValue | undefined {
  if (result === undefined && cancel === "handle") {
    context.error?.handleCancel(options.cancelMessage, {
      stage: options.stage,
    });
  }

  return result;
}

/**
 * Creates prompt helpers bound to a shared CLI context.
 */
export function createPromptToolkit(
  context: CreatePromptToolkitContext,
  toolkitOptions: CreatePromptToolkitOptions = {}
): PromptToolkit {
  const cancel = toolkitOptions.cancel ?? "throw";
  const promptCancel = cancel === "handle" ? "silent" : cancel;

  return {
    async confirm(options) {
      const result = await promptConfirm(
        mergePromptOptions(options, context.telemetry, promptCancel)
      );
      return handleToolkitCancel(result, options, context, cancel);
    },
    async multiselect(options) {
      const result = await promptMultiselect(
        mergePromptOptions(options, context.telemetry, promptCancel)
      );
      return handleToolkitCancel(result, options, context, cancel);
    },
    async select(options) {
      const result = await promptSelect(
        mergePromptOptions(options, context.telemetry, promptCancel)
      );
      return handleToolkitCancel(result, options, context, cancel);
    },
    async text(options) {
      const result = await promptText(
        mergePromptOptions(options, context.telemetry, promptCancel)
      );
      return handleToolkitCancel(result, options, context, cancel);
    },
  };
}
