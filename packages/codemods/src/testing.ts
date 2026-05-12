import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export type FixtureTree = Record<string, string>;

function resolveWithinRoot(projectRoot: string, relativePath: string): string {
	if (path.isAbsolute(relativePath)) {
		throw new Error(
			`Fixture path must be relative to projectRoot: ${relativePath}`
		);
	}

	const resolvedRoot = path.resolve(projectRoot);
	const resolved = path.resolve(resolvedRoot, relativePath);
	if (
		resolved !== resolvedRoot &&
		!resolved.startsWith(resolvedRoot + path.sep)
	) {
		throw new Error(`Fixture path escapes projectRoot: ${relativePath}`);
	}

	return resolved;
}

export async function withTempProject<T>(
	fixture: FixtureTree,
	run: (projectRoot: string) => Promise<T>
): Promise<T> {
	const projectRoot = await fs.mkdtemp(
		path.join(os.tmpdir(), 'hexbus-codemod-')
	);

	try {
		await writeFixtureTree(projectRoot, fixture);
		return await run(projectRoot);
	} finally {
		await fs.rm(projectRoot, { recursive: true, force: true });
	}
}

export async function writeFixtureTree(
	projectRoot: string,
	fixture: FixtureTree
): Promise<void> {
	for (const [relativePath, content] of Object.entries(fixture)) {
		const filePath = resolveWithinRoot(projectRoot, relativePath);
		await fs.mkdir(path.dirname(filePath), { recursive: true });
		await fs.writeFile(filePath, content, 'utf-8');
	}
}

export async function readFixtureFile(
	projectRoot: string,
	relativePath: string
): Promise<string> {
	const filePath = resolveWithinRoot(projectRoot, relativePath);
	return fs.readFile(filePath, 'utf-8');
}

export async function runAndAssert<T>(
	fixture: FixtureTree,
	run: (projectRoot: string) => Promise<T>,
	options: { keep?: boolean } = {}
): Promise<{ projectRoot: string; result: T }> {
	const { keep = false } = options;
	const projectRoot = await fs.mkdtemp(
		path.join(os.tmpdir(), 'hexbus-codemod-')
	);
	try {
		await writeFixtureTree(projectRoot, fixture);
		const result = await run(projectRoot);
		return { projectRoot, result };
	} finally {
		if (!keep) {
			await fs.rm(projectRoot, { recursive: true, force: true });
		}
	}
}
