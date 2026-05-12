import { describe, expect, it } from "vitest";

import {
  isCodemodApplicableForVersion,
  satisfiesSimpleRange,
} from "../versioning";

describe("versioning", () => {
  it("checks simple comparator ranges", () => {
    expect(satisfiesSimpleRange("1.2.3", ">=1.0.0 <2.0.0")).toBeTruthy();
    expect(satisfiesSimpleRange("2.0.0", ">=1.0.0 <2.0.0")).toBeFalsy();
  });

  it("checks caret and tilde ranges", () => {
    expect(satisfiesSimpleRange("1.5.0", "^1.2.0")).toBeTruthy();
    expect(satisfiesSimpleRange("2.0.0", "^1.2.0")).toBeFalsy();
    expect(satisfiesSimpleRange("1.2.9", "~1.2.0")).toBeTruthy();
    expect(satisfiesSimpleRange("1.3.0", "~1.2.0")).toBeFalsy();
  });

  it("throws on malformed comparators", () => {
    expect(() => satisfiesSimpleRange("1.0.0", ">=1.0.O")).toThrow(
      'Invalid version comparator ">=1.0.O" for version "1.0.0".'
    );
  });

  it("treats missing version metadata as applicable", () => {
    expect(isCodemodApplicableForVersion(null)).toBeTruthy();
    expect(isCodemodApplicableForVersion("1.0.0")).toBeTruthy();
  });
});
