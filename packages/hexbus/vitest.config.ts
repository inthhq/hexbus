import { resolve } from "node:path";

import { baseConfig } from "@inth/vitest-config/base";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    resolve: {
      alias: {
        "~": resolve(__dirname, "./src"),
      },
    },
  })
);
