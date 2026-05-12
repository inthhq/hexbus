import { describe, expect, it } from 'vitest';
import { collectSourceFiles } from '../collect';
import { withTempProject } from '../testing';

describe('collectSourceFiles', () => {
	it('collects source files and ignores generated directories', async () => {
		await withTempProject(
			{
				'src/app.ts': 'export const app = true;',
				'src/app.tsx': 'export const App = () => null;',
				'node_modules/pkg/index.ts': 'export const ignored = true;',
				'dist/index.js': 'export const ignored = true;',
				'README.md': '# ignored',
			},
			async (projectRoot) => {
				const files = await collectSourceFiles(projectRoot);

				expect(files).toHaveLength(2);
				expect(files.some((file) => file.endsWith('src/app.ts'))).toBe(true);
				expect(files.some((file) => file.endsWith('src/app.tsx'))).toBe(true);
			}
		);
	});
});
