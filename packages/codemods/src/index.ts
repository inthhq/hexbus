/**
 * Utilities for authoring, running, and testing Hexbus codemods.
 *
 * @remarks
 * The package owns the generic codemod harness: source collection, ts-morph
 * project creation, version-gated codemod definitions, interactive execution,
 * and fixture helpers for tests. Product CLIs provide the actual codemod
 * definitions.
 *
 * @packageDocumentation
 */

export {
	collectSourceFiles,
	createCodemodProject,
	DEFAULT_IGNORED_DIRS,
	DEFAULT_SUPPORTED_EXTENSIONS,
} from './collect';
export {
	defineCodemod,
	logCodemodResult,
	runCodemods,
} from './runner';
export {
	type FixtureTree,
	readFixtureFile,
	runAndAssert,
	withTempProject,
	writeFixtureTree,
} from './testing';
export type {
	CodemodDefinition,
	CodemodProject,
	CodemodRunOptions,
	CodemodRunResult,
	CodemodVersionMetadata,
	CollectOptions,
	RunCodemodsOptions,
} from './types';
export {
	isCodemodApplicableForVersion,
	satisfiesSimpleRange,
} from './versioning';
