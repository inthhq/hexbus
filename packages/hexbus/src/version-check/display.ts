import { checkForUpdate, createUpdateCheckResult } from "./check";
import { isCacheFresh, readCachedVersion, refreshCache } from "./registry";
import type { VersionInfoLogger, VersionInfoOptions } from "./types";

const defaultLogger: VersionInfoLogger = {
  message(message: string) {
    process.stdout.write(`${message}\n`);
  },
  note(content: string, title?: string) {
    const prefix = title ? `${title}\n` : "";
    process.stdout.write(`${prefix}${content}\n`);
  },
};

/**
 * Prints CLI version information and any available update hint.
 *
 * @param options - Version display and update-check options.
 */
export async function printVersionInfo(
  options: VersionInfoOptions
): Promise<void> {
  const logger = options.logger ?? defaultLogger;
  logger.message(`${options.appName} v${options.currentVersion}`);

  const result = await checkForUpdate(options);
  if (result.hint) {
    logger.note(result.hint, "Update available");
  }
}

/**
 * Starts a non-blocking update check.
 *
 * @remarks
 * Cached hints are displayed synchronously when available. If the cache is
 * stale or missing, a refresh is started in the background and failures are
 * only logged at debug level.
 *
 * @param options - Version display and update-check options.
 */
export function startBackgroundUpdateCheck(options: VersionInfoOptions): void {
  const logger = options.logger ?? defaultLogger;
  const cached = readCachedVersion(options);

  if (cached) {
    const result = createUpdateCheckResult(options, cached.version);
    if (result.hint) {
      logger.note(result.hint, "Update available");
    }
  }

  if (cached && isCacheFresh(cached, options)) {
    return;
  }

  void refreshCache(options).catch((error: unknown) => {
    logger.debug?.(
      `Update check failed: ${error instanceof Error ? error.message : String(error)}`
    );
  });
}
