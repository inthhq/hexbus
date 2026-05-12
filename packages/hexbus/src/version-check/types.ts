import type { CliLogger } from "../types";

/**
 * Installation source inferred from the running binary path and package manager
 * environment.
 */
export type InstallSource =
  | "npm-global"
  | "brew"
  | "npx"
  | "bunx"
  | "pnpm-dlx"
  | "yarn-dlx"
  | "local"
  | "unknown";

/**
 * Result returned by an update check.
 */
export interface UpdateCheckResult {
  /**
   * Version currently running.
   */
  currentVersion: string;
  /**
   * Latest version fetched from the registry or cache, or `null` when lookup
   * failed.
   */
  latestVersion: string | null;
  /**
   * Whether `latestVersion` is newer than `currentVersion`.
   *
   * @remarks
   * This is `false` when `latestVersion` is `null` due to lookup failure.
   * Callers can check `latestVersion === null` to distinguish lookup failure
   * from an up-to-date package.
   */
  isOutdated: boolean;
  /**
   * Detected installation source for the current binary.
   */
  source: InstallSource;
  /**
   * Update command appropriate for the detected source, when Hexbus can infer
   * one.
   */
  updateCommand: string | null;
  /**
   * User-facing update hint, or `null` when no actionable update is available.
   */
  hint: string | null;
}

/**
 * Options for checking package registry state and update hints.
 */
export interface UpdateCheckOptions {
  /**
   * Published package name to query.
   */
  packageName: string;
  /**
   * Version currently running.
   */
  currentVersion: string;
  /**
   * Homebrew formula name used for Homebrew update hints.
   *
   * @default packageName
   */
  brewFormula?: string;
  /**
   * Registry base URL used to fetch latest package metadata.
   *
   * @default "https://registry.npmjs.org"
   */
  registryUrl?: string;
  /**
   * Maximum registry request duration in milliseconds.
   *
   * @default 1500
   */
  timeoutMs?: number;
  /**
   * Directory where latest-version cache files are stored.
   *
   * @default path.join(os.tmpdir(), "hexbus-version-cache")
   */
  cacheDir?: string;
  /**
   * How long cached latest-version data stays fresh.
   *
   * @default 86400000
   */
  cacheTtlMs?: number;
  /**
   * Binary path used for installation-source detection.
   *
   * @default process.argv[1]
   */
  binPath?: string;
  /**
   * Optional logger used for debug output when update checks fail.
   */
  logger?: VersionInfoLogger;
  /**
   * Clock override used by tests and deterministic callers.
   *
   * @default Date.now
   */
  now?: () => number;
}

export type VersionInfoLogger = Pick<CliLogger, "message" | "note"> &
  Partial<Pick<CliLogger, "debug">>;

/**
 * Options for printing or background-checking CLI version information.
 */
export interface VersionInfoOptions extends UpdateCheckOptions {
  /**
   * Application name shown in version output.
   */
  appName: string;
}

export interface CachedVersion {
  version: string;
  fetchedAt: number;
}
