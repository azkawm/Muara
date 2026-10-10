import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node24",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  // `node:sqlite` only exists with the prefix; tsup strips it by default.
  removeNodeProtocol: false,
  // Bundle the workspace package (shipped as TypeScript); keep npm dependencies external.
  noExternal: ["@muara/shared"],
});
