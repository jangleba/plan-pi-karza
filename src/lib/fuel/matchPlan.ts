import { FUEL_TARGETS_VERSION } from "./dayTargets";

/**
 * Match-day fuelling plan (version "fuel-targets-1"): the meal 3–4 h before kick-off, an optional
 * top-up 60–90 min before, optional carbohydrate during play and recovery after the final whistle.
 * Basis: UEFA expert group statement (Collins et al., BJSM 2021) — pre-match meal ≈1–3 g/kg CHO,
 * 30–60 g/h during play when tolerated and practised, ≈1 g/kg CHO with ≈0.3 g/kg protein after.
 * Lower ends are used so the advice suits non-elite players; grams appear only for athletes 16+
 * with a body mass shared under the Fuel Precision consent, everyone else gets portions.
 */
export type MatchParticipation = "full" | "part" | "bench";
export type PreExerciseTolerance = "good" | "sensitive";
type MatchStepId = "pre_meal" | "pre_snack" | "during" | "post_snack" | "post_meal";
type MatchStepStatus = "past" | "now" | "next" | "later";

export interface MatchFuelStep {
  id: MatchStepId;
  /** Start of the window (ms); null without a kick-off time. */
  at: number | null;
  when: string;
  title: string;
  portion: string;
  swap: string;
  why: string;
  optional: boolean;
  status: MatchStepStatus;
}
export interface MatchFuelPlan {
  version: typeof FUEL_TARGETS_VERSION;
  kickoff: number | null;
  steps: MatchFuelStep[];
  current: MatchFuelStep | null;
  notes: string[];
  precision: "grams" | "portions";
}

export interface MatchFuelInput {
  kickoff: number | null;
  /** Match length in minutes (both halves); 90 when unknown. Half-time adds 15. */
  matchMinutes?: number | null;
  participation: MatchParticipation | null;
  lastMealAt: number | null;
  tolerance: PreExerciseTolerance | null;
  now: number;
  weightKg: number | null;
  age: number;
  /** Real end of the match once the athlete closed it. */
  endedAt?: number | null;
}

