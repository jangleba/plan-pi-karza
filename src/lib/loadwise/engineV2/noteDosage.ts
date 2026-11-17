/**
 * Dosing: what a skeleton slot's reference dose (the coach's sets, repetitions, tempo) becomes for
 * ONE athlete. The reference dose is kept whenever the athlete is prepared for it; every change
 * comes with a stated reason and is returned next to the dose, never applied silently.
 *
 * Two things never enter here: the exercise (noteFunctions.ts decides it) and kilograms (the
 * engine never invents a load; the athlete's logged performance drives suggestions later, and
 * the athlete can always change them). Rests are product values, the photos give none.
 */
import type { Profile } from "../types";
import type { Dose, DoseAdjustment } from "./model";
import type { DoseKind, Ref, SkeletonSlot, SlotFunction } from "./coachSkeletons";
import { FUNCTIONAL_CATALOGUE } from "./taxonomy";
import { gymPowerDose } from "./gymPower";
import {
  declaresLimitedStrength,
  hasVerifiedAdvancedStrength,
  preparationProfile,
} from "./preparation";

/** How close the athlete's REAL strength preparation is to the coach's own prescription. */
export type NoteLevel = "full" | "standard" | "intro";

export interface NoteLevelDecision {
  level: NoteLevel;
  /** Why this level, in plain words (also shown in the plan's explanation). */
  basis: string;
}

/**
 * The level comes from the athlete's strength declaration only. A football level (advanced,
 * elite) never lifts it: without a complete declaration the doses are standard, not "full".
 */
export function noteLevelDecision(p: Profile): NoteLevelDecision {
  if (declaresLimitedStrength(p))
    return {
      level: "intro",
      basis:
        "Zadeklarowane ograniczone przygotowanie siłowe: wprowadzenie, mniej serii i więcej powtórzeń.",
    };
  if (hasVerifiedAdvancedStrength(p))
    return {
      level: "full",
      basis:
        "Zadeklarowane zaawansowane przygotowanie siłowe dorosłego (co najmniej 24 miesiące, wysoka technika): dawki trenera bez zmian.",
    };
  const preparation = preparationProfile(p);
  if (preparation.source === "explicit_strength" && !preparation.provisional)
    return preparation.tier === "foundation"
      ? {
          level: "intro",
          basis: "Deklaracja przygotowania siłowego wskazuje na początkujący poziom: wprowadzenie.",
        }
      : {
          level: "standard",
          basis:
            p.age < 18
              ? "Do 18 lat dawki standardowe: do 3 serii i co najmniej 4 powtórzenia w ćwiczeniach głównych."
              : "Przygotowanie siłowe rozwijające się, bez potwierdzonego poziomu zaawansowanego: dawki standardowe.",
        };
  return {
    level: "standard",
    basis:
      "Brak pełnej deklaracji przygotowania siłowego. Poziom piłkarski nie przesądza o zaawansowaniu na siłowni, więc dawki są standardowe, a po uzupełnieniu odpowiedzi mogą wzrosnąć.",
  };
}
export const noteLevel = (p: Profile): NoteLevel => noteLevelDecision(p).level;

/** Product rest (seconds) between sets: the photos give no rest. */
const REST_BY_FUNCTION: Partial<Record<SlotFunction, number>> = {
  squat_heavy: 180,
  hip_hinge_heavy: 180,
  horizontal_push_heavy: 150,
  knee_single_leg_strength: 150,
  horizontal_pull_heavy: 120,
  push_to_five: 120,
  pull_to_five: 120,
};
const REST_BY_KIND: Record<DoseKind, number> = {
  lift: 150,
  ballistic_lift: 120,
  jump: 120,
  throw: 120,
  accessory: 60,
  iso_time: 45,
  iso_holds: 45,
};
/** Jumps that land and rebound: two ground contacts per repetition. Any other jump counts one. */
const TWO_CONTACT_JUMPS = new Set(["depth_jump", "drop_jump", "depth_jump_over_hurdle"]);

const SQUAT_LIKE_TEMPO = (t: readonly [number, number, number]) => ({
  eccentricSeconds: t[0],
  pauseSeconds: t[1],
  concentricSeconds: t[2],
});

export interface DoseRequest {
  slot: SkeletonSlot;
  /** The reference dose of the week (heavy overrides applied). */
  ref: Ref;
  exerciseId: string;
  /** The exercise is not the coach's own: a library equivalent of the same function. */
  substitute: boolean;
  level: NoteLevel;
  p: Profile;
  phase: "adaptation" | "development" | "peak" | "deload";
}
export interface DoseResult {
  dose: Dose;
  adjustments: DoseAdjustment[];
  /** Fields the photo does not state: product defaults, not the coach's numbers. */
  productDefaults: string[];
}

