import { describe, expect, it } from 'vitest';
import { createDisabledTelemetry, createTelemetry } from '../telemetry';

describe('telemetry', () => {
	it('creates disabled telemetry', () => {
		const telemetry = createDisabledTelemetry();

		expect(telemetry.isDisabled()).toBe(true);
		expect(() => telemetry.trackEvent('anything')).not.toThrow();
	});

	it('can queue and flush events without an endpoint', async () => {
		const telemetry = createTelemetry({
			appName: 'test-cli',
			defaultProperties: { packageName: 'test' },
		});

		telemetry.trackEvent('event');
		telemetry.trackCommand('setup', ['arg'], { force: true });
		expect(telemetry.isDisabled()).toBe(false);
		await expect(telemetry.flush()).resolves.toBeUndefined();
	});
});
