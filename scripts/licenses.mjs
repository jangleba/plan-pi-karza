// Generuje zestawienie licencji bezpośrednich zależności: node scripts/licenses.mjs > docs/zaleznosci-licencje.md
import { readFileSync } from "node:fs";
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const rows = [];
for (const [section, deps] of [["dependencies", pkg.dependencies], ["devDependencies", pkg.devDependencies]]) {
  for (const name of Object.keys(deps ?? {}).sort()) {
    let lic = "?", ver = deps[name];
    try { const p = JSON.parse(readFileSync(`node_modules/${name}/package.json`, "utf8")); lic = typeof p.license === "string" ? p.license : p.license?.type ?? (p.licenses ? p.licenses.map((l) => l.type).join(" OR ") : "?"); ver = p.version; } catch { /* brak pakietu */ }
    rows.push(`| ${name} | ${ver} | ${lic} | ${section === "dependencies" ? "uruchomieniowa" : "narzędziowa"} |`);
  }
}
console.log(`# Zależności i ich licencje (wygenerowano ${new Date().toISOString().slice(0, 10)})\n\nŹródło: pola \`license\` w package.json zainstalowanych pakietów (bezpośrednie zależności). Zależności pośrednie: \`npx license-checker\` (nie dodano do projektu).\n\n| Pakiet | Wersja | Licencja | Rodzaj |\n|---|---|---|---|\n${rows.join("\n")}\n`);
