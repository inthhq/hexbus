import { describe, expect, it } from "vitest";

import { getSkillsRunnerCommand } from "../index";

describe(getSkillsRunnerCommand, () => {
  it("maps package managers to dlx-style commands", () => {
    expect(getSkillsRunnerCommand("bun")).toBe("bunx");
    expect(getSkillsRunnerCommand("pnpm")).toBe("pnpm dlx");
    expect(getSkillsRunnerCommand("yarn")).toBe("yarn dlx");
    expect(getSkillsRunnerCommand("npm")).toBe("npx");
  });

  it("defaults unknown package managers to npx", () => {
    expect(getSkillsRunnerCommand("unknown")).toBe("npx");
    expect(getSkillsRunnerCommand()).toBe("npx");
  });
});
