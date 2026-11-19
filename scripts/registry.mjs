// Generuje docs/REJESTR-LICENCJI.md z żywego rejestru src/legal/licenses.ts (wymaga Node ≥ 22.18 albo --experimental-strip-types).
import { writeFileSync } from "node:fs";
import { LICENSES } from "../src/legal/licenses.ts";

const esc = (s) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
const rows = LICENSES.map((l) => `| ${esc(l.name)} | ${esc(l.used)} | ${esc(l.license)} | ${l.attribution ? esc(l.attribution) : "–"} | ${l.status === "ok" ? "ustalone" : "**do ustalenia**"} | ${esc(l.note)} |`).join("\n");
const open = LICENSES.filter((l) => l.status !== "ok").map((l) => `- **${l.name}**: ${l.note}`).join("\n");
writeFileSync(new URL("../docs/REJESTR-LICENCJI.md", import.meta.url), `# Rejestr źródeł i licencji

Plik jest GENEROWANY z \`src/legal/licenses.ts\` (\`node scripts/registry.mjs\`). Nie edytuj ręcznie – zmieniaj rejestr w kodzie. Zależności npm: patrz \`docs/zaleznosci-licencje.md\` (generowane przez \`node scripts/licenses.mjs\`).

To rejestr roboczy, a NIE opinia prawna. Pozycje oznaczone „do ustalenia” wymagają sprawdzenia warunków przez operatora przed sprzedażą.

| Źródło | Do czego użyte | Licencja / warunki | Uznanie autorstwa w aplikacji | Status | Uwagi |
|---|---|---|---|---|---|
${rows}

## Pozycje do ustalenia przez operatora

${open}

## Zasady przyjęte w projekcie

- Licencja ODbL (Open Food Facts) dotyczy bazy danych i jej adaptacji, a nie kodu aplikacji; nie kopiujemy OFF do własnej współdzielonej bazy.
- Mixamo: nic nie jest usuwane automatycznie. Najpierw trzeba ustalić pochodzenie i warunki konkretnych plików (konto, data pobrania, zakres użycia komercyjnego).
- Publiczna dostępność strony, RSS ani robots.txt nie są licencją na wykorzystanie treści: źródła radaru są dopuszczane pojedynczo, z zapisaną podstawą.
`);
console.log("OK: docs/REJESTR-LICENCJI.md");
