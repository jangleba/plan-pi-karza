// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";
import { startupBudgetPlugin } from "./scripts/startup-budget";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    // Start deliberately leaves its router unbundled for environment transforms.
    // Prebundle only the pure serializer dependencies it otherwise serves raw in preview.
    optimizeDeps: { include: ["seroval", "seroval-plugins/web"] },
    server: {
      warmup: {
        clientFiles: [
          "./src/router.tsx",
          "./src/routes/__root.tsx",
          "./src/routes/_tabs.start.tsx",
          "./src/routes/_tabs.plan.tsx",
          "./src/routes/_tabs.fuel.tsx",
          "./src/routes/_tabs.postep.tsx",
          "./src/routes/_tabs.football-iq.tsx",
          "./src/routes/_tabs.profil.tsx",
          "./src/routes/sesja.$date.tsx",
          "./src/routes/_tabs.lab.tsx",
          "./src/routes/reakcja.tsx",
        ],
      },
    },
    plugins: [mcpPlugin(), startupBudgetPlugin()],
  },
});
