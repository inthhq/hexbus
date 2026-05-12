import type { CliLogger, Telemetry } from "./types";

export interface TelemetryOptions {
  disabled?: boolean;
  debug?: boolean;
  endpoint?: string;
  appName?: string;
  envVarPrefix?: string;
  defaultProperties?: Record<string, unknown>;
  logger?: Pick<CliLogger, "debug" | "warn">;
}

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
  VERSION_DISPLAYED: "version_displayed",
} as const;

export type TelemetryEventNameType =
  (typeof TelemetryEventName)[keyof typeof TelemetryEventName];

function isEnvDisabled(prefix: string): boolean {
  const value = process.env[`${prefix}_TELEMETRY_DISABLED`];
  return value === "1" || value === "true";
}

export function createDisabledTelemetry(): Telemetry {
  return {
    flush: async () => {},
    isDisabled: () => true,
    shutdown: async () => {},
    trackCommand: () => {},
    trackError: () => {},
    trackEvent: () => {},
  };
}

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
    isDisabled() {
      return false;
    },
    async shutdown() {
      await flush();
    },
    trackCommand(command, args = [], flags = {}) {
      trackEvent(TelemetryEventName.COMMAND_INVOKED, {
        argsCount: args.length,
        command,
        enabledFlags: Object.entries(flags)
          .filter(([, value]) => value !== false && value !== undefined)
          .map(([key]) => key)
          .toSorted(),
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
