import * as p from "@clack/prompts";
import type { CliContext } from "hexbus";

import type {
  CodemodDefinition,
  CodemodRunOptions,
  CodemodRunResult,
  RunCodemodsOptions,
} from "./types";
import { isCodemodApplicableForVersion } from "./versioning";

/**
 * Defines a codemod while preserving its generic context type.
 *
 * @typeParam TContext - CLI context type required by the codemod.
 * @param definition - Codemod metadata and implementation.
 * @returns The same definition, typed for downstream arrays and runners.
 *
 * @example
 * ```ts
 * const codemod = defineCodemod({
 *   id: 'rename-config',
 *   label: 'Rename config option',
 *   async run() {
 *     return { changedFiles: [], errors: [] };
 *   },
 * });
 * ```
 */
export function defineCodemod<TContext extends CliContext>(
  definition: CodemodDefinition<TContext>
): CodemodDefinition<TContext> {
  return definition;
}

/**
 * Logs a single codemod result in a consistent user-facing format.
 *
 * @param context - Context subset providing the logger.
 * @param label - Codemod label shown in output.
 * @param result - Codemod result to render.
 * @param dryRun - Whether changed files should be described as hypothetical.
 */
export function logCodemodResult(
  context: Pick<CliContext, "logger">,
  label: string,
  result: CodemodRunResult,
  dryRun = false
): void {
  const { logger } = context;
  const mode = dryRun ? "would change" : "changed";

  if (result.changedFiles.length === 0 && result.errors.length === 0) {
    logger.info(`${label}: no changes needed.`);
    return;
  }

  if (result.changedFiles.length > 0) {
    logger.success(
      `${label}: ${mode} ${result.changedFiles.length} file(s):\n${result.changedFiles
        .map((file) => `  - ${file}`)
        .join("\n")}`
    );
  }

  for (const error of result.errors) {
    logger.error(`${label}: ${error}`);
  }
}

async function chooseCodemods<TContext extends CliContext>(
  codemods: CodemodDefinition<TContext>[]
): Promise<CodemodDefinition<TContext>[]> {
  const selected = await p.multiselect({
    message: "Select codemods to run",
    options: codemods.map((codemod) => ({
      hint: codemod.hint,
      label: codemod.label,
      value: codemod.id,
    })),
    required: false,
  });

  if (p.isCancel(selected)) {
    return [];
  }

  const selectedIds = new Set(selected);
  return codemods.filter((codemod) => selectedIds.has(codemod.id));
}

/**
 * Filters, prompts for, and runs codemods against the current project.
 *
 * @remarks
 * Codemods are filtered by optional installed-version metadata before the
 * interactive prompt is shown. Each selected codemod runs independently; thrown
 * errors are captured into the combined result instead of aborting the whole
 * run.
 *
 * @typeParam TContext - CLI context type required by all codemods.
 * @param context - Resolved CLI context for the current project.
 * @param codemods - Codemods available to run.
 * @param options - Runner options such as dry-run mode and version detection.
 * @returns Combined changed files and errors from selected codemods.
 */
export async function runCodemods<TContext extends CliContext>(
  context: TContext,
  codemods: CodemodDefinition<TContext>[],
  options: RunCodemodsOptions = {}
): Promise<CodemodRunResult> {
  const brandName = options.brandName ?? "project";
  const installedVersion = options.detectInstalledVersion
    ? await options.detectInstalledVersion(context.projectRoot)
    : null;

  if (installedVersion) {
    context.logger.info(`Detected ${brandName} version ${installedVersion}.`);
  }

  const applicableCodemods = codemods.filter((codemod) =>
    isCodemodApplicableForVersion(installedVersion, codemod.versioning)
  );

  if (applicableCodemods.length === 0) {
    context.logger.info(`No codemods are applicable for ${brandName}.`);
    return { changedFiles: [], errors: [] };
  }

  const selectedCodemods = await chooseCodemods(applicableCodemods);
  const combined: CodemodRunResult = {
    changedFiles: [],
    errors: [],
  };
  const runOptions: CodemodRunOptions = {
    dryRun: options.dryRun,
    projectRoot: context.projectRoot,
  };

  for (const codemod of selectedCodemods) {
    let result: CodemodRunResult;
    try {
      result = await codemod.run(context, runOptions);
    } catch (error) {
      const message =
        error instanceof Error ? error.stack || error.message : String(error);
      result = {
        changedFiles: [],
        errors: [message],
      };
    }
    logCodemodResult(context, codemod.label, result, options.dryRun);
    combined.changedFiles.push(...result.changedFiles);
    combined.errors.push(...result.errors);
  }

  return combined;
}
