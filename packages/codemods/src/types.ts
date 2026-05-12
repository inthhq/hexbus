import type { CliContext } from 'hexbus';
import type { Project, SourceFile } from 'ts-morph';

export interface CollectOptions {
	extensions?: string[];
	ignoredDirs?: string[];
	include?: (filePath: string) => boolean;
}

export interface CodemodRunOptions {
	projectRoot: string;
	dryRun?: boolean;
}

export interface CodemodRunResult {
	changedFiles: string[];
	errors: string[];
}

export interface CodemodVersionMetadata {
	fromRange?: string;
	toRange?: string;
}

export interface CodemodDefinition<TContext extends CliContext = CliContext> {
	id: string;
	label: string;
	hint?: string;
	versioning?: CodemodVersionMetadata;
	run(context: TContext, options: CodemodRunOptions): Promise<CodemodRunResult>;
}

export interface RunCodemodsOptions {
	dryRun?: boolean;
	brandName?: string;
	detectInstalledVersion?: (projectRoot: string) => Promise<string | null>;
}

export interface CodemodProject {
	project: Project;
	sourceFiles: SourceFile[];
	save(): Promise<void>;
}
