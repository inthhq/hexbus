import type { CliContext } from 'hexbus';
import type { Project, SourceFile } from 'ts-morph';

/**
 * Options used when collecting source files for a codemod project.
 */
export interface CollectOptions {
	/**
	 * File extensions included in collection.
	 *
	 * @default DEFAULT_SUPPORTED_EXTENSIONS
	 */
	extensions?: string[];
	/**
	 * Directory basenames skipped while walking the project tree.
	 *
	 * @default DEFAULT_IGNORED_DIRS
	 */
	ignoredDirs?: string[];
	/**
	 * Additional predicate for including or excluding matched files.
	 *
	 * @remarks
	 * The predicate receives absolute file paths after extension and ignored
	 * directory filtering.
	 */
	include?: (filePath: string) => boolean;
}

/**
 * Runtime options passed to an individual codemod.
 */
export interface CodemodRunOptions {
	/**
	 * Root directory of the project being migrated.
	 */
	projectRoot: string;
	/**
	 * When true, codemods should report changes without persisting them.
	 */
	dryRun?: boolean;
}

/**
 * Result returned by a codemod or codemod run.
 */
export interface CodemodRunResult {
	/**
	 * Files changed by the codemod.
	 */
	changedFiles: string[];
	/**
	 * Non-fatal errors encountered while running the codemod.
	 */
	errors: string[];
}

/**
 * Version constraints that decide when a codemod should be offered.
 */
export interface CodemodVersionMetadata {
	/**
	 * Range of installed versions this codemod can migrate from.
	 */
	fromRange?: string;
	/**
	 * Range of target versions this codemod is relevant to.
	 */
	toRange?: string;
}

/**
 * Defines a codemod that can be selected and executed by the codemod runner.
 *
 * @typeParam TContext - CLI context type required by the codemod.
 */
export interface CodemodDefinition<TContext extends CliContext = CliContext> {
	/**
	 * Stable codemod identifier used for selection and logging.
	 */
	id: string;
	/**
	 * Human-readable label shown in prompts and result output.
	 */
	label: string;
	/**
	 * Optional short hint shown in the interactive codemod selector.
	 */
	hint?: string;
	/**
	 * Optional installed-version constraints for deciding applicability.
	 */
	versioning?: CodemodVersionMetadata;
	/**
	 * Executes the codemod.
	 *
	 * @param context - Resolved CLI context for the current command.
	 * @param options - Project root and dry-run state.
	 * @returns Files changed and errors encountered.
	 */
	run(context: TContext, options: CodemodRunOptions): Promise<CodemodRunResult>;
}

/**
 * Options for the interactive codemod runner.
 */
export interface RunCodemodsOptions {
	/**
	 * Runs selected codemods without persisting changes.
	 */
	dryRun?: boolean;
	/**
	 * Product name used in version detection and no-op messages.
	 *
	 * @default "project"
	 */
	brandName?: string;
	/**
	 * Optional callback that reads the installed product version for a project.
	 */
	detectInstalledVersion?: (projectRoot: string) => Promise<string | null>;
}

/**
 * In-memory ts-morph project plus source files selected for a codemod.
 */
export interface CodemodProject {
	/**
	 * Underlying ts-morph project.
	 */
	project: Project;
	/**
	 * Source files added to the project.
	 */
	sourceFiles: SourceFile[];
	/**
	 * Persists project changes unless the project was created in dry-run mode.
	 */
	save(): Promise<void>;
}
