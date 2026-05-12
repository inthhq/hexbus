import { describe, expect, it } from 'vitest';
import { createDisabledTelemetry, createTelemetry } from '../telemetry';

describe('telemetry', () => {
	it('creates disabled telemetry', () => {
		const telemetry = createDisabledTelemetry();

		expect(telemetry.isDisabled()).toBe(true);
		expect(() => telemetry.trackEvent('anything')).not.toThrow();
	});

	it('can queue and flush events without an endpoint', () => {
		const telemetry = createTelemetry({
			appName: 'test-cli',
			defaultProperties: { packageName: 'test' },
		});

		telemetry.trackEvent('event');
		telemetry.trackCommand('setup', ['arg'], { force: true });
		expect(telemetry.isDisabled()).toBe(false);
		expect(() => telemetry.flushSync()).not.toThrow();
	});
});
