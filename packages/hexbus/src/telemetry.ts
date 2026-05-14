import type { CliLogger, Telemetry } from "./types";

/**
 * Options for the built-in in-memory telemetry client.
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
  defaultProperties?: Record<string, unknown>;
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
  return value === "1" || value === "true";
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
    isDisabled: () => true,
    shutdown: async () => {},
    trackCommand: () => {},
    trackError: () => {},
    trackEvent: () => {},
  };
}

/**
 * Creates the built-in telemetry client.
 *
 * @remarks
 * Events are queued in memory. `flush()` posts the queue to `endpoint` when one
 * is configured, then clears the queue. Failed flushes are reported through
 * the optional logger and do not throw, keeping telemetry best effort.
 *
 * @param options - Telemetry behavior and event defaults.
 * @returns An enabled or disabled telemetry client depending on options and
 * environment opt-out variables.
 */
export function createTelemetry(options: TelemetryOptions = {}): Telemetry {
  const envVarPrefix = options.envVarPrefix ?? "APP";
  const disabled = options.disabled === true || isEnvDisabled(envVarPrefix);
  const events: { name: string; properties: Record<string, unknown> }[] = [];

  if (disabled) {
    return createDisabledTelemetry();
  }

  const trackEvent = (
    eventName: string,
    properties: Record<string, unknown> = {}
  ) => {
    const payload = {
      name: eventName,
      properties: {
        appName: options.appName ?? "cli",
        ...options.defaultProperties,
        ...properties,
        timestamp: new Date().toISOString(),
      },
    };

    events.push(payload);

    if (options.debug) {
      options.logger?.debug("Telemetry event queued", payload);
    }
  };

  const flush = async (): Promise<void> => {
    if (!options.endpoint || events.length === 0) {
      events.length = 0;
      return;
    }

    const batch = events.splice(0);
    try {
      await fetch(options.endpoint, {
        body: JSON.stringify({ events: batch }),
        headers: { "content-type": "application/json" },
        keepalive: true,
        method: "POST",
      });
    } catch (error) {
      options.logger?.warn(
        `Failed to send telemetry: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  return {
    flush,
    flushBackground() {
      void flush();
    },
    isDisabled() {
      return false;
    },
    async shutdown() {
      await flush();
    },
    trackCommand(command, args = [], flags = {}) {
      const enabledFlags = Object.entries(flags)
        .filter(([, value]) => value !== false && value !== undefined)
        .map(([key]) => key);
      enabledFlags.sort();

      trackEvent(TelemetryEventName.COMMAND_INVOKED, {
        argsCount: args.length,
        command,
        enabledFlags,
      });
    },
    trackError(error, command) {
      trackEvent(TelemetryEventName.ERROR_OCCURRED, {
        command,
        errorMessage: error.message,
        errorName: error.name,
      });
    },
    trackEvent,
  };
}
