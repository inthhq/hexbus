import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * In-memory fixture files keyed by project-relative path.
 */
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

/**
 * Creates a temporary project, writes fixture files, runs a callback, and
 * removes the project afterward.
 *
 * @typeParam T - Value returned by the callback.
 * @param fixture - Project-relative files to create.
 * @param run - Callback that receives the temporary project root.
 * @returns The callback result.
 *
 * @throws When a fixture path is absolute or escapes the project root.
 */
export async function withTempProject<T>(
  fixture: FixtureTree,
  run: (projectRoot: string) => Promise<T>
): Promise<T> {
  const projectRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "hexbus-codemod-")
  );

  try {
    await writeFixtureTree(projectRoot, fixture);
    return await run(projectRoot);
  } finally {
    await fs.rm(projectRoot, { force: true, recursive: true });
  }
}

/**
 * Writes fixture files under an existing project root.
 *
 * @param projectRoot - Root directory that receives fixture files.
 * @param fixture - Project-relative files to write.
 *
 * @throws When a fixture path is absolute or escapes the project root.
 */
export async function writeFixtureTree(
  projectRoot: string,
  fixture: FixtureTree
): Promise<void> {
  for (const [relativePath, content] of Object.entries(fixture)) {
    const filePath = resolveWithinRoot(projectRoot, relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, "utf-8");
  }
}

/**
 * Reads a UTF-8 fixture file from a project root.
 *
 * @param projectRoot - Root directory containing the fixture.
 * @param relativePath - Project-relative file path to read.
 * @returns File contents.
 *
 * @throws When the path is absolute, escapes the project root, or cannot be
 * read.
 */
export async function readFixtureFile(
  projectRoot: string,
  relativePath: string
): Promise<string> {
  const filePath = resolveWithinRoot(projectRoot, relativePath);
  return fs.readFile(filePath, "utf-8");
}

/**
 * Runs a fixture-backed test callback and optionally keeps the temp project.
 *
 * @remarks
 * This is useful for assertion-heavy tests that need the callback result plus,
 * when debugging, a retained project directory for inspection.
 *
 * @typeParam T - Value returned by the callback.
 * @param fixture - Project-relative files to create.
 * @param run - Callback that receives the temporary project root.
 * @param options - Test helper options.
 * @returns The callback result and, when `keep` is true, the retained project
 * root.
 */
export async function runAndAssert<T>(
  fixture: FixtureTree,
  run: (projectRoot: string) => Promise<T>,
  options: { keep?: boolean } = {}
): Promise<{ projectRoot?: string; result: T }> {
  const { keep = false } = options;
  const projectRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "hexbus-codemod-")
  );
  let result: T;
  try {
    await writeFixtureTree(projectRoot, fixture);
    result = await run(projectRoot);
  } finally {
    if (!keep) {
      await fs.rm(projectRoot, { force: true, recursive: true });
    }
  }

  return keep ? { projectRoot, result } : { result };
}
