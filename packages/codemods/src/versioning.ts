import type { CodemodVersionMetadata } from './types';

function parseVersion(version: string): [number, number, number] {
	const [major = '0', minor = '0', patch = '0'] = version
		.replace(/^[^\d]*/, '')
		.split('.');
	return [
		Number.parseInt(major, 10) || 0,
		Number.parseInt(minor, 10) || 0,
		Number.parseInt(patch, 10) || 0,
	];
}

function compareVersions(a: string, b: string): number {
	const left = parseVersion(a);
	const right = parseVersion(b);

	for (let index = 0; index < 3; index++) {
		const leftPart = left[index] ?? 0;
		const rightPart = right[index] ?? 0;
		if (leftPart > rightPart) {
			return 1;
		}
		if (leftPart < rightPart) {
			return -1;
		}
	}

	return 0;
}

function satisfiesComparator(version: string, comparator: string): boolean {
	const match = comparator
		.trim()
		.match(/^(>=|>|<=|<|=|\^|~)?\s*(\d+\.\d+\.\d+)$/);
	if (!match) {
		return true;
	}

	const operator = match[1] ?? '=';
	const target = match[2] ?? '0.0.0';
	const comparison = compareVersions(version, target);

	switch (operator) {
		case '>=':
			return comparison >= 0;
		case '>':
			return comparison > 0;
		case '<=':
			return comparison <= 0;
		case '<':
			return comparison < 0;
		case '^': {
			const [major] = parseVersion(target);
			const upperBound = `${major + 1}.0.0`;
			return comparison >= 0 && compareVersions(version, upperBound) < 0;
		}
		case '~': {
			const [major, minor] = parseVersion(target);
			const upperBound = `${major}.${minor + 1}.0`;
			return comparison >= 0 && compareVersions(version, upperBound) < 0;
		}
		default:
			return comparison === 0;
	}
}

export function satisfiesSimpleRange(version: string, range?: string): boolean {
	if (!range) {
		return true;
	}

	return range
		.split(/\s+/)
		.filter(Boolean)
		.every((comparator) => satisfiesComparator(version, comparator));
}

export function isCodemodApplicableForVersion(
	installedVersion: string | null,
	versioning?: CodemodVersionMetadata
): boolean {
	if (!versioning || !installedVersion) {
		return true;
	}

	if (versioning.fromRange) {
		return satisfiesSimpleRange(installedVersion, versioning.fromRange);
	}

	return true;
}
