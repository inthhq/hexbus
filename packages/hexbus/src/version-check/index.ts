export {
	checkForUpdate,
	formatUpdateHint,
	isVersionRequest,
} from './check';
export { printVersionInfo, startBackgroundUpdateCheck } from './display';
export { detectInstallSource, getUpdateCommand } from './install-source';
export type {
	InstallSource,
	UpdateCheckOptions,
	UpdateCheckResult,
	VersionInfoOptions,
} from './types';