const H = 3_600_000;
const M = 60_000;
const r5 = (value: number) => Math.round(value / 5) * 5;
const clock = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export function matchFuelPlan(input: MatchFuelInput): MatchFuelPlan {
  const { kickoff, now, tolerance, participation } = input;
  const w =
    input.age >= 16 &&
    typeof input.weightKg === "number" &&
    input.weightKg >= 25 &&
    input.weightKg <= 250
      ? input.weightKg
      : null;
  const g = (min: number, max: number, unit = "węglowodanów") =>
    w ? `${r5(min * w)}–${r5(max * w)} g ${unit}` : null;
  const sensitive = tolerance === "sensitive";
  const bench = participation === "bench";
  const playMin = Math.max(20, Math.min(130, input.matchMinutes ?? 90));
  const end = input.endedAt ?? (kickoff !== null ? kickoff + (playMin + 15) * M : null);
  const notes: string[] = [];
  if (kickoff === null) notes.push("Ustaw godzinę meczu w planie, a ułożę godziny posiłków.");
  if (participation === null)
    notes.push("Nie wiem, ile zagrasz: plan zakłada pełny udział. Możesz to zmienić.");
  if (tolerance === null)
    notes.push("Nie znam Twojej tolerancji jedzenia przed wysiłkiem: plan jest ostrożny.");

  const steps: Array<Omit<MatchFuelStep, "status"> & { until: number | null }> = [
    {
      id: "pre_meal",
      at: kickoff !== null ? kickoff - (sensitive ? 4 : 3.5) * H : null,
      until: kickoff !== null ? kickoff - 2.5 * H : null,
      when: "3–4 h przed meczem",
      title: "Posiłek przed meczem",
      portion:
        g(1, 2) ??
        "Ok. ½ talerza węglowodanów (ryż, makaron, ziemniaki), porcja chudego białka, mało tłuszczu.",
      swap: "Kanapki z jasnym pieczywem, chudą wędliną i banan albo owsianka z bananem i miodem.",
      why: sensitive
        ? "Wcześniej i mniejszy talerz: żołądek zdąży się uspokoić przed gwizdkiem."
        : bench
          ? "Rezerwowy też może wejść w każdej chwili: jedz jak przed grą."
          : "Uzupełnia zapasy energii na cały mecz, bez ciężkości.",
      optional: false,
    },
    {
      id: "pre_snack",
      at: kickoff !== null ? kickoff - 90 * M : null,
      until: kickoff !== null ? kickoff - 30 * M : null,
      when: "60–90 min przed meczem",
      title: "Mała przekąska",
      portion: sensitive
        ? "Kilka łyków napoju izotonicznego zamiast jedzenia."
        : ((w ? `ok. ${r5(Math.min(40, 0.4 * w))} g węglowodanów` : null) ??
          "1 banan albo 2 wafle ryżowe z dżemem."),
      swap: "Baton zbożowy, który znasz, albo jogurt pitny.",
      why: "Tylko gdy od posiłku minęło ponad 2–3 h albo czujesz głód.",
      optional: true,
    },
    {
      id: "during",
      at: kickoff,
      until: end,
      when: "W przerwie",
      title: bench ? "Napój na ławce" : "W trakcie meczu",
      portion: bench
        ? "Woda. Jeśli wchodzisz na boisko: kilka łyków napoju izotonicznego."
        : sensitive || playMin < 60
          ? "Łyki napoju izotonicznego, jeśli dobrze go znosisz."
          : "Napój izotoniczny ok. 500 ml albo żel — razem ok. 30–60 g węglowodanów na godzinę gry.",
      swap: "Banan pokrojony na kawałki albo kilka żelków owocowych.",
      why: sensitive
        ? "Nowych produktów nie testuj w meczu — najpierw na treningu."
        : "Opcjonalnie: pomaga utrzymać energię w drugiej połowie, jeśli masz to przećwiczone.",
      optional: true,
    },
    {
      id: "post_snack",
      at: end,
      until: end !== null ? end + 60 * M : null,
      when: "Do 1 h po meczu",
      title: "Po meczu",
      portion:
        (w ? `${g(0.8, 1.2)} i ${r5(Math.min(40, Math.max(20, 0.3 * w)))} g białka` : null) ??
        "Kakao lub mleko 500 ml i banan albo jogurt pitny i bułka.",
      swap: "Kanapka z serem lub szynką i sok owocowy.",
      why:
        bench || participation === "part"
          ? "Mniej minut, ale regeneracja nadal ważna: mniejsza porcja wystarczy."
          : "Węglowodany i białko zaczynają odbudowę po meczu.",
      optional: false,
    },
    {
      id: "post_meal",
      at: end !== null ? end + 60 * M : null,
      until: end !== null ? end + 3 * H : null,
      when: "1–3 h po meczu",
      title: "Pełny posiłek",
      portion: "Ok. ½ talerza węglowodanów, porcja białka i warzywa.",
      swap: "Makaron z kurczakiem i warzywami albo ryż z rybą.",
      why: "Kolejna porcja na odbudowę zapasów do następnego dnia.",
      optional: false,
    },
  ];

  // Time since the last meal changes what fits now.
  const sinceMeal = input.lastMealAt !== null ? (now - input.lastMealAt) / H : null;
  const preMeal = steps[0];
  const snack = steps[1];
  if (kickoff !== null && sinceMeal !== null && now < kickoff) {
    if (sinceMeal < 2 && now >= (preMeal.at ?? 0)) {
      preMeal.why = "Jesz już niedawno: kolejny talerz nie jest potrzebny.";
      preMeal.optional = true;
      snack.why = "Raczej zbędna — chyba że czujesz głód.";
    } else if (sinceMeal >= 4 && kickoff - now <= 2.5 * H) {
      snack.optional = false;
      snack.why = `Od ostatniego posiłku minęło ${Math.floor(sinceMeal)} h: lekka porcja teraz.`;
    }
  }

  let currentIndex = -1;
  let nextIndex = -1;
  steps.forEach((s, i) => {
    if (s.at === null) return;
    if (currentIndex < 0 && now >= s.at && (s.until === null || now < s.until)) currentIndex = i;
    if (nextIndex < 0 && now < s.at) nextIndex = i;
  });
  const out: MatchFuelStep[] = steps.map(({ until, ...s }, i) => ({
    ...s,
    when: s.at !== null ? `${clock(s.at)} · ${s.when}` : s.when,
    status:
      kickoff === null
        ? i === 0
          ? "next"
          : "later"
        : i === currentIndex
          ? "now"
          : i === nextIndex && currentIndex < 0
            ? "next"
            : until !== null && now >= until
              ? "past"
              : "later",
  }));
  return {
    version: FUEL_TARGETS_VERSION,
    kickoff,
    steps: out,
    current: out.find((s) => s.status === "now") ?? out.find((s) => s.status === "next") ?? null,
    notes,
    precision: w ? "grams" : "portions",
  };
}

/** Kick-off as a timestamp from the plan's date and "HH:MM", in the device's time zone. */
export function kickoffFrom(date: string, time: string | null | undefined): number | null {
  if (!time || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time) || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    return null;
  const at = new Date(`${date}T${time}:00`).getTime();
  return Number.isFinite(at) ? at : null;
}
