import type { CliLogger, Telemetry } from './types';

export interface TelemetryOptions {
	disabled?: boolean;
	debug?: boolean;
	endpoint?: string;
	appName?: string;
	envVarPrefix?: string;
	defaultProperties?: Record<string, unknown>;
	logger?: Pick<CliLogger, 'debug' | 'warn'>;
}

export const TelemetryEventName = {
	CLI_INVOKED: 'cli_invoked',
	CLI_ENVIRONMENT_DETECTED: 'cli_environment_detected',
	CLI_COMPLETED: 'cli_completed',
	COMMAND_INVOKED: 'command_invoked',
	COMMAND_SUCCEEDED: 'command_succeeded',
	COMMAND_FAILED: 'command_failed',
	COMMAND_UNKNOWN: 'command_unknown',
	ERROR_OCCURRED: 'error_occurred',
	HELP_DISPLAYED: 'help_displayed',
	VERSION_DISPLAYED: 'version_displayed',
	INTERACTIVE_MENU_OPENED: 'interactive_menu_opened',
	INTERACTIVE_MENU_EXITED: 'interactive_menu_exited',
} as const;

export type TelemetryEventNameType =
	(typeof TelemetryEventName)[keyof typeof TelemetryEventName];

function isEnvDisabled(prefix: string): boolean {
	const value = process.env[`${prefix}_TELEMETRY_DISABLED`];
	return value === '1' || value === 'true';
}

export function createDisabledTelemetry(): Telemetry {
	return {
		trackEvent: () => {},
		trackCommand: () => {},
		trackError: () => {},
		flush: async () => {},
		shutdown: async () => {},
		isDisabled: () => true,
	};
}

export function createTelemetry(options: TelemetryOptions = {}): Telemetry {
	const envVarPrefix = options.envVarPrefix ?? 'APP';
	const disabled = options.disabled === true || isEnvDisabled(envVarPrefix);
	const events: Array<{ name: string; properties: Record<string, unknown> }> =
		[];

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
				appName: options.appName ?? 'cli',
				...options.defaultProperties,
				...properties,
				timestamp: new Date().toISOString(),
			},
		};

		events.push(payload);

		if (options.debug) {
			options.logger?.debug('Telemetry event queued', payload);
		}
	};

	const flush = async (): Promise<void> => {
		if (!options.endpoint || events.length === 0) {
			events.length = 0;
			return;
		}

		const batch = events.splice(0, events.length);
		try {
			await fetch(options.endpoint, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ events: batch }),
				keepalive: true,
			});
		} catch (error) {
			options.logger?.warn(
				`Failed to send telemetry: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	};

	return {
		trackEvent,
		trackCommand(command, args = [], flags = {}) {
			trackEvent(TelemetryEventName.COMMAND_INVOKED, {
				command,
				argsCount: args.length,
				enabledFlags: Object.entries(flags)
					.filter(([, value]) => value !== false && value !== undefined)
					.map(([key]) => key)
					.sort(),
			});
		},
		trackError(error, command) {
			trackEvent(TelemetryEventName.ERROR_OCCURRED, {
				command,
				errorName: error.name,
				errorMessage: error.message,
			});
		},
		flush,
		async shutdown() {
			await flush();
		},
		isDisabled() {
			return false;
		},
	};
}
