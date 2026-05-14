import fs from "node:fs/promises";
import path from "node:path";

import { promptSelect } from "./prompts";
import type {
  CliLogger,
  FrameworkDetectionResult,
  PackageManager,
  PackageManagerResult,
} from "./types";

/**
 * Product package identifiers to select after framework detection.
 *
 * @remarks
 * Use this map when a product CLI installs different packages for core,
 * React, or Next.js projects.
 *
 * @typeParam TPackage - Product-specific package identifier.
 */
export interface FrameworkPackageMap<TPackage extends string = string> {
  /**
   * Package identifier used when no React framework is detected.
   */
  core?: TPackage;
  /**
   * Package identifier used for React-compatible projects.
   */
  react?: TPackage;
  /**
   * Package identifier used specifically for Next.js projects.
   */
  next?: TPackage;
}

const LOCK_FILE_MAP: Record<string, PackageManager> = {
  "bun.lock": "bun",
  "bun.lockb": "bun",
  "package-lock.json": "npm",
  "pnpm-lock.yaml": "pnpm",
  "yarn.lock": "yarn",
};

const PACKAGE_MANAGER_CONFIG: Record<
  PackageManager,
  Omit<PackageManagerResult, "name">
> = {
  bun: {
    addCommand: "bun add",
    execCommand: "bunx",
    installCommand: "bun install",
    runCommand: "bun run",
  },
  npm: {
    addCommand: "npm install",
    execCommand: "npx",
    installCommand: "npm install",
    runCommand: "npm run",
  },
  pnpm: {
    addCommand: "pnpm add",
    execCommand: "pnpm dlx",
    installCommand: "pnpm install",
    runCommand: "pnpm",
  },
  yarn: {
    addCommand: "yarn add",
    execCommand: "yarn dlx",
    installCommand: "yarn",
    runCommand: "yarn",
  },
};

async function readPackageJson(projectRoot: string) {
  const packageJsonPath = path.join(projectRoot, "package.json");
  const content = await fs.readFile(packageJsonPath, "utf-8");
  return JSON.parse(content) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    packageManager?: string;
  };
}

function resolveFramework<TPackage extends string>(
  deps: Record<string, string | undefined>,
  packageMap: FrameworkPackageMap<TPackage>
): Pick<
  FrameworkDetectionResult<TPackage>,
  "framework" | "frameworkVersion" | "pkg"
> {
  const hasReact = "react" in deps;

  if ("next" in deps) {
    return {
      framework: "Next.js",
      frameworkVersion: deps.next ?? null,
      pkg: packageMap.next ?? packageMap.react ?? null,
    };
  }

  if ("@remix-run/react" in deps) {
    return {
      framework: "Remix",
      frameworkVersion: deps["@remix-run/react"] ?? null,
      pkg: packageMap.react ?? null,
    };
  }

  if ("@vitejs/plugin-react" in deps || "@vitejs/plugin-react-swc" in deps) {
    return {
      framework: "Vite + React",
      frameworkVersion:
        deps["@vitejs/plugin-react"] ??
        deps["@vitejs/plugin-react-swc"] ??
        null,
      pkg: packageMap.react ?? null,
    };
  }

  if ("gatsby" in deps) {
    return {
      framework: "Gatsby",
      frameworkVersion: deps.gatsby ?? null,
      pkg: packageMap.react ?? null,
    };
  }

  if (hasReact) {
    return {
      framework: "React",
      frameworkVersion: deps.react ?? null,
      pkg: packageMap.react ?? null,
    };
  }

  return {
    framework: null,
    frameworkVersion: null,
    pkg: packageMap.core ?? null,
  };
}

/**
 * Detects common frontend frameworks from project dependencies.
 *
 * @remarks
 * Detection reads the nearest project's `package.json` and looks at
 * dependencies and devDependencies. It recognizes Next.js, Remix, Vite React,
 * Gatsby, generic React, Tailwind CSS, and a configured core fallback.
 *
 * @typeParam TPackage - Product-specific package identifier returned in
 * `FrameworkDetectionResult.pkg`.
 * @param projectRoot - Directory containing the package.json to inspect.
 * @param logger - Optional logger for debug diagnostics.
 * @param packageMap - Product packages to select for detected frameworks.
 * @returns Framework metadata and the selected product package identifier.
 */
export async function detectFramework<TPackage extends string = string>(
  projectRoot: string,
  logger?: CliLogger,
  packageMap: FrameworkPackageMap<TPackage> = {}
): Promise<FrameworkDetectionResult<TPackage>> {
  try {
    logger?.debug(`Detecting framework in ${projectRoot}`);
    const packageJson = await readPackageJson(projectRoot);
    const deps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    const hasReact = "react" in deps;
    const reactVersion = hasReact ? deps.react : null;
    const tailwindVersion = deps.tailwindcss ?? null;
    const { framework, frameworkVersion, pkg } = resolveFramework(
      deps,
      packageMap
    );

    return {
      framework,
      frameworkVersion,
      hasReact,
      pkg,
      reactVersion: reactVersion ?? null,
      tailwindVersion,
    };
  } catch (error) {
    logger?.debug(
      `Framework detection failed: ${error instanceof Error ? error.message : String(error)}`
    );
    return {
      framework: null,
      frameworkVersion: null,
      hasReact: false,
      pkg: packageMap.core ?? null,
      reactVersion: null,
      tailwindVersion: null,
    };
  }
}

