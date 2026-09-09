/**
 * Deterministyczny parser opisu posiłku w języku polskim.
 * Słownik + reguły. Bez gramów, kalorii, AI i losowości.
 */

import type { FoodRole, ParsedFoodItem, ParsedMeal } from "./types";

interface Entry {
  key: string;
  label: string;
  roles: FoodRole[];
  heaviness: number;
  match: RegExp;
}

/** Kolejność ma znaczenie: bardziej szczegółowe wzorce najpierw. */
const DICTIONARY: Entry[] = [
  // fast food / smażone
  { key: "fastfood", label: "fast food", roles: ["fat", "protein"], heaviness: 4, match: /\b(burger|hamburger|cheeseburger|kebab|pizza|frytk\w*|nugget\w*|hot ?dog)\b/ },
  { key: "fried", label: "smażone danie", roles: ["fat"], heaviness: 4, match: /\b(smażon\w+|panierowan\w+|schabow\w+|placki ziemniaczane)\b/ },
  { key: "fatty_sauce", label: "tłusty sos", roles: ["fat"], heaviness: 3, match: /\b(majonez\w*|sos czosnkow\w*|sos serow\w*|śmietan\w*|masł\w+)\b/ },
  // pieczywo i skrobia
  { key: "bread", label: "pieczywo", roles: ["carb_slow"], heaviness: 1, match: /\b(chleb\w*|tost\w*|bułk\w*|kanapk\w*|bagietk\w*|pieczyw\w*|wrap\w*|tortill\w*)\b/ },
  { key: "rice", label: "ryż", roles: ["carb_slow"], heaviness: 1, match: /\bryż\w*\b/ },
  { key: "pasta", label: "makaron", roles: ["carb_slow"], heaviness: 1, match: /\b(makaron\w*|spaghetti|penne|kluski|pierog\w*)\b/ },
  { key: "cereal", label: "płatki", roles: ["carb_slow"], heaviness: 1, match: /\b(płatk\w*|owsiank\w*|musli|granol\w*)\b/ },
  { key: "potato", label: "ziemniaki", roles: ["carb_slow"], heaviness: 2, match: /\b(ziemniak\w*|puree|kasz\w*)\b/ },
  // owoce i cukry proste
  { key: "banana", label: "banan", roles: ["carb_fast"], heaviness: 0, match: /\bbanan\w*\b/ },
  { key: "fruit", label: "owoce", roles: ["carb_fast"], heaviness: 1, match: /\b(owoc\w*|jabłk\w*|jabłec\w*|gruszk\w*|winogron\w*|pomarańcz\w*|mandarynk\w*|truskawk\w*|daktyl\w*|rodzynk\w*)\b/ },
  { key: "honey", label: "miód / dżem", roles: ["carb_fast"], heaviness: 0, match: /\b(miód|miodu|dżem\w*|konfitur\w*|syrop\w*)\b/ },
  { key: "sweets", label: "słodycze", roles: ["sweets", "carb_fast", "fat"], heaviness: 3, match: /\b(czekolad\w*|batonik\w*|ciast\w*|pączk\w*|lod\w*|żelk\w*|cukierk\w*|nutell\w*)\b/ },
  { key: "gel", label: "żel energetyczny", roles: ["carb_fast"], heaviness: 0, match: /\b(żel\w* energetyczn\w*|żel\b)\b/ },
  // białko
  { key: "eggs", label: "jajka", roles: ["protein", "fat"], heaviness: 2, match: /\b(jaj\w*|omlet\w*|jajecznic\w*)\b/ },
  { key: "meat", label: "mięso", roles: ["protein"], heaviness: 2, match: /\b(kurczak\w*|indyk\w*|mięs\w*|wołowin\w*|wieprzowin\w*|szynk\w*|kotlet\w*|ryb\w*|łoso\w*|tuńczyk\w*)\b/ },
  { key: "cheese", label: "ser", roles: ["protein", "fat"], heaviness: 3, match: /\b(ser\b|ser[ay]\b|serem|sera\b|żółty ser|mozarell\w*|mozzarell\w*|pleśniow\w*|feta)\b/ },
  { key: "dairy", label: "nabiał", roles: ["protein"], heaviness: 1, match: /\b(jogurt\w*|twaróg|twarog\w*|serek\w*|kefir\w*|mlek\w*|skyr)\b/ },
  { key: "shake", label: "odżywka białkowa", roles: ["protein"], heaviness: 1, match: /\b(białk\w* (shake|koktajl)|odżywk\w* białkow\w*|whey|protein\w*)\b/ },
  // błonnik i warzywa
  { key: "veg", label: "warzywa", roles: ["fiber"], heaviness: 1, match: /\b(warzyw\w*|sałat\w*|surówk\w*|brokuł\w*|kapust\w*|fasol\w*|ciecierzyc\w*|soczewic\w*|ogórk\w*|pomidor\w*|papryk\w*)\b/ },
  { key: "nuts", label: "orzechy", roles: ["fat", "fiber"], heaviness: 3, match: /\b(orzech\w*|masł\w* orzechow\w*|migdał\w*|awokado)\b/ },
  // napoje
  { key: "energy", label: "energetyk", roles: ["caffeine", "drink", "carb_fast"], heaviness: 0, match: /\b(energetyk\w*|energy drink)\b/ },
  { key: "coffee", label: "kawa", roles: ["caffeine", "drink"], heaviness: 0, match: /\b(kaw\w*|espresso|latte)\b/ },
  { key: "isotonic", label: "izotonik / sok", roles: ["drink", "carb_fast"], heaviness: 0, match: /\b(izotonik\w*|sok\w*|napój izotoniczn\w*|lemoniad\w*|cola)\b/ },
  { key: "water", label: "woda", roles: ["drink"], heaviness: 0, match: /\b(wod[ayę]|woda|wody)\b/ },
];

const ROLE_BUCKET: Record<string, keyof ParsedMeal> = {};

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export function parseMeal(raw: string): ParsedMeal {
  const text = normalize(raw);
  const items: ParsedFoodItem[] = [];
  const consumed: string[] = [];

  for (const entry of DICTIONARY) {
    const m = text.match(entry.match);
    if (!m) continue;
    consumed.push(m[0]);
    items.push({
      key: entry.key,
      label: entry.label,
      roles: entry.roles,
      heaviness: entry.heaviness,
    });
  }

  let rest = text;
  for (const c of consumed) rest = rest.split(c).join(" ");
  const unrecognized = rest
    .split(/[^a-ząćęłńóśżź]+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));

  const by = (role: FoodRole) => items.filter((i) => i.roles.includes(role));
  const heaviness = Math.min(
    10,
    items.reduce((s, i) => s + i.heaviness, 0),
  );

  const carbFast = by("carb_fast");
  const carbSlow = by("carb_slow");

  return {
    raw,
    items,
    unrecognized,
    carbFast,
    carbSlow,
    protein: by("protein"),
    fatHeavy: by("fat"),
    fiber: by("fiber"),
    drinks: by("drink"),
    caffeine: by("caffeine"),
    sweets: by("sweets"),
    heaviness,
    hasCarbs: carbFast.length + carbSlow.length > 0,
    recognized: items.length > 0,
  };
}

const STOPWORDS = new Set([
  "oraz",
  "jeszcze",
  "trochę",
  "duży",
  "duża",
  "mała",
  "małe",
  "razem",
  "potem",
  "przed",
  "treningiem",
  "kilka",
  "dwie",
  "trzy",
  "dwa",
  "plus",
  "chcę",
  "zjeść",
]);

export { ROLE_BUCKET };
