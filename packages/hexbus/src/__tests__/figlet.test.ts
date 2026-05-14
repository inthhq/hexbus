import { describe, expect, it } from "vitest";

import { figlet, renderFiglet } from "../figlet";

describe(renderFiglet, () => {
  it("renders text through the bundled figlet dependency", async () => {
    const rendered = await renderFiglet("hex");

    expect(rendered).not.toBe("hex");
    expect(rendered).toContain("_");
  });

  it("exports the bundled figlet implementation", () => {
    expect(typeof figlet).toBe("function");
    expect(typeof figlet.textSync).toBe("function");
  });
});
