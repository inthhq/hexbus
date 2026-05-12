import fs from 'node:fs/promises';
import path from 'node:path';
import { Project } from 'ts-morph';
import type { CodemodProject, CollectOptions } from './types';

export const DEFAULT_SUPPORTED_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];
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