export function adaptDose(req: DoseRequest): DoseResult {
  const { slot, ref, exerciseId: id, substitute, level, p } = req;
  const youth = p.age < 18;
  const adjustments: DoseAdjustment[] = [];
  const change = (
    field: DoseAdjustment["field"],
    from: DoseAdjustment["from"],
    to: DoseAdjustment["to"],
    reason: string,
  ) => adjustments.push({ field, from, to, reason });
  const productDefaults = [...(ref.unspecified ?? [])];

  // Reviewed gym stations keep their own dose rules (and GP1 progression).
  if (id.startsWith("gym_")) {
    const d = gymPowerDose(id, p, req.phase);
    const sets = level === "intro" ? Math.min(2, d.sets) : d.sets;
    const reason =
      "Stanowisko siłowni ma własną regułę dawki (progresja GP1), więc dawka trenera jest tu odniesieniem, nie wymogiem.";
    if (sets !== ref.sets)
      change(
        "sets",
        ref.sets,
        sets,
        level === "intro" && sets < d.sets ? "Wprowadzenie do siłowni: do 2 serii skoków." : reason,
      );
    if (d.reps !== undefined && ref.reps !== undefined && d.reps !== ref.reps)
      change("reps", ref.reps, d.reps, reason);
    return { dose: { ...d, sets }, adjustments, productDefaults };
  }

  const catalogue = FUNCTIONAL_CATALOGUE[id];
  const perSide =
    substitute && catalogue ? catalogue.unilateral : Boolean(ref.perSide ?? catalogue?.unilateral);
  if (substitute && Boolean(ref.perSide) !== perSide)
    change(
      "perSide",
      ref.perSide ? "na stronę" : "łącznie",
      perSide ? "na stronę" : "łącznie",
      perSide
        ? "Zamiennik jest wykonywany jednostronnie: serie na każdą stronę."
        : "Zamiennik jest obunożny lub oburęczny: serie bez podziału na strony.",
    );

  const kind = slot.kind;
  const isLift = kind === "lift";
  const jumpLike = kind === "jump" || kind === "ballistic_lift" || kind === "throw";
  const dose: Dose = {
    sets: ref.sets,
    restSeconds: REST_BY_FUNCTION[slot.fn] ?? REST_BY_KIND[kind],
    intent: kind === "accessory" || isLift ? "controlled" : jumpLike ? "explosive" : "hold",
    ...(perSide || kind === "throw" ? { perSide: true } : {}),
  };
  if (kind === "iso_time") dose.seconds = ref.seconds;
  else if (kind === "iso_holds") {
    dose.holdReps = ref.holds;
    if (ref.holdSeconds) dose.seconds = ref.holdSeconds;
  } else dose.reps = ref.reps;
  if (kind === "jump") dose.contactsPerRep = TWO_CONTACT_JUMPS.has(id) ? 2 : 1;
  if (kind === "accessory") dose.rir = 3;
  if (isLift) dose.rir = level === "full" && !substitute && !youth ? 1 : level === "intro" ? 3 : 2;
  if (ref.tempo && level !== "intro") dose.tempo = SQUAT_LIKE_TEMPO(ref.tempo);
  else if (ref.tempo)
    change(
      "tempo",
      ref.tempo.join("-"),
      null,
      "Wprowadzenie do siłowni: najpierw spokojna technika, bez narzuconego tempa.",
    );

  // Repetitions of main lifts: low reps only for a verified prepared adult and the coach's own lift.
  if (isLift) {
    const minimum = level === "intro" ? 6 : level === "standard" || youth ? 4 : 1;
    const reps = Math.max(ref.reps ?? 1, minimum, substitute ? 5 : 1);
    if (reps !== ref.reps) {
      change(
        "reps",
        ref.reps ?? null,
        reps,
        level === "intro"
          ? "Wprowadzenie do siłowni: co najmniej 6 powtórzeń i zapas 3 powtórzeń."
          : substitute && reps === 5 && minimum < 5
            ? "Zamiennik nie jest ćwiczeniem trenera: bez serii niżej niż 5 powtórzeń."
            : "Bez potwierdzonego, zaawansowanego przygotowania siłowego dorosłego nie dajemy serii poniżej 4 powtórzeń.",
      );
      dose.reps = reps;
    }
  }
  if (jumpLike && level === "intro" && (ref.reps ?? 0) > 3) {
    change("reps", ref.reps ?? null, 3, "Wprowadzenie do siłowni: do 3 powtórzeń skoku w serii.");
    dose.reps = 3;
  }

  // Sets.
  let cap = ref.sets;
  let why = "";
  if (level === "intro") {
    cap = isLift ? 3 : 2;
    why = isLift
      ? "Wprowadzenie do siłowni: do 3 serii ćwiczenia."
      : "Wprowadzenie do siłowni: do 2 serii skoków, rzutów, akcesoriów i izometrii.";
    if (isLift && ref.sets <= 3) cap = ref.sets;
  }
  if (youth && cap > 3) {
    cap = 3;
    why = "Do 18 lat nie więcej niż 3 serie jednego ćwiczenia.";
  }
  if (cap < ref.sets) {
    change("sets", ref.sets, cap, why);
    dose.sets = cap;
  }
  return { dose, adjustments, productDefaults };
}
