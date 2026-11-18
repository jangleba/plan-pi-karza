/**
 * Fuel: porady żywieniowe wokół sesji i meczu.
 * Liczby z oświadczenia grupy ekspertów UEFA (Collins i in., BJSM 2020) są oznaczone `uefa: true`;
 * pozostałe wskazówki są ogólne/praktyczne i NIE pochodzą z konkretnych badań (docs/ZRODLA-FUEL.md).
 */
export type Goal = "maintain" | "gain" | "lose";
export type ActivityKind = "match" | "session";
export type DayKind = "match" | "pre-match" | "training" | "light";

export interface Tip {
  title: string;
  body: string;
  /** Konkretne ilości dla zawodnika, jeśli wynikają z masy. */
  amount?: string;
  /** Czy liczby pochodzą z oświadczenia UEFA. */
  uefa: boolean;
}

const rng = (kg: number, lo: number, hi: number, unit: string) =>
  lo === hi ? `${Math.round(kg * lo)} ${unit}` : `${Math.round(kg * lo)}–${Math.round(kg * hi)} ${unit}`;

/** Co robić, gdy do aktywności zostało `hours` godzin (>0), lub po aktywności (hours<0 = godzin temu). */
export function adviceAround(hours: number, kind: ActivityKind, weightKg: number): Tip[] {
  if (hours < 0) return afterTips(-hours, kind, weightKg);
  if (hours >= 3) {
    return [
      {
        title: "Główny posiłek",
        body: "Węglowodany jako baza (ryż, makaron, ziemniaki, pieczywo), mało tłuszczu i błonnika, umiarkowanie białka.",
        amount: `${rng(weightKg, 1, 3, "g węglowodanów")}`,
        uefa: kind === "match",
      },
      {
        title: "Płyny",
        body: "Pij regularnie w ciągu 2–4 godzin przed.",
        amount: rng(weightKg, 5, 7, "ml").replace(" ml", " ml łącznie"),
        uefa: kind === "match",
      },
    ];
  }
  if (hours >= 1) {
    return [
      {
        title: "Lekka przekąska",
        body: "Łatwostrawne węglowodany w małej porcji (banan, białe pieczywo z dżemem, bułka z miodem). Bez tłustego i bardzo błonnikowego jedzenia.",
        uefa: false,
      },
      { title: "Płyny", body: "Pij małymi łykami, bez nadmiaru naraz.", uefa: false },
    ];
  }
  return [
    {
      title: "Teraz tylko płyny",
      body: "Za mało czasu na jedzenie. Woda lub napój z węglowodanami małymi łykami; ewentualnie kilka łyków soku lub kawałek banana, jeśli dobrze to znosisz.",
      uefa: false,
    },
  ];
}

function afterTips(hoursAgo: number, kind: ActivityKind, weightKg: number): Tip[] {
  const tips: Tip[] = [];
  if (kind === "match" && hoursAgo <= 4) {
    tips.push({
      title: "Uzupełnij węglowodany",
      body: "W pierwszych 4 godzinach po meczu (szczególnie przy kolejnym wysiłku w ciągu doby): regularnie jedz węglowodany.",
      amount: rng(weightKg, 1, 1, "g węglowodanów na godzinę"),
      uefa: true,
    });
  } else if (hoursAgo <= 4) {
    tips.push({
      title: "Posiłek po sesji",
      body: "Zjedz normalny posiłek z węglowodanami i białkiem. Dokładne ilości zależą od tego, kiedy kolejny wysiłek.",
      uefa: false,
    });
  }
  tips.push({
    title: "Białko w posiłkach",
    body: "Rozłóż białko na 3–4 posiłki w ciągu dnia, nie jedz całości naraz.",
    amount: `${rng(weightKg, 1.6, 2.2, "g")} dziennie`,
    uefa: true,
  });
  tips.push({ title: "Nawodnienie", body: "Uzupełniaj płyny do jasnego koloru moczu.", uefa: false });
  return tips;
}

export interface DailyTargets {
  carbG: [number, number];
  proteinG: [number, number];
  note: string;
}

/** Cele dzienne; cel zawodnika przesuwa tylko położenie w zakresie (orientacyjnie). */
export function dailyTargets(weightKg: number, day: DayKind, goal: Goal): DailyTargets {
  const [cLo, cHi, note] =
    day === "match" || day === "pre-match"
      ? [6, 8, "Dzień meczu i dzień przed: 6–8 g/kg węglowodanów (UEFA)."]
      : day === "training"
        ? [5, 8, "Zakres UEFA to 3–8 g/kg zależnie od obciążenia; w dni treningowe celuj w górną połowę (podział orientacyjny)."]
        : [3, 5, "Zakres UEFA to 3–8 g/kg zależnie od obciążenia; w dni lekkie bliżej dolnej granicy (podział orientacyjny)."];
  let carb: [number, number] = [cLo, cHi];
  if (goal === "gain") carb = [(cLo + cHi) / 2, cHi];
  if (goal === "lose") carb = [cLo, (cLo + cHi) / 2];
  const protein: [number, number] = goal === "gain" ? [1.9, 2.2] : goal === "lose" ? [2.0, 2.2] : [1.6, 2.0];
  return {
    carbG: [Math.round(weightKg * carb[0]), Math.round(weightKg * carb[1])],
    proteinG: [Math.round(weightKg * protein[0]), Math.round(weightKg * protein[1])],
    note,
  };
}

/** Godziny do aktywności o podanej porze (HH:MM) względem teraz; ujemne = już po. */
export function hoursUntil(timeHHMM: string, now: Date): number {
  const [h, m] = timeHHMM.split(":").map(Number);
  const t = new Date(now);
  t.setHours(h ?? 0, m ?? 0, 0, 0);
  return (t.getTime() - now.getTime()) / 3_600_000;
}

export const SHOP = {
  buy: [
    "Ryż, makaron, ziemniaki, płatki owsiane – baza węglowodanowa",
    "Banany, jabłka, suszone owoce – szybkie przekąski",
    "Jajka, twaróg, jogurt naturalny, kefir – białko",
    "Kurczak, indyk, ryby, tuńczyk w puszce – białko",
    "Chleb jasny i razowy, dżem, miód – przed sesją",
    "Mleko, napoje roślinne wzbogacane – po sesji",
  ],
  limit: [
    "Fast food i smażone – dużo tłuszczu, wolno trawione przed sesją",
    "Bardzo błonnikowe jedzenie tuż przed sesją (surowe warzywa w dużej ilości, otręby)",
    "Napoje energetyczne – nie zastępują posiłku",
    "Alkohol – utrudnia regenerację (ogólna zasada, bez konkretnych liczb)",
  ],
  quick: [
    "Mało czasu przed sesją: banan lub bułka z dżemem",
    "Po sesji bez czasu na gotowanie: jogurt z owocami i płatkami, kanapka z jajkiem lub tuńczykiem, mleko",
    "W sklepie: gotowy ryż w woreczku, jajka na twardo, twarożek, owoce",
  ],
  note: "To praktyczne propozycje, nie wyniki badań.",
} as const;
