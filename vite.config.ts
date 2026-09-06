import { copyFileSync } from "node:fs";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [
    {
      name: "copy-obsidian-entrypoint",
      closeBundle() {
        copyFileSync("dist/main.js", "main.js");
      },
    },
  ],
  build: {
    target: "es2021",
    lib: {
      entry: "src/main.ts",
      fileName: () => "main.js",
      formats: ["cjs"],
    },
    emptyOutDir: true,
    outDir: "dist",
    rollupOptions: {
      external: ["obsidian"],
    },
    sourcemap: false,
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
