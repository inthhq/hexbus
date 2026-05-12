import fs from 'node:fs/promises';
import path from 'node:path';
import { Project } from 'ts-morph';
import type { CodemodProject, CollectOptions } from './types';

/**
 * Default source extensions included by codemod file collection.
 */
export const DEFAULT_SUPPORTED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];
/**
 * Default directory basenames skipped by codemod file collection.
 */
export const DEFAULT_IGNORED_DIRS = [
	'.git',
	'.next',
	'dist',
	'dist-types',
	'node_modules',
	'coverage',
];

async function walkDirectory(
	directory: string,
	options: Required<CollectOptions>,
	files: string[]
): Promise<void> {
	const entries = await fs.readdir(directory, { withFileTypes: true });

	for (const entry of entries) {
		const entryPath = path.join(directory, entry.name);

		if (entry.isDirectory()) {
			if (!options.ignoredDirs.includes(entry.name)) {
				await walkDirectory(entryPath, options, files);
			}
			continue;
		}

		if (!entry.isFile()) {
			continue;
		}

		if (!options.extensions.includes(path.extname(entry.name))) {
			continue;
		}

		if (options.include(entryPath)) {
			files.push(entryPath);
		}
	}
}

/**
 * Recursively collects source files below a project root.
 *
 * @param projectRoot - Directory to walk.
 * @param options - Extension, ignored directory, and include filters.
 * @returns Sorted absolute file paths matching the configured filters.
 */
export async function collectSourceFiles(
	projectRoot: string,
	options: CollectOptions = {}
): Promise<string[]> {
	const resolvedOptions: Required<CollectOptions> = {
		extensions: options.extensions ?? DEFAULT_SUPPORTED_EXTENSIONS,
		ignoredDirs: options.ignoredDirs ?? DEFAULT_IGNORED_DIRS,
		include: options.include ?? (() => true),
	};
	const files: string[] = [];

	await walkDirectory(projectRoot, resolvedOptions, files);
	return files.sort();
}

/**
 * Creates a ts-morph project from collected source files.
 *
 * @remarks
 * The returned `save()` method is dry-run aware. When `dryRun` is true, callers
 * can still inspect changed source files but no writes occur.
 *
 * @param projectRoot - Directory to collect source files from.
 * @param options - Collection filters and optional dry-run mode.
 * @returns A codemod project containing the ts-morph project and source files.
 */
export async function createCodemodProject(
	projectRoot: string,
	options: CollectOptions & { dryRun?: boolean } = {}
): Promise<CodemodProject> {
	const project = new Project({
		skipAddingFilesFromTsConfig: true,
	});
	const filePaths = await collectSourceFiles(projectRoot, options);
	const sourceFiles = filePaths.map((filePath) =>
		project.addSourceFileAtPath(filePath)
	);

	return {
		project,
		sourceFiles,
		async save() {
			if (options.dryRun) {
				return;
			}
			await project.save();
		},
	};
}
