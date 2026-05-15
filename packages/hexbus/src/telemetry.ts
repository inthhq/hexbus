import crypto from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createLogger, initLogger } from "evlog";
import type { DrainContext, WideEvent } from "evlog";
import { createDrainPipeline } from "evlog/pipeline";
import type { DrainPipelineOptions, PipelineDrainFn } from "evlog/pipeline";

import type { CliLogger, Telemetry } from "./types";

/**
 * Primitive values allowed in sanitized telemetry payloads.
 */
type TelemetryPrimitive = boolean | null | number | string;
interface TelemetryObject {
  [key: string]: TelemetryValue;
}
type TelemetryValue = TelemetryObject | TelemetryPrimitive | TelemetryValue[];
type TelemetryProperties = Record<string, TelemetryValue | undefined>;
type EventLike = Record<string, unknown>;
interface ResolvedTelemetryOptions {
  appName: string;
  debug: boolean;
  defaultProperties: TelemetryObject;
  disabled: boolean;
  endpoint: string | undefined;
  envVarPrefix: string;
  eventNameMap: Record<string, string>;
  fetchImpl: typeof fetch;
  headers: Record<string, string>;
  logger: TelemetryOptions["logger"];
  queuePath: string;
  sanitizeHook: TelemetryOptions["sanitize"];
  source: string;
  statePath: string;
  storageDir: string;
  timeoutMs: number;
}
interface DrainPipelineConfig {
  drain: (
    handler: (batch: DrainContext[]) => Promise<void>
  ) => PipelineDrainFn<DrainContext>;
  handler: (batch: DrainContext[]) => Promise<void>;
}

const DEFAULT_QUEUE_LIMIT = 250;
const DEFAULT_TIMEOUT_MS = 3000;
const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_BATCH_INTERVAL_MS = 1000;
const DEFAULT_MAX_BUFFER_SIZE = 250;
const MAX_DEPTH = 5;
const MAX_ARRAY_LENGTH = 20;
const MAX_OBJECT_KEYS = 50;
const MAX_STRING_LENGTH = 500;

const RESERVED_TOP_LEVEL_KEYS = new Set([
  "arch",
  "ci",
  "command",
  "commandRunId",
  "event",
  "firstRun",
  "installId",
  "interactive",
  "nodeVersion",
  "platform",
  "sequence",
  "sessionId",
  "source",
  "timestamp",
  "tty",
]);

const SENSITIVE_KEY_PATTERN =
  /(^|[-_])(token|secret|password|authorization|cookie|api[-_]?key|access[-_]?token|refresh[-_]?token|config)([-_]|$)/i;
const SECRET_VALUE_PATTERN =
  /^(Bearer\s+[A-Za-z0-9._-]+|[A-Za-z0-9+/=_-]{80,})$/;

/**
 * Options for the built-in durable telemetry client.
 */
export interface TelemetryOptions {
  /**
   * Disables telemetry completely.
   */
  disabled?: boolean;
  /**
   * Logs queued telemetry payloads through the optional debug logger.
   */
  debug?: boolean;
  /**
   * HTTP endpoint that receives telemetry batches on flush.
   */
  endpoint?: string;
  /**
   * Headers included when flushing telemetry batches.
   */
  headers?: Record<string, string>;
  /**
   * Fetch implementation used to send telemetry.
   */
  fetch?: typeof fetch;
  /**
   * Application name included in every telemetry event.
   *
   * @default "cli"
   */
  appName?: string;
  /**
   * Environment variable prefix used for opt-out detection.
   *
   * @remarks
   * A prefix of `MY_CLI` reads `MY_CLI_TELEMETRY_DISABLED`.
   *
   * @default "APP"
   */
  envVarPrefix?: string;
  /**
   * Properties merged into every telemetry event before event-specific
   * properties.
   */
  defaultProperties?: EventLike;
  /**
   * Directory used for install identity and failed-event replay state.
   *
   * @default path.join(os.homedir(), `.${appName}`)
   */
  storageDir?: string;
  /**
   * File name used to store install identity.
   *
   * @default "telemetry.json"
   */
  stateFileName?: string;
  /**
   * File name used to store failed telemetry batches.
   *
   * @default "telemetry-queue.json"
   */
  queueFileName?: string;
  /**
   * Service/source name written into each event.
   *
   * @default appName
   */
  source?: string;
  /**
   * Event name aliases applied before an event is queued.
   */
  eventNameMap?: Record<string, string>;
  /**
   * Additional sanitizer applied after Hexbus' default sanitizer.
   */
  sanitize?: (properties: TelemetryObject) => TelemetryObject;
  /**
   * Options forwarded to the durable drain pipeline.
   */
  drainOptions?: DrainPipelineOptions<DrainContext>;
  /**
   * Request timeout for telemetry flush calls.
   *
   * @default 3000
   */
  timeoutMs?: number;
  /**
   * Logger used for debug payload output and flush warnings.
   */
  logger?: Pick<CliLogger, "debug" | "warn">;
}

