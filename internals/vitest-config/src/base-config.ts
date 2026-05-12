import { defineConfig } from 'vitest/config';

export const baseConfig = defineConfig({
	test: {
		coverage: {
			provider: 'istanbul',
			reporter: [
				'text',
				[
					'json-summary',
					{
						file: 'coverage-summary.json',
					},
				],
				[
					'json',
					{
						file: 'coverage-final.json',
					},
				],
				[
					'html',
					{
						subdir: 'html',
					},
				],
			],
			reportOnFailure: true,
			enabled: true,
			reportsDirectory: './coverage',
			include: [
				'**/*.{ts,tsx,js,jsx}',
				'!**/*.d.ts',
				'!**/node_modules/**',
				'!**/dist/**',
				'!**/dist-types/**',
				'!**/coverage/**',
			],
		},
	},
});
