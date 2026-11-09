/**
 * One naming scheme for every training unit shown to the athlete.
 *
 * The engines name sessions in many styles ("Siłownia: całe ciało A —
 * podstawy", "Własna technika z piłką", "Sprint — akceleracja").
 * The interface shows them as "Kategoria: akcent", short and concrete:
 *
 *   Sprint: przyspieszenie · Siła: całe ciało A · Bieg: spokojny ·
 *   Piłka: technika · Regeneracja · Mecz
 *
 * Stored titles stay as generated (the engines and older saved plans rely on
 * them); only the presentation is unified here, so old plans read the same.
 */

type Rule = readonly [RegExp, string | ((title: string) => string)];

/** Status titles that tell the athlete something happened; keep them. */
const STATUS = /wstrzyman|przełożon|zamienion|ograniczeni/i;

const RULES: readonly Rule[] = [
  // Days without own training.
  [/^(mecz\b|dzień meczowy|match\b)/i, "Mecz"],
  [/trening klubowy|^klub$|team training/i, "Trening klubowy"],
  [/^(odpoczynek|dzień wolny|wolne|rest)\b/i, "Dzień wolny"],
  [/aktywacj|primer mocy|gotowości meczowej/i, "Aktywacja przedmeczowa"],
  // Recovery and mobility.
  [/regenerac|prehab|kompensacyjn|md\+1/i, "Regeneracja"],
  [/mobilno/i, "Mobilność"],
  [/wyciszeni/i, "Wyciszenie"],
  // Running tests come before generic running.
  [/\btest\b/i, (t) => (/5\s*min/i.test(t) ? "Bieg: test 5 min" : "Bieg: test")],
  // Strength.
  [/masa ciała|masą ciała|bez sprzętu/i, "Siła: bez sprzętu"],
  [/w domu|sprzęt domowy|własny sprzęt/i, "Siła: w domu"],
  [/góra ciała|górn\S* (częś|parti)|siła górna|siła góry|wyciskani/i, "Siła: góra ciała"],
  [/podtrzym|utrzymani|deload|primer siłowy/i, "Siła: podtrzymanie"],
  [/(siła|siłownia).*(moc|power)|moc.*siłowni/i, "Siła: moc"],
  [/dolna|dolnych|dolnej|nóg|kończyn dolnych|przysiad/i, "Siła: nogi"],
  [/całe ciało\s*([AB])\b/i, (t) => `Siła: całe ciało ${/całe ciało\s*([AB])\b/i.exec(t)![1]}`],
  [/^(siła|siłownia|trening siłowy)|całe ciało/i, "Siła: całe ciało"],
  // Speed.
  [/zmian\w* kierunku|hamowani|zwinno|\bcod\b|zwrotno/i, "Sprint: zmiana kierunku"],
  [/po łuku/i, "Sprint: po łuku"],
  [/\brsa\b|powtarzaln\w* sprint/i, "Sprint: powtórzenia"],
  [/akcelerac\w* i prędko|przyspiesz\w* i prędko/i, "Sprint: przyspieszenie i prędkość"],
  [/prędko\S* maks|max velocity|wejście w prędkość/i, "Sprint: prędkość maksymalna"],
  [/technika biegu|skip|krótkie sprinty|ekspozycja szybko/i, "Sprint: technika biegu"],
  [
    /akcelerac|przyspiesz|pierwszy krok|acceleration|^sprint|^szybkoś|sesja szybko/i,
    "Sprint: przyspieszenie",
  ],
  // Running.
  [/interwał/i, "Bieg: interwały"],
  [/tempo/i, "Bieg: tempo"],
  [/bieg|tlenow|aerob|wytrzymało/i, "Bieg: spokojny"],
  // Football.
  [/bramkar/i, "Piłka: bramkarz"],
  [/napastnik|wykończeni/i, "Piłka: wykończenie"],
  [/pomocnik|orientacj/i, "Piłka: przyjęcie kierunkowe"],
  [/obrońc|podani/i, "Piłka: przyjęcie i podanie"],
  [/lekka technika/i, "Piłka: lekka technika"],
  [/piłk|technik|decyzj/i, "Piłka: technika"],
];

/** Suffixes added by later changes to a planned session. */
const LIGHTER = /\s*[—–-]\s*lżej\s*$/i;

export function unifiedSessionTitle(title: string): string {
  const raw = title.trim();
  if (!raw) return raw;
  if (STATUS.test(raw)) return raw;
  const lighter = LIGHTER.test(raw);
  const base = raw.replace(LIGHTER, "");
  for (const [pattern, name] of RULES) {
    if (pattern.test(base)) {
      const unified = typeof name === "string" ? name : name(base);
      return lighter ? `${unified} (lżej)` : unified;
    }
  }
  return raw;
}
