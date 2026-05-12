import { defineConfig } from 'tsdown';

export default defineConfig({
	entry: ['./src/base-config.ts', './src/ui-config.ts'],
	format: 'esm',
	platform: 'node',
	dts: true,
	clean: true,
});
