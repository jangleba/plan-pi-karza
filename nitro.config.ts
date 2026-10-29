import { defineConfig } from "nitro/config";

// Match the runtime shipped with the pinned Wrangler dependency. Letting Nitro
// use the build date makes the same lockfile stop previewing as time passes.
export default defineConfig({ compatibilityDate: "2026-09-18" });
