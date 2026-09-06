import { defineConfig } from "vite-plus";

export default defineConfig({
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
