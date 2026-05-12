import { describe, expect, it } from 'vitest';
import { createColors, detectColorSupport } from '../color';

describe('color', () => {
	it('formats enabled colors with ansi escapes', () => {
		const color = createColors(true);

		expect(color.green('ready')).toBe('\x1b[32mready\x1b[39m');
		expect(color.bgRed(color.black(' error '))).toBe(
			'\x1b[41m\x1b[30m error \x1b[39m\x1b[49m'
		);
	});

	it('reopens styles when the input contains a nested close code', () => {
		const color = createColors(true);
		const nested = `one ${color.green('two')} three`;

		expect(color.green(nested)).toBe(
			'\x1b[32mone \x1b[32mtwo\x1b[32m three\x1b[39m'
		);
	});

	it('returns plain strings when colors are disabled', () => {
		const color = createColors(false);

		expect(color.green('ready')).toBe('ready');
		expect(color.bgRed(color.black(' error '))).toBe(' error ');
	});
});

describe('detectColorSupport', () => {
	it('supports forced color without a tty', () => {
		expect(
			detectColorSupport({
				argv: [],
				env: { FORCE_COLOR: '1' },
				platform: 'linux',
				stdout: { isTTY: false },
			})
		).toBe(true);
	});

	it('disables forced color when FORCE_COLOR is zero', () => {
		expect(
			detectColorSupport({
				argv: [],
				env: { FORCE_COLOR: '0' },
				platform: 'linux',
				stdout: { isTTY: true },
			})
		).toBe(false);
	});

	it('does not force color only because ci is set', () => {
		expect(
			detectColorSupport({
				argv: [],
				env: { CI: 'true' },
				platform: 'linux',
				stdout: { isTTY: false },
			})
		).toBe(false);
	});

	it('disables color when no-color is requested', () => {
		expect(
			detectColorSupport({
				argv: ['--no-color'],
				env: { FORCE_COLOR: '1' },
				platform: 'linux',
				stdout: { isTTY: true },
			})
		).toBe(false);
	});

	it('disables color for dumb terminals', () => {
		expect(
			detectColorSupport({
				argv: [],
				env: { TERM: 'dumb' },
				platform: 'linux',
				stdout: { isTTY: true },
			})
		).toBe(false);
	});
});
