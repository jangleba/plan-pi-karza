/** robots.txt (RFC 9309): grupa dla naszego agenta albo „*”, najdłuższa reguła wygrywa, Allow przy remisie. */
export const BOT_TOKEN = "ballwiseradar";

interface Group { agents: string[]; rules: Array<{ allow: boolean; path: string }>; delay: number | null }

function parse(txt: string): Group[] {
  const groups: Group[] = [];
  let cur: Group | null = null, lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const i = line.indexOf(":");
    if (i < 0) continue;
    const key = line.slice(0, i).trim().toLowerCase(), val = line.slice(i + 1).trim();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [], delay: null }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (key === "allow" || key === "disallow") { if (val) cur.rules.push({ allow: key === "allow", path: val }); }
    else if (key === "crawl-delay") { const d = Number(val); if (Number.isFinite(d) && d >= 0) cur.delay = d; }
  }
  return groups;
}

function groupFor(groups: Group[]): Group | null {
  return groups.find((g) => g.agents.some((a) => a !== "*" && BOT_TOKEN.includes(a) && a.length > 2))
    ?? groups.find((g) => g.agents.includes("*")) ?? null;
}

function matches(pattern: string, path: string): number {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const re = new RegExp("^" + body.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + (anchored ? "$" : ""));
  return re.test(path) ? body.replace(/\*/g, "").length + 1 : -1;
}

/** Czy wolno pobrać ścieżkę (z zapytaniem). Brak pliku/reguł = wolno. */
export function robotsAllows(txt: string | null, path: string): boolean {
  if (txt === null) return true;
  const g = groupFor(parse(txt));
  if (!g) return true;
  let best = -1, allow = true;
  for (const r of g.rules) {
    const score = matches(r.path, path);
    if (score > best || (score === best && r.allow)) { best = score; allow = r.allow; }
  }
  return best < 0 ? true : allow;
}

export function robotsCrawlDelay(txt: string | null): number | null {
  if (txt === null) return null;
  return groupFor(parse(txt))?.delay ?? null;
}

/** Interpretacja odpowiedzi na żądanie robots.txt: 2xx treść, 4xx brak ograniczeń, 5xx/błąd = ostrożnie nie pobieramy. */
export function robotsFromResponse(status: number, body: string | null): { txt: string | null; blockAll: boolean } {
  if (status >= 200 && status < 300) return { txt: body ?? "", blockAll: false };
  if (status >= 400 && status < 500) return { txt: null, blockAll: false };
  return { txt: null, blockAll: true };
}
