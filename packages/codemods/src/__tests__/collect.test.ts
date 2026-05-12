import { describe, expect, it } from "vitest";

import { collectSourceFiles } from "../collect";
import { withTempProject } from "../testing";

describe(collectSourceFiles, () => {
  it("collects source files and ignores generated directories", async () => {
    await withTempProject(
      {
        "README.md": "# ignored",
        "dist/index.js": "export const ignored = true;",
        "node_modules/pkg/index.ts": "export const ignored = true;",
        "src/app.ts": "export const app = true;",
        "src/app.tsx": "export const App = () => null;",
      },
      async (projectRoot) => {
        const files = await collectSourceFiles(projectRoot);

        expect(files).toHaveLength(2);
        expect(files.some((file) => file.endsWith("src/app.ts"))).toBeTruthy();
        expect(files.some((file) => file.endsWith("src/app.tsx"))).toBeTruthy();
      }
    );
  });
});
