import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

/** Lovable regenerates its adapter. Keep the app's storage durable across edits. */
export function previewAuthStoragePlugin(): Plugin {
  const adapter = fileURLToPath(
    new URL("../src/lib/loadwise/previewSessionStorage.ts", import.meta.url),
  );
  return {
    name: "ballwise-preview-auth-storage",
    enforce: "pre",
    resolveId(source, importer) {
      if (
        source === "./previewAuthStorage" &&
        importer?.replaceAll("\\", "/").endsWith("/src/integrations/supabase/client.ts")
      )
        return adapter;
    },
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (
          output.type === "chunk" &&
          Object.keys(output.modules).some((id) =>
            id.replaceAll("\\", "/").endsWith("/src/integrations/supabase/previewAuthStorage.ts"),
          )
        )
          this.error(
            "Generated auth storage entered the runtime bundle. Check previewAuthStoragePlugin before releasing.",
          );
      }
    },
  };
}
