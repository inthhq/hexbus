import * as fsSync from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { InstallSource } from "./types";

function normalizePath(filePath: string): string {
  return filePath.replaceAll("\\", "/");
}

function expandHomePrefix(prefix: string): string {
  if (!prefix.startsWith("~/")) {
    return prefix;
  }
  return path.join(os.homedir(), prefix.slice(2));
}

function safeRealpath(filePath: string): string {
  try {
    return fsSync.realpathSync(filePath);
  } catch {
    return filePath;
  }
}

function isPathUnder(candidate: string, parent: string): boolean {
  const normalizedCandidate = normalizePath(path.resolve(candidate));
  const normalizedParent = normalizePath(
    path.resolve(expandHomePrefix(parent))
  );
  return (
    normalizedCandidate === normalizedParent ||
    normalizedCandidate.startsWith(`${normalizedParent}/`)
  );
}

function envValue(name: string): string | undefined {
  return process.env[name];
}

/**
 * Infers how the current CLI binary was installed.
 *
 * @remarks
 * Detection is heuristic and based on binary path, realpath, and package
 * manager environment variables. Unknown or transient install modes return
 * `unknown` instead of throwing.
 *
 * @param binPath - Binary path to inspect.
 * @returns The inferred installation source.
 */
export function detectInstallSource(
  binPath = process.argv[1] ?? ""
): InstallSource {
  const rawPath = binPath || "";
  const resolvedPath = normalizePath(safeRealpath(rawPath));
  const npmPrefix = envValue("npm_config_prefix");
  const execPath = normalizePath(process.execPath);
  const argvPath = normalizePath(process.argv[0] ?? "");
  const execName = path.basename(execPath);
  const argvName = path.basename(argvPath);
  const isBunInvocation =
    execName === "bun" ||
    execName === "bunx" ||
    argvName === "bun" ||
    argvName === "bunx";

  if (
    resolvedPath.includes("/opt/homebrew/") ||
    resolvedPath.includes("/usr/local/Cellar/") ||
    resolvedPath.includes("/home/linuxbrew/") ||
    resolvedPath.includes("/Homebrew/Cellar/")
  ) {
    return "brew";
  }

  if (
    resolvedPath.includes("/.npm/_npx/") ||
    resolvedPath.includes("/_npx/") ||
    process.env.npm_command === "exec"
  ) {
    return "npx";
  }

  if (
    resolvedPath.includes("/.bun/install/cache/") ||
    (Boolean(envValue("BUN_INSTALL")) &&
      (resolvedPath.includes("/.bun/install/run/") || isBunInvocation))
  ) {
    return "bunx";
  }

  if (
    resolvedPath.includes("/.pnpm-store/") ||
    resolvedPath.includes("/dlx-")
  ) {
    return "pnpm-dlx";
  }

  if (
    resolvedPath.includes("/.yarn/berry/cache/") ||
    resolvedPath.includes("/yarn/dlx-")
  ) {
    return "yarn-dlx";
  }

  if (
    resolvedPath.includes("/node_modules/.bin/") ||
    resolvedPath.endsWith("/node_modules/.bin")
  ) {
    return "local";
  }

  const npmGlobalPrefixes = [
    "/usr/local/lib/node_modules",
    "~/.npm-global/lib/node_modules",
    "~/.nvm/versions/node",
    process.env.APPDATA ? `${process.env.APPDATA}/npm/node_modules` : null,
    npmPrefix ? `${npmPrefix}/lib/node_modules` : null,
  ].filter((item): item is string => typeof item === "string");

  if (
    npmGlobalPrefixes.some((prefix) => {
      const expandedPrefix = expandHomePrefix(prefix);
      if (prefix.endsWith("/node")) {
        return (
          resolvedPath.includes("/.nvm/versions/node/") &&
          resolvedPath.includes("/lib/node_modules/")
        );
      }
      return isPathUnder(resolvedPath, expandedPrefix);
    })
  ) {
    return "npm-global";
  }

  return "unknown";
}

/**
 * Builds an update command for an installation source.
 *
 * @param source - Installation source returned by `detectInstallSource`.
 * @param packageName - Package name to update.
 * @param brewFormula - Homebrew formula name when `source` is `brew`.
 * @returns A command string when the source has an actionable update path,
 * otherwise `null`.
 */
export function getUpdateCommand(
  source: InstallSource,
  packageName: string,
  brewFormula = packageName
): string | null {
  switch (source) {
    case "npm-global": {
      return `npm install -g ${packageName}@latest`;
    }
    case "brew": {
      return `brew upgrade ${brewFormula}`;
    }
    case "local": {
      return `npm install ${packageName}@latest`;
    }
    default: {
      return null;
    }
  }
}