/**
 * Standard telemetry event names emitted by Hexbus runtime helpers.
 */
export const TelemetryEventName = {
  CLI_COMPLETED: "cli_completed",
  CLI_ENVIRONMENT_DETECTED: "cli_environment_detected",
  CLI_INVOKED: "cli_invoked",
  COMMAND_FAILED: "command_failed",
  COMMAND_INVOKED: "command_invoked",
  COMMAND_SUCCEEDED: "command_succeeded",
  COMMAND_UNKNOWN: "command_unknown",
  ERROR_OCCURRED: "error_occurred",
  HELP_DISPLAYED: "help_displayed",
  INTERACTIVE_MENU_EXITED: "interactive_menu_exited",
  INTERACTIVE_MENU_OPENED: "interactive_menu_opened",
  PROMPT_INTERACTION: "prompt_interaction",
  VERSION_DISPLAYED: "version_displayed",
} as const;

/**
 * Union of standard telemetry event name string values.
 */
export type TelemetryEventNameType =
  (typeof TelemetryEventName)[keyof typeof TelemetryEventName];

function isEnvDisabled(prefix: string): boolean {
  const value = process.env[`${prefix}_TELEMETRY_DISABLED`];
  return value === "1" || value?.toLowerCase() === "true";
}

function isCi(): boolean {
  return Boolean(
    process.env.CI ||
    process.env.GITHUB_ACTIONS ||
    process.env.BUILDKITE ||
    process.env.VERCEL
  );
}

function sanitizePrimitive(
  value: boolean | number | string,
  keyHint?: string
): TelemetryPrimitive {
  if (typeof value !== "string") {
    return value;
  }

  let sanitizedValue = value;

  if (keyHint && SENSITIVE_KEY_PATTERN.test(keyHint)) {
    return "[redacted]";
  }

  if (SECRET_VALUE_PATTERN.test(sanitizedValue)) {
    return "[redacted]";
  }

  if (path.isAbsolute(sanitizedValue)) {
    return "[absolute-path]";
  }

  if (
    sanitizedValue.startsWith("http://") ||
    sanitizedValue.startsWith("https://")
  ) {
    try {
      const parsed = new URL(sanitizedValue);
      parsed.username = "";
      parsed.password = "";
      parsed.search = "";
      parsed.hash = "";
      sanitizedValue = parsed.toString();
    } catch {
      // Keep the original string if URL parsing fails.
    }
  }

  if (sanitizedValue.length > MAX_STRING_LENGTH) {
    return `${sanitizedValue.slice(0, MAX_STRING_LENGTH)}...`;
  }

  return sanitizedValue;
}

function sanitizeError(error: Error): Error {
  const safeError = new Error(error.message);
  safeError.name = error.name;

  if (process.env.NODE_ENV === "development") {
    safeError.stack = error.stack;
  } else {
    delete (safeError as Error & { stack?: string }).stack;
  }

  const sourceError = error as Error & {
    cause?: unknown;
    status?: unknown;
    statusCode?: unknown;
    statusMessage?: unknown;
    statusText?: unknown;
  };
  const targetError = safeError as Error & {
    cause?: unknown;
    status?: unknown;
    statusCode?: unknown;
    statusMessage?: unknown;
    statusText?: unknown;
  };

  if (typeof sourceError.status === "number") {
    targetError.status = sourceError.status;
  }

  if (typeof sourceError.statusCode === "number") {
    targetError.statusCode = sourceError.statusCode;
  }

  if (typeof sourceError.statusText === "string") {
    targetError.statusText = sourceError.statusText;
  }

  if (typeof sourceError.statusMessage === "string") {
    targetError.statusMessage = sourceError.statusMessage;
  }

  if (sourceError.cause instanceof Error) {
    targetError.cause = sourceError.cause.message;
  } else if (typeof sourceError.cause === "string") {
    targetError.cause = sourceError.cause;
  }

  return safeError;
}

