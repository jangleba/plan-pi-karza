import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

// Capacitor needs static files. This config intentionally stays separate from the regular
// Lovable/Nitro SSR build and emits a TanStack SPA shell to dist/client/index.html.
export default defineConfig({
  preview: { host: "127.0.0.1" },
  plugins: [
    tsConfigPaths(),
    tanstackStart({
      server: { entry: "server" },
      spa: {
        enabled: true,
        prerender: { outputPath: "/index.html" },
      },
    }),
    viteReact(),
    tailwindcss(),
  ],
});
