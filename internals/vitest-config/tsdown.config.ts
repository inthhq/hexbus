import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  dts: true,
  entry: ["./src/base-config.ts", "./src/ui-config.ts"],
  format: "esm",
  platform: "node",
});
