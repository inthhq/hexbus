import { describe, expect, it } from "vitest";

import { createColors, detectColorSupport } from "../color";

describe("color", () => {
  it("formats enabled colors with ansi escapes", () => {
    const color = createColors(true);

    expect(color.green("ready")).toBe("\u001B[32mready\u001B[39m");
    expect(color.bgRed(color.black(" error "))).toBe(
      "\u001B[41m\u001B[30m error \u001B[39m\u001B[49m"
    );
  });

  it("reopens styles when the input contains a nested close code", () => {
    const color = createColors(true);
    const nested = `one ${color.green("two")} three`;

    expect(color.green(nested)).toBe(
      "\u001B[32mone \u001B[32mtwo\u001B[32m three\u001B[39m"
    );
  });

  it("returns plain strings when colors are disabled", () => {
    const color = createColors(false);

    expect(color.green("ready")).toBe("ready");
    expect(color.bgRed(color.black(" error "))).toBe(" error ");
  });
});

describe(detectColorSupport, () => {
  it("supports forced color without a tty", () => {
    expect(
      detectColorSupport({
        argv: [],
        env: { FORCE_COLOR: "1" },
        platform: "linux",
        stdout: { isTTY: false },
      })
    ).toBeTruthy();
  });

  it("disables forced color when FORCE_COLOR is zero", () => {
    expect(
      detectColorSupport({
        argv: [],
        env: { FORCE_COLOR: "0" },
        platform: "linux",
        stdout: { isTTY: true },
      })
    ).toBeFalsy();
  });

  it("supports color in ci without a tty", () => {
    expect(
      detectColorSupport({
        argv: [],
        env: { CI: "true" },
        platform: "linux",
        stdout: { isTTY: false },
      })
    ).toBeTruthy();
  });

  it("disables color when no-color is requested", () => {
    expect(
      detectColorSupport({
        argv: ["--no-color"],
        env: { FORCE_COLOR: "1" },
        platform: "linux",
        stdout: { isTTY: true },
      })
    ).toBeFalsy();
  });

  it("supports color when NO_COLOR is present but empty", () => {
    expect(
      detectColorSupport({
        argv: [],
        env: { NO_COLOR: "" },
        platform: "linux",
        stdout: { isTTY: true },
      })
    ).toBeTruthy();
  });

  it("disables color for dumb terminals", () => {
    expect(
      detectColorSupport({
        argv: [],
        env: { TERM: "dumb" },
        platform: "linux",
        stdout: { isTTY: true },
      })
    ).toBeFalsy();
  });
});
