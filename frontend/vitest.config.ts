import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests for the pure parts of the frontend (src/lib/**/__tests__). The Next.js pages are checked
// by tsc, eslint, next build and the browser walk, not here.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["src/**/__tests__/**/*.test.ts"], environment: "node" },
});
