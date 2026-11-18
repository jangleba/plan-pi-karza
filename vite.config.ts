import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Podgląd Lovable oczekuje serwera na porcie 8080 i hoście "::".
  server: { host: "::", port: 8080 },
  preview: { host: "::", port: 8080 },
  test: { include: ["src/**/*.test.ts"] },
});
