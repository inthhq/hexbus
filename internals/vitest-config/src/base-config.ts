import { defineConfig } from "vitest/config";

export const baseConfig = defineConfig({
  test: {
    coverage: {
      enabled: true,
      include: [
        "**/*.{ts,tsx,js,jsx}",
        "!**/*.d.ts",
        "!**/node_modules/**",
        "!**/dist/**",
        "!**/dist-types/**",
        "!**/coverage/**",
      ],
      provider: "istanbul",
      reportOnFailure: true,
      reporter: [
        "text",
        [
          "json-summary",
          {
            file: "coverage-summary.json",
          },
        ],
        [
          "json",
          {
            file: "coverage-final.json",
          },
        ],
        [
          "html",
          {
            subdir: "html",
          },
        ],
      ],
      reportsDirectory: "./coverage",
    },
  },
});
