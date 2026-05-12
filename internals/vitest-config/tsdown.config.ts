import { defineConfig } from 'tsdown';

export default defineConfig({
	entry: ['./src/base-config.ts', './src/ui-config.ts'],
	format: 'esm',
	platform: 'node',
	unbundle: true,
	fixedExtension: false,
	dts: true,
	clean: true,
});
