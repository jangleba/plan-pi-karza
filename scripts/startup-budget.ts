import type { Plugin } from "vite";

type Chunk = {
  type: "chunk";
  fileName: string;
  isEntry: boolean;
  imports: string[];
  modules: Record<string, unknown>;
};

/** Static imports are paid on startup; dynamic/worker imports are intentionally excluded. */
export function eagerGeneratorModules(bundle: Record<string, Chunk | { type: "asset" }>): string[] {
  const found = new Set<string>();
  const visited = new Set<string>();
  function visit(name: string) {
    if (visited.has(name)) return;
    visited.add(name);
    const chunk = bundle[name];
    if (!chunk || chunk.type !== "chunk") return;
    for (const id of Object.keys(chunk.modules))
      if (id.replaceAll("\\", "/").endsWith("/src/lib/loadwise/planEngine.ts")) found.add(id);
    chunk.imports.forEach(visit);
  }
  Object.values(bundle).forEach((chunk) => {
    if (chunk.type === "chunk" && chunk.isEntry) visit(chunk.fileName);
  });
  return [...found];
}

export function startupBudgetPlugin(): Plugin {
  return {
    name: "ballwise-startup-budget",
    apply: "build",
    generateBundle(_options, bundle) {
      if (this.environment.name !== "client") return;
      const generators = eagerGeneratorModules(bundle);
      if (generators.length)
        this.error(
          "Pełny generator planu wrócił do kodu startowego. Zachowaj import przez worker lub dynamiczny import: " +
            generators.join(", "),
        );
    },
  };
}
