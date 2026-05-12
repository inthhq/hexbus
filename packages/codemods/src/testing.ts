import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export type FixtureTree = Record<string, string>;

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
		const filePath = path.join(projectRoot, relativePath);
		await fs.mkdir(path.dirname(filePath), { recursive: true });
		await fs.writeFile(filePath, content, 'utf-8');
	}
}

export async function readFixtureFile(
	projectRoot: string,
	relativePath: string
): Promise<string> {
	return fs.readFile(path.join(projectRoot, relativePath), 'utf-8');
}

export async function runAndAssert<T>(
	fixture: FixtureTree,
	run: (projectRoot: string) => Promise<T>
): Promise<{ projectRoot: string; result: T }> {
	const projectRoot = await fs.mkdtemp(
		path.join(os.tmpdir(), 'hexbus-codemod-')
	);
	await writeFixtureTree(projectRoot, fixture);
	const result = await run(projectRoot);
	return { projectRoot, result };
}
