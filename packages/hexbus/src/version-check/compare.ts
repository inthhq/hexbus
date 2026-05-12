interface ParsedVersion {
  parts: number[];
  prerelease: string | undefined;
}

function parseVersionParts(version: string): ParsedVersion {
  const [coreVersion = "", prerelease] = version
    .replace(/^[^\d]*/, "")
    .split("-", 2);
  const parts = coreVersion.split(".").map((part) => {
    const parsed = Number.parseInt(part.replace(/\D.*$/, ""), 10);
    return Number.isNaN(parsed) ? 0 : parsed;
  });
  return { parts, prerelease };
}

function comparePrereleaseIdentifiers(left: string, right: string): number {
  const leftIsNumeric = /^\d+$/.test(left);
  const rightIsNumeric = /^\d+$/.test(right);

  if (leftIsNumeric && rightIsNumeric) {
    const leftValue = Number.parseInt(left, 10);
    const rightValue = Number.parseInt(right, 10);
    return Math.sign(leftValue - rightValue);
  }

  if (leftIsNumeric) {
    return -1;
  }
  if (rightIsNumeric) {
    return 1;
  }

  return Math.sign(left.localeCompare(right));
}

function comparePrerelease(
  left: string | undefined,
  right: string | undefined
): number {
  if (!left && !right) {
    return 0;
  }
  if (!left) {
    return 1;
  }
  if (!right) {
    return -1;
  }

  const leftParts = left.split(".");
  const rightParts = right.split(".");
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index++) {
    const leftValue = leftParts[index];
    const rightValue = rightParts[index];
    if (leftValue === undefined) {
      return -1;
    }
    if (rightValue === undefined) {
      return 1;
    }

    const result = comparePrereleaseIdentifiers(leftValue, rightValue);
    if (result !== 0) {
      return result;
    }
  }

  return 0;
}

export function compareVersions(left: string, right: string): number {
  const leftVersion = parseVersionParts(left);
  const rightVersion = parseVersionParts(right);
  const leftParts = leftVersion.parts;
  const rightParts = rightVersion.parts;
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

  return comparePrerelease(leftVersion.prerelease, rightVersion.prerelease);
}
