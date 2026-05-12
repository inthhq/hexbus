import * as p from '@clack/prompts';
import type { CliContext } from 'hexbus';
import type {
	CodemodDefinition,
	CodemodRunOptions,
	CodemodRunResult,
	RunCodemodsOptions,
} from './types';
import { isCodemodApplicableForVersion } from './versioning';

export function defineCodemod<TContext extends CliContext>(
	definition: CodemodDefinition<TContext>
): CodemodDefinition<TContext> {
	return definition;
}

export function logCodemodResult(
	context: Pick<CliContext, 'logger'>,
	label: string,
	result: CodemodRunResult,
	dryRun = false
): void {
	const { logger } = context;
	const mode = dryRun ? 'would change' : 'changed';

	if (result.changedFiles.length === 0 && result.errors.length === 0) {
		logger.info(`${label}: no changes needed.`);
		return;
	}

	if (result.changedFiles.length > 0) {
		logger.success(
			`${label}: ${mode} ${result.changedFiles.length} file(s):\n${result.changedFiles
				.map((file) => `  - ${file}`)
				.join('\n')}`
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
		message: 'Select codemods to run',
		options: codemods.map((codemod) => ({
			value: codemod.id,
			label: codemod.label,
			hint: codemod.hint,
		})),
		required: false,
	});

	if (p.isCancel(selected)) {
		return [];
	}

	const selectedIds = new Set(selected);
	return codemods.filter((codemod) => selectedIds.has(codemod.id));
}

export async function runCodemods<TContext extends CliContext>(
	context: TContext,
	codemods: CodemodDefinition<TContext>[],
	options: RunCodemodsOptions = {}
): Promise<CodemodRunResult> {
	const brandName = options.brandName ?? 'project';
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
		projectRoot: context.projectRoot,
		dryRun: options.dryRun,
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