function readString(value: TelemetryValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * Creates a no-op telemetry client.
 *
 * @returns A telemetry implementation whose methods do nothing and whose
 * `isDisabled()` method returns `true`.
 */
export function createDisabledTelemetry(): Telemetry {
  return {
    flush: async () => {},
    flushBackground: () => {},
    flushSync: () => {},
    isDisabled: () => true,
    shutdown: async () => {},
    trackCommand: () => {},
    trackError: () => {},
    trackEvent: () => {},
  };
}

class DurableTelemetry implements Telemetry {
  private readonly appName: string;
  private readonly source: string;
  private readonly endpoint: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly headers: Record<string, string>;
  private readonly defaultProperties: TelemetryObject;
  private readonly storageDir: string;
  private readonly statePath: string;
  private readonly queuePath: string;
  private readonly sessionId = crypto.randomUUID();
  private readonly installId: string;
  private readonly isFirstRun: boolean;
  private readonly drain: PipelineDrainFn<DrainContext>;
  private readonly eventNameMap: Record<string, string>;
  private readonly sanitizeHook: TelemetryOptions["sanitize"];
  private readonly timeoutMs: number;

  private logger: TelemetryOptions["logger"];
  private disabled: boolean;
  private debug: boolean;
  private sequence = 0;
  private activeCommandName?: string;
  private activeCommandRunId?: string;
  private flushPromise: Promise<void> | null = null;
  private queueReplayPromise: Promise<void> = Promise.resolve();
  private queueWritePromise: Promise<void> = Promise.resolve();

  constructor(options: TelemetryOptions = {}) {
    const defaults = this.buildDefaultOptions(options);
    this.disabled = defaults.disabled;
    this.debug = defaults.debug;
    this.logger = defaults.logger;
    this.appName = defaults.appName;
    this.source = defaults.source;
    this.endpoint = defaults.endpoint;
    this.fetchImpl = defaults.fetchImpl;
    this.headers = defaults.headers;
    this.defaultProperties = defaults.defaultProperties;
    this.storageDir = defaults.storageDir;
    this.statePath = defaults.statePath;
    this.queuePath = defaults.queuePath;
    this.eventNameMap = defaults.eventNameMap;
    this.sanitizeHook = defaults.sanitizeHook;
    this.timeoutMs = defaults.timeoutMs;

    const identity = this.loadOrCreateInstallIdentity();
    this.installId = identity.installId;
    this.isFirstRun = identity.isFirstRun;

    const { drain, handler } = this.buildDrainPipeline(options.drainOptions);
    this.drain = drain(handler);

    this.applyLoggerConfig();
    this.queueReplayPromise = this.flushQueuedEvents();
  }

  trackEvent(
    eventName: string,
    properties: Record<string, unknown> = {}
  ): void {
    const normalizedEventName = this.eventNameMap[eventName] ?? eventName;

    if (this.disabled) {
      if (this.debug) {
        this.logDebug(
          `Telemetry event skipped (${normalizedEventName}): telemetry disabled`
        );
      }
      return;
    }

    try {
      const log = createLogger(this.buildBaseContext(normalizedEventName));
      log.set(this.sanitizeEventProperties(properties));
      log.emit();

      if (this.debug) {
        this.logDebug(`Queued telemetry event: ${normalizedEventName}`);
      }
    } catch (error) {
      if (this.debug) {
        this.logDebug(
          `Failed to queue telemetry event ${normalizedEventName}:`,
          error
        );
      }
    }
  }

  trackCommand(
    command: string,
    args: string[] = [],
    flags: Record<string, boolean | number | string | undefined> = {}
  ): void {
    this.activeCommandName = command;
    this.activeCommandRunId = crypto.randomUUID();

    const safeFlags = this.sanitizeProperties(flags);
    const safeArgs = this.sanitizeValue(args) as TelemetryValue[];

    this.trackEvent(TelemetryEventName.COMMAND_INVOKED, {
      args: safeArgs,
      argsCount: args.length,
      command,
      commandRunId: this.activeCommandRunId,
      flagCount: Object.keys(safeFlags).length,
      flagNames: Object.keys(safeFlags).toSorted(),
      flags: safeFlags,
      subcommand: typeof safeArgs[0] === "string" ? safeArgs[0] : undefined,
    });
  }

  trackError(error: Error, command?: string): void {
    if (this.disabled) {
      return;
    }

    try {
      const log = createLogger(
        this.buildBaseContext(TelemetryEventName.ERROR_OCCURRED)
      );
      log.error(sanitizeError(error), {
        command: command ?? this.activeCommandName,
        commandRunId: this.activeCommandRunId,
        failure: this.buildErrorMetadata(error),
      });
      log.emit();

      if (this.debug) {
        this.logDebug(
          `Queued telemetry error event: ${
            command ?? this.activeCommandName ?? "unknown-command"
          }`
        );
      }
    } catch (trackingError) {
      if (this.debug) {
        this.logDebug("Failed to queue telemetry error event:", trackingError);
      }
    }
  }

  flushSync(): void {
    if (this.disabled) {
      return;
    }

    this.flushPromise = this.flushAll();
  }

  flushBackground(): void {
    this.flushSync();
  }

  async flush(): Promise<void> {
    if (this.disabled) {
      return;
    }

    if (this.flushPromise) {
      await this.flushPromise;
      return;
    }

    this.flushPromise = this.flushAll();
    try {
      await this.flushPromise;
    } finally {
      this.flushPromise = null;
    }
  }

  async shutdown(): Promise<void> {
    if (this.disabled) {
      return;
    }

    await (this.flushPromise ?? this.flushAll());
  }

  isDisabled(): boolean {
    return this.disabled;
  }

  private buildDefaultOptions(
    options: TelemetryOptions
  ): ResolvedTelemetryOptions {
    const envVarPrefix = options.envVarPrefix ?? "APP";
    const appName = options.appName ?? "cli";
    const storageDir =
      options.storageDir ?? path.join(os.homedir(), `.${appName}`);

    return {
      appName,
      debug: options.debug === true,
      defaultProperties: this.sanitizeProperties(
        options.defaultProperties ?? {}
      ),
      disabled: options.disabled === true || isEnvDisabled(envVarPrefix),
      endpoint: options.endpoint,
      envVarPrefix,
      eventNameMap: options.eventNameMap ?? {},
      fetchImpl: options.fetch ?? fetch,
      headers: {
        "content-type": "application/json",
        ...options.headers,
      },
      logger: options.logger,
      queuePath: path.join(
        storageDir,
        options.queueFileName ?? "telemetry-queue.json"
      ),
      sanitizeHook: options.sanitize,
      source: options.source ?? appName,
      statePath: path.join(
        storageDir,
        options.stateFileName ?? "telemetry.json"
      ),
      storageDir,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    };
  }

  private buildDrainPipeline(
    userDrainOptions?: DrainPipelineOptions<DrainContext>
  ): DrainPipelineConfig {
    const onDropped = userDrainOptions?.onDropped;
    const drain = createDrainPipeline<DrainContext>({
      batch: {
        intervalMs:
          userDrainOptions?.batch?.intervalMs ?? DEFAULT_BATCH_INTERVAL_MS,
        size: userDrainOptions?.batch?.size ?? DEFAULT_BATCH_SIZE,
      },
      maxBufferSize: userDrainOptions?.maxBufferSize ?? DEFAULT_MAX_BUFFER_SIZE,
      onDropped: (events, error) => {
        onDropped?.(events, error);
        void this.persistDroppedEvents(events, error);
      },
      retry: {
        backoff: userDrainOptions?.retry?.backoff ?? "fixed",
        initialDelayMs: userDrainOptions?.retry?.initialDelayMs ?? 250,
        maxAttempts: userDrainOptions?.retry?.maxAttempts ?? 2,
        maxDelayMs: userDrainOptions?.retry?.maxDelayMs ?? 1000,
      },
    });
    const handler = async (batch: DrainContext[]) => {
      await this.sendBatch(batch.map((item) => item.event));
    };

    return { drain, handler };
  }

  private applyLoggerConfig(): void {
    const cliVersion = readString(this.defaultProperties.cliVersion);

    initLogger({
      _suppressDrainWarning: this.disabled,
      drain: this.disabled ? undefined : this.drain,
      enabled: !this.disabled,
      env: {
        environment:
          process.env.NODE_ENV ?? (isCi() ? "production" : "development"),
        service: this.source,
        version: cliVersion,
      },
      pretty: false,
      silent: true,
      stringify: false,
    });
  }

  private buildBaseContext(eventName: string): TelemetryProperties {
    this.sequence += 1;

    return {
      appName: this.appName,
      arch: process.arch,
      ci: isCi(),
      command: this.activeCommandName,
      commandRunId: this.activeCommandRunId,
      event: eventName,
      firstRun: this.isFirstRun,
      installId: this.installId,
      interactive: Boolean(process.stdin.isTTY && process.stdout.isTTY),
      nodeVersion: process.version,
      platform: process.platform,
      sequence: this.sequence,
      sessionId: this.sessionId,
      source: this.source,
      timestamp: new Date().toISOString(),
      tty: Boolean(process.stdout.isTTY),
      ...this.defaultProperties,
    };
  }

  private async flushAll(): Promise<void> {
    try {
      await this.queueReplayPromise;
      await this.drain.flush();
      await this.queueWritePromise;
      await this.flushQueuedEvents();

      if (this.debug) {
        this.logDebug("Flushed telemetry events");
      }
    } catch (error) {
      if (this.debug) {
        this.logDebug("Telemetry flush failed:", error);
      }
    } finally {
      this.flushPromise = null;
    }
  }

  private async sendBatch(events: WideEvent[]): Promise<void> {
    if (!this.endpoint || events.length === 0) {
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(this.endpoint, {
        body: JSON.stringify(events),
        headers: this.headers,
        method: "POST",
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `Telemetry ingest failed with status ${response.status}`
        );
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  private async persistDroppedEvents(
    events: DrainContext[],
    error?: Error
  ): Promise<void> {
    const write = async () => {
      try {
        const existing = await this.readQueuedEvents();
        const next = [...existing, ...events.map((item) => item.event)].slice(
          -DEFAULT_QUEUE_LIMIT
        );
        await this.writeQueuedEvents(next);

        if (this.debug) {
          this.logDebug(
            `Persisted ${events.length} dropped telemetry event(s) to disk`,
            error
          );
        }
      } catch (queueError) {
        if (this.debug) {
          this.logDebug(
            "Failed to persist dropped telemetry events:",
            queueError
          );
        }
      }
    };

    this.queueWritePromise = (async () => {
      await this.queueWritePromise;
      await write();
    })();
    await this.queueWritePromise;
  }

  private async flushQueuedEvents(): Promise<void> {
    if (this.disabled || !this.endpoint) {
      return;
    }

    try {
      const queuedEvents = await this.readQueuedEvents();

      if (queuedEvents.length === 0) {
        return;
      }

      await this.sendBatch(queuedEvents);
      await fs.unlink(this.queuePath).catch(() => {});

      if (this.debug) {
        this.logDebug(
          `Replayed ${queuedEvents.length} queued telemetry event(s)`
        );
      }
    } catch (error) {
      if (this.debug) {
        this.logDebug("Failed to replay queued telemetry events:", error);
      }
    }
  }

  private async readQueuedEvents(): Promise<WideEvent[]> {
    try {
      const content = await fs.readFile(this.queuePath, "utf-8");
      const parsed = JSON.parse(content);

      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.filter(
        (item): item is WideEvent => typeof item === "object" && item !== null
      );
    } catch {
      return [];
    }
  }

  private async writeQueuedEvents(events: WideEvent[]): Promise<void> {
    await fs.mkdir(this.storageDir, { recursive: true });
    await fs.writeFile(this.queuePath, JSON.stringify(events, null, 2), {
      mode: 0o600,
    });
  }

  private loadOrCreateInstallIdentity(): {
    installId: string;
    isFirstRun: boolean;
  } {
    try {
      fsSync.mkdirSync(this.storageDir, { recursive: true });

      if (fsSync.existsSync(this.statePath)) {
        const content = fsSync.readFileSync(this.statePath, "utf-8");
        const parsed = JSON.parse(content) as { installId?: string };

        if (
          typeof parsed.installId === "string" &&
          parsed.installId.length > 0
        ) {
          return {
            installId: parsed.installId,
            isFirstRun: false,
          };
        }
      }
    } catch (error) {
      if (this.debug) {
        this.logDebug("Failed to read telemetry state file:", error);
      }
    }

    const installId = crypto.randomUUID();

    try {
      fsSync.mkdirSync(this.storageDir, { recursive: true });
      fsSync.writeFileSync(
        this.statePath,
        JSON.stringify(
          {
            createdAt: new Date().toISOString(),
            installId,
          },
          null,
          2
        ),
        { mode: 0o600 }
      );
    } catch (error) {
      if (this.debug) {
        this.logDebug("Failed to persist telemetry install ID:", error);
      }
    }

    return {
      installId,
      isFirstRun: true,
    };
  }

  private buildErrorMetadata(error: Error): TelemetryObject {
    const eventError = error as Error & {
      cause?: unknown;
      code?: unknown;
      status?: unknown;
      statusCode?: unknown;
    };

    let cause: string | undefined;
    if (eventError.cause instanceof Error) {
      cause = eventError.cause.message;
    } else {
      const { cause: errorCause } = eventError;
      if (typeof errorCause === "string") {
        cause = errorCause;
      }
    }

    return this.sanitizeProperties({
      cause,
      code:
        typeof eventError.code === "string" ||
        typeof eventError.code === "number"
          ? eventError.code
          : undefined,
      message: eventError.message,
      name: eventError.name,
      status:
        typeof eventError.status === "number" ? eventError.status : undefined,
      statusCode:
        typeof eventError.statusCode === "number"
          ? eventError.statusCode
          : undefined,
    });
  }

  private sanitizeEventProperties(properties: EventLike): TelemetryObject {
    const sanitized = this.sanitizeProperties(properties);
    return this.sanitizeHook ? this.sanitizeHook(sanitized) : sanitized;
  }

  private sanitizeProperties(properties: EventLike): TelemetryObject {
    const sanitized: TelemetryObject = {};

    for (const [key, value] of Object.entries(properties)) {
      if (RESERVED_TOP_LEVEL_KEYS.has(key) || value === undefined) {
        continue;
      }

      if (SENSITIVE_KEY_PATTERN.test(key)) {
        sanitized[key] = "[redacted]";
        continue;
      }

      sanitized[key] = this.sanitizeValue(value, 0, key);
    }

    return sanitized;
  }

  private sanitizeValue(
    value: unknown,
    depth = 0,
    keyHint?: string
  ): TelemetryValue {
    if (depth >= MAX_DEPTH) {
      return "[truncated]";
    }

    if (value === null) {
      return null;
    }

    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return sanitizePrimitive(value, keyHint);
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (value instanceof Error) {
      return this.sanitizeProperties(this.buildErrorMetadata(value));
    }

    if (Array.isArray(value)) {
      return value
        .slice(0, MAX_ARRAY_LENGTH)
        .map((item) => this.sanitizeValue(item, depth + 1));
    }

    if (typeof value === "object") {
      const objectValue = value as Record<string, unknown>;
      const sanitizedObject: Record<string, TelemetryValue> = {};

      for (const key of Object.keys(objectValue).slice(0, MAX_OBJECT_KEYS)) {
        const nextValue = objectValue[key];

        if (nextValue === undefined) {
          continue;
        }

        if (SENSITIVE_KEY_PATTERN.test(key)) {
          sanitizedObject[key] = "[redacted]";
          continue;
        }

        sanitizedObject[key] = this.sanitizeValue(nextValue, depth + 1, key);
      }

      return sanitizedObject;
    }

    return String(value);
  }

  private logDebug(message: string, ...args: unknown[]): void {
    if (this.logger) {
      this.logger.debug(message, ...args);
    } else {
      console.debug(message, ...args);
    }
  }
}

/**
 * Creates the built-in telemetry client.
 *
 * @remarks
 * Events are queued through Hexbus' durable telemetry pipeline. Flush failures
 * are best effort and persisted locally for replay when storage is available.
 *
 * @param options - Telemetry behavior and event defaults.
 * @returns An enabled or disabled telemetry client depending on options and
 * environment opt-out variables.
 */
export function createTelemetry(options: TelemetryOptions = {}): Telemetry {
  return new DurableTelemetry(options);
}
