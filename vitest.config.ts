import { defineConfig } from "vitest/config";

// Testy jednostkowe silnika – bez wtyczek podglądu Lovable.
export default defineConfig({
  test: { include: ["src/**/*.test.ts"] },
});
