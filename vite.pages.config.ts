import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: "github-pages-src",
  base: "/doubao-dance-game/",
  publicDir: "../public",
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname),
    },
  },
  build: {
    outDir: "../dist/pages",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        game: path.resolve(import.meta.dirname, "github-pages-src/index.html"),
        analytics: path.resolve(import.meta.dirname, "github-pages-src/analytics/index.html"),
      },
    },
  },
});
