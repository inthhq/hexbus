import { defineConfig } from "vitest/config";

/**
 * Shared Vitest base configuration for workspace packages.
 *
 * @remarks
 * The base config enables Istanbul coverage and writes text, JSON, JSON
 * summary, and HTML reports under each package's `coverage` directory.
 */
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
