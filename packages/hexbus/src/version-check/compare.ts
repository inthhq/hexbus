function parseVersionParts(version: string): number[] {
	const coreVersion = version.replace(/^[^\d]*/, '').split('-')[0] ?? '';
	return coreVersion.split('.').map((part) => {
		const parsed = Number.parseInt(part.replace(/\D.*$/, ''), 10);
		return Number.isNaN(parsed) ? 0 : parsed;
	});
}

export function compareVersions(left: string, right: string): number {
	const leftParts = parseVersionParts(left);
	const rightParts = parseVersionParts(right);
	const length = Math.max(leftParts.length, rightParts.length);

	for (let index = 0; index < length; index++) {
		const leftValue = leftParts[index] ?? 0;
		const rightValue = rightParts[index] ?? 0;
		if (leftValue > rightValue) {
			return 1;
		}
		if (leftValue < rightValue) {
			return -1;
		}
	}

	return 0;
}