/**
 * Finds the nearest project root by walking up to a package.json.
 *
 * @remarks
 * The search is capped at ten directory levels to avoid surprising filesystem
 * traversal. When no root is found, the original current working directory is
 * returned and a warning is logged.
 *
 * @param cwd - Directory where invocation started.
 * @param logger - Optional logger for warning output.
 * @returns The detected project root or `cwd` as a fallback.
 */
export async function detectProjectRoot(
  cwd: string,
  logger?: CliLogger
): Promise<string> {
  let projectRoot = cwd;
  let previousDirectory = "";
  let depth = 0;
  const maxDepth = 10;

  while (projectRoot !== previousDirectory && depth < maxDepth) {
    try {
      await fs.access(path.join(projectRoot, "package.json"));
      return projectRoot;
    } catch {
      previousDirectory = projectRoot;
      projectRoot = path.dirname(projectRoot);
      depth++;
    }
  }

  logger?.warn("Could not find project root; using current working directory");
  return cwd;
}

async function detectFromLockFile(
  projectRoot: string,
  logger?: CliLogger
): Promise<PackageManager | null> {
  for (const [lockFile, pm] of Object.entries(LOCK_FILE_MAP)) {
    try {
      await fs.access(path.join(projectRoot, lockFile));
      logger?.debug(`Found ${lockFile}, using ${pm}`);
      return pm;
    } catch {
      // Continue checking other lockfiles.
    }
  }
  return null;
}

async function detectFromPackageJson(
  projectRoot: string,
  logger?: CliLogger
): Promise<PackageManager | null> {
  try {
    const packageJson = await readPackageJson(projectRoot);
    const match = packageJson.packageManager?.match(/^(npm|yarn|pnpm|bun)@/);
    if (match) {
      logger?.debug(`Found packageManager field: ${match[1]}`);
      return match[1] as PackageManager;
    }
  } catch {
    // Ignore package.json detection errors.
  }
  return null;
}

function promptForPackageManager(logger?: CliLogger): Promise<PackageManager> {
  logger?.debug("Prompting user to select package manager");

  return promptSelect<PackageManager>({
    cancelMessage: "Package manager selection cancelled",
    message: "Which package manager do you use?",
    options: [
      { hint: "Fast all-in-one toolkit", label: "bun", value: "bun" },
      { hint: "Fast, disk space efficient", label: "pnpm", value: "pnpm" },
      { hint: "Classic package manager", label: "yarn", value: "yarn" },
      { hint: "Default Node.js package manager", label: "npm", value: "npm" },
    ],
  });
}

/**
 * Detects the package manager used by a project.
 *
 * @remarks
 * Detection prefers lockfiles, then the `packageManager` field in
 * `package.json`, then an optional interactive prompt, and finally `npm`.
 *
 * @param projectRoot - Directory to inspect for lockfiles and package.json.
 * @param logger - Optional logger for debug output.
 * @param options - Detection options.
 * @returns Command templates for the detected package manager.
 *
 * @throws When interactive prompting is enabled and the user cancels package
 * manager selection.
 */
export async function detectPackageManager(
  projectRoot: string,
  logger?: CliLogger,
  options?: { interactive?: boolean }
): Promise<PackageManagerResult> {
  let pm = await detectFromLockFile(projectRoot, logger);

  if (!pm) {
    pm = await detectFromPackageJson(projectRoot, logger);
  }

  if (!pm) {
    if (
      options?.interactive === true &&
      process.stdin.isTTY &&
      !process.env.CI
    ) {
      pm = await promptForPackageManager(logger);
    } else {
      pm = "npm";
      logger?.debug("Defaulting to npm");
    }
  }

  return {
    name: pm,
    ...PACKAGE_MANAGER_CONFIG[pm],
  };
}

/**
 * Builds a dependency installation command for the detected package manager.
 *
 * @param pm - Package manager command templates.
 * @param packages - Package names to install.
 * @param options - Install command options.
 * @returns A shell command string suitable for display or execution.
 *
 * @example
 * ```ts
 * getInstallCommand(pm, ['typescript'], { dev: true });
 * ```
 */
export function getInstallCommand(
  pm: PackageManagerResult,
  packages: string[],
  options?: { dev?: boolean }
): string {
  const pkgList = packages.join(" ");
  let devFlag = "";
  if (options?.dev) {
    devFlag = pm.name === "npm" ? "--save-dev" : "-D";
  }
  return `${pm.addCommand} ${devFlag} ${pkgList}`
    .trim()
    .replaceAll(/\s+/g, " ");
}

/**
 * Builds a package-script command for the detected package manager.
 *
 * @param pm - Package manager command templates.
 * @param script - Package script name to run.
 * @returns A shell command string.
 */
export function getRunCommand(
  pm: PackageManagerResult,
  script: string
): string {
  return `${pm.runCommand} ${script}`;
}

/**
 * Builds a one-off binary execution command for the detected package manager.
 *
 * @param pm - Package manager command templates.
 * @param binary - Binary name to execute.
 * @param args - Optional arguments appended after the binary name.
 * @returns A shell command string.
 */
export function getExecCommand(
  pm: PackageManagerResult,
  binary: string,
  args?: string[]
): string {
  const argString = args?.join(" ") || "";
  return `${pm.execCommand} ${binary} ${argString}`.trim();
}
