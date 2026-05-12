import type { CodemodVersionMetadata } from "./types";

function parseVersion(version: string): [number, number, number] {
  const [major = "0", minor = "0", patch = "0"] = version
    .replace(/^[^\d]*/, "")
    .split(".");
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
  const trimmedComparator = comparator.trim();
  const match = trimmedComparator.match(
    /^(>=|>|<=|<|=|\^|~)?\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?$/
  );
  if (!match) {
    throw new Error(
      `Invalid version comparator "${trimmedComparator}" for version "${version}".`
    );
  }

  const operator = match[1] ?? "=";
  const major = Number.parseInt(match[2] ?? "0", 10) || 0;
  const minorProvided = match[3] !== undefined;
  const minor = Number.parseInt(match[3] ?? "0", 10) || 0;
  const patchProvided = match[4] !== undefined;
  const patch = Number.parseInt(match[4] ?? "0", 10) || 0;
  const target = `${major}.${minor}.${patch}`;
  const comparison = compareVersions(version, target);

  switch (operator) {
    case ">=": {
      return comparison >= 0;
    }
    case ">": {
      return comparison > 0;
    }
    case "<=": {
      return comparison <= 0;
    }
    case "<": {
      return comparison < 0;
    }
    case "^": {
      let upperBound: string;
      if (major > 0 || !minorProvided) {
        upperBound = `${major + 1}.0.0`;
      } else if (minor > 0 || !patchProvided) {
        upperBound = `0.${minor + 1}.0`;
      } else {
        upperBound = `0.0.${patch + 1}`;
      }
      return comparison >= 0 && compareVersions(version, upperBound) < 0;
    }
    case "~": {
      const upperBound = minorProvided
        ? `${major}.${minor + 1}.0`
        : `${major + 1}.0.0`;
      return comparison >= 0 && compareVersions(version, upperBound) < 0;
    }
    default: {
      return comparison === 0;
    }
  }
}

/**
 * Checks whether a version satisfies a whitespace-delimited comparator range.
 *
 * @remarks
 * This intentionally supports only simple comparators used by codemod metadata:
 * `>`, `>=`, `<`, `<=`, `=`, `^`, and `~`. It is not a full semver parser.
 *
 * @param version - Installed version to test.
 * @param range - Optional comparator range. Missing ranges always match.
 * @returns `true` when every comparator in the range matches.
 *
 * @throws When a comparator cannot be parsed.
 */
export function satisfiesSimpleRange(version: string, range?: string): boolean {
  if (!range) {
    return true;
  }

  return range
    .split(/\s+/)
    .filter(Boolean)
    .every((comparator) => satisfiesComparator(version, comparator));
}

/**
 * Determines whether a codemod should be offered for an installed version.
 *
 * @remarks
 * Codemods without version metadata always apply. When the installed version is
 * unknown, the codemod is treated as applicable so users can still opt in.
 *
 * @param installedVersion - Detected installed product version, or `null`.
 * @param versioning - Optional codemod version constraints.
 * @returns `true` when the codemod should be shown to the user.
 */
export function isCodemodApplicableForVersion(
  installedVersion: string | null,
  versioning?: CodemodVersionMetadata
): boolean {
  if (!versioning || !installedVersion) {
    return true;
  }

  if (
    versioning.fromRange &&
    !satisfiesSimpleRange(installedVersion, versioning.fromRange)
  ) {
    return false;
  }

  if (
    versioning.toRange &&
    !satisfiesSimpleRange(installedVersion, versioning.toRange)
  ) {
    return false;
  }

  return true;
}
