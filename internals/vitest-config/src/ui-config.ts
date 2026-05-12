import { defineProject, mergeConfig } from 'vitest/config';
import { baseConfig } from './base-config.js';

/**
 * Shared Vitest configuration for packages that test browser-facing UI code.
 *
 * @remarks
 * This extends `baseConfig` and switches the test environment to `jsdom`.
 */
export const uiConfig = mergeConfig(
	baseConfig,
	defineProject({
		test: {
			environment: 'jsdom',
		},
	})
);
