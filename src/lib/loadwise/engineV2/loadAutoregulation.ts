import {
  exercisePrescriptionKey,
  plannedExerciseSets,
  strengthMovementKey,
  type ExerciseSessionLog,
  type HistorySetLog,
} from "../setLogHistory";
import type { TrainingExercise } from "../types";
import { dayDistance, plusDays } from "./model";
import type { ProgressionAdvice } from "./progression";
import type { StrengthMode, StrengthWeekContext } from "./strengthPolicy";
import type { StrengthLoadPreference } from "../strengthCheckIn";

export interface StrengthLoadContext extends StrengthWeekContext {
  /** The UI supplies false when actual equipment has not been configured. */
  equipmentConfigured?: boolean;
  declinedIncrease?: boolean;
  age: number;
  mode: StrengthMode;
  /** Explicit equipment values win; 2.5 kg below is a displayed product default, not measured equipment. */
  incrementKg?: number;
  availableWeightsKg?: number[];
  loadPreference?: StrengthLoadPreference;
}
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const validDate = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && plusDays(s, 0) === s;
const dateOf = (s: ExerciseSessionLog) => s.verification?.sessionDate ?? s.performedAt.slice(0, 10);
const targets = (e: TrainingExercise) => ({
  min: Number(e.reps?.match(/^\d+/)?.[0]),
  max: Number(e.reps?.match(/^\d+\s*[–-]\s*(\d+)/)?.[1] ?? e.reps?.match(/^\d+/)?.[0]),
  rir: Number(e.rir?.match(/\d+/)?.[0]),
});
const comparableMechanics = (e: TrainingExercise, s: ExerciseSessionLog) =>
  s.verification?.movementKey === strengthMovementKey(e);

function complete(s: ExerciseSessionLog, uniform = true): boolean {
  const n = s.verification?.expectedSets;
  return (
    Number.isInteger(n) &&
    n! > 0 &&
    s.sets.length === n &&
    new Set(s.sets.map((x) => x.setNumber)).size === n &&
    s.sets.every(
      (x, index) =>
        Number.isInteger(x.setNumber) &&
        x.setNumber === index + 1 &&
        x.setNumber >= 1 &&
        x.setNumber <= n! &&
        finite(x.weightKg) &&
        x.weightKg > 0 &&
        Number.isInteger(x.reps) &&
        x.reps! >= 0 &&
        x.reps! <= 100 &&
        (x.rir === null || (finite(x.rir) && x.rir >= 0 && x.rir <= 10)),
    ) &&
    (!uniform || s.sets.every((x) => x.weightKg === s.sets[0].weightKg))
  );
}
const descending = (s: ExerciseSessionLog) =>
  complete(s, false) &&
  s.sets.some((x, i) => i > 0 && x.weightKg! < s.sets[i - 1].weightKg!) &&
  s.sets.every((x, i) => i === 0 || x.weightKg! <= s.sets[i - 1].weightKg!);

/** Counts observed reductions only: no inference about intent or physiological cause. */
export function observedLoadReductions(
  e: TrainingExercise,
  history: ExerciseSessionLog[],
  ctx: StrengthLoadContext,
): number {
  const recent = [...history].sort((a, b) => dateOf(b).localeCompare(dateOf(a))).slice(0, 4);
  const usable = (s: ExerciseSessionLog) =>
    validDate(dateOf(s)) &&
    dateOf(s) < ctx.asOfDate &&
    dayDistance(ctx.asOfDate, dateOf(s)) <= 21 &&
    complete(s, false) &&
    comparableMechanics(e, s) &&
    s.verification?.phase !== "reduced" &&
    s.verification?.prescriptionKey === exercisePrescriptionKey(e) &&
    (complete(s) || descending(s));
  const events = new Set<string>();
  for (let i = 0; i < Math.min(3, recent.length); i++) {
    const current = recent[i],
      prior = recent[i + 1];
    if (!usable(current)) continue;
    if (
      descending(current) ||
      (prior &&
        usable(prior) &&
        dateOf(current) !== dateOf(prior) &&
        current.sets.at(-1)!.weightKg! < prior.sets.at(-1)!.weightKg!)
    )
      events.add(dateOf(current));
  }
  return events.size;
}
function weightStep(
  weight: number,
  direction: "up" | "down",
  fraction: number,
  ctx: StrengthLoadContext,
): number | undefined {
  if (ctx.equipmentConfigured === false) return undefined;
  if (ctx.availableWeightsKg) {
    if (!ctx.availableWeightsKg.length || ctx.availableWeightsKg.some((n) => !finite(n) || n <= 0))
      return undefined;
    const candidates = [...new Set(ctx.availableWeightsKg)].sort((a, b) => a - b);
    return direction === "up"
      ? candidates.find((n) => n > weight && n <= weight * (1 + fraction) + 1e-9)
      : candidates
          .reverse()
          .find((n) => n < weight && n <= weight * (1 - fraction) + 1e-9 && n >= weight * 0.85);
  }
  const step = ctx.incrementKg ?? 2.5;
  if (!finite(step) || step <= 0) return undefined;
  if (direction === "up") {
    const next = Math.round((weight + step) * 100) / 100;
    return next <= weight * (1 + fraction) + 1e-9 ? next : undefined;
  }
  const next = Math.floor((weight * (1 - fraction) + 1e-9) / step) * step;
  return next > 0 && next < weight && next >= weight * 0.85
    ? Math.round(next * 100) / 100
    : undefined;
}
const advice = (
  action: NonNullable<ProgressionAdvice["action"]>,
  label: string,
  reason: string,
  weightKg?: number,
  kind: ProgressionAdvice["kind"] = weightKg === undefined ? "review" : "load",
): ProgressionAdvice => ({
  kind,
  action,
  label,
  reason,
  ...(weightKg !== undefined ? { weightKg } : {}),
});
const hold = (weight: number, reason: string) =>
  advice("hold", `Utrzymaj ${weight} kg`, reason, weight);
const review = (reason: string) =>
  advice("calibrate", "Dobierz ciężar w seriach wprowadzających", reason);
const drop = (
  weight: number,
  fraction: number,
  ctx: StrengthLoadContext,
  why: string,
  action: "reduce" | "deload" | "resume" = "reduce",
) => {
  const next = weightStep(weight, "down", fraction, ctx);
  return next === undefined
    ? advice(
        action,
        "Wybierz dostępny mniejszy ciężar",
        why + " Brakuje znanego małego skoku sprzętu; nie podstawiamy fikcyjnej wartości.",
      )
    : advice(
        action,
        `${action === "resume" ? "Punkt odniesienia po przerwie" : "Propozycja zmniejszenia"}: ${next} kg`,
        why + " Sprawdź zapas w rozgrzewce; liczba nie jest pomiarem aktualnej siły.",
        next,
        action === "resume" ? "resume" : "load",
      );
};

/** Existing set logs support suggestions, not an objective technique/strength diagnosis. */
export function contextualStrengthAdvice(
  e: TrainingExercise,
  history: ExerciseSessionLog[],
  ctx: StrengthLoadContext,
): ProgressionAdvice | null {
  if (
    e.duration ||
    e.engineDose?.seconds !== undefined ||
    e.engineDose?.cluster ||
    ["hold", "explosive", "easy"].includes(e.engineDose?.intent ?? "")
  )
    return null;
  const target = targets(e);
  if (!plannedExerciseSets(e) || !target.min || !target.max || !finite(target.rir)) return null;
  if (!validDate(ctx.date) || !validDate(ctx.asOfDate) || ctx.date !== ctx.asOfDate)
    return advice(
      "hold",
      "Ciężar ustalisz w dniu treningu",
      "Nie zwiększamy kilogramów z przyszłych, niewykonanych ekspozycji.",
    );
  const ordered = [...history].sort((a, b) => dateOf(b).localeCompare(dateOf(a)));
  const latest = ordered[0];
  if (
    !latest ||
    !validDate(dateOf(latest)) ||
    dateOf(latest) >= ctx.asOfDate ||
    !comparableMechanics(e, latest) ||
    !complete(latest, false)
  )
    return review(
      "Brak kompletnego, porównywalnego wykonania tego wariantu. Nie zgadujemy ciężaru z wieku, pozycji ani etykiety poziomu.",
    );
  const age = dayDistance(ctx.asOfDate, dateOf(latest));
  if (age > 42) return review("Historia po długiej przerwie nie wyznacza dzisiejszego obciążenia.");
  if (
    latest.verification!.targetReps?.min !== target.min ||
    latest.verification!.targetReps?.max !== target.max
  )
    return review(
      "Zmienił się zakres powtórzeń. Dobierz ciężar w seriach wprowadzających; poprzednia dawka nie jest dzisiejszym obciążeniem.",
    );
  const mixed = !complete(latest);
  if (mixed && !descending(latest))
    return review(
      "Serie wykonano zmiennymi ciężarami. Nie traktujemy serii wprowadzających ani piramidy jako spadku siły.",
    );
  const weight = latest.sets.at(-1)!.weightKg!;
  if (ctx.availableWeightsKg && !ctx.availableWeightsKg.includes(weight))
    return review(
      "Poprzedni ciężar nie występuje na aktualnej liście dostępnych obciążeń. Dobierz faktycznie dostępny ciężar w seriach wprowadzających.",
    );
  if (age > 14 || ctx.mode === "reentry")
    return drop(
      weight,
      0.1,
      ctx,
      "Po przerwie mniejsza dawka i ostrożny punkt odniesienia, bez odrabiania sesji.",
      "resume",
    );
  const verified = latest.verification!;
  const reductions = observedLoadReductions(e, history, ctx);
  const last = latest.sets.at(-1)!;
  const lastFailed =
    last.reps! < (verified.targetReps?.min ?? target.min) ||
    (finite(last.rir) && (verified.targetRir ?? 0) >= 2 && last.rir <= verified.targetRir! - 2);
  const supportedSets = mixed ? [last] : latest.sets;
  const failed = (s: ExerciseSessionLog) =>
    !!s.verification?.targetReps?.min &&
    s.sets.some(
      (x) =>
        x.reps! < s.verification!.targetReps!.min ||
        (finite(x.rir) &&
          (s.verification!.targetRir ?? 0) >= 2 &&
          x.rir <= s.verification!.targetRir! - 2),
    );
  if (
    ctx.mode === "deload" ||
    e.progressionPhase === "reduced" ||
    ctx.repeatedHard ||
    (ctx.readinessScore !== undefined && ctx.readinessScore <= 4)
  ) {
    if (
      ctx.repeatedHard ||
      ctx.loadPreference === "lighter" ||
      failed(latest) ||
      latest.sets.some((x) => !finite(x.rir) || x.rir < target.rir)
    )
      return drop(
        weight,
        0.1,
        ctx,
        "Lżejszy tydzień: mniej serii i większy zapas. Wykonanie nie uzasadnia zachowania dotychczasowego ciężaru.",
        "deload",
      );
    return advice(
      "deload",
      `Lżejsza dawka; punkt odniesienia ${weight} kg`,
      "Zapisany zapas pozwala rozważyć ten sam ciężar przy mniejszej liczbie serii. Deload nie wymaga zawsze obniżenia kilogramów.",
      weight,
    );
  }
  if (ctx.loadPreference === "lighter" && verified.phase === "reduced")
    return drop(
      weight,
      0.05,
      ctx,
      "W dzisiejszym check-inie wybrano mniejszy ciężar. To preferencja treningowa, nie rozpoznanie zmęczenia; zachowaj zaplanowany zapas.",
    );
  if (verified.phase === "reduced") {
    if ((ctx.lighterRequests ?? 0) >= 2)
      return review(
        "Powtarzające się wybory mniejszego ciężaru: dobierz obciążenie w seriach wprowadzających, bez automatycznego powrotu do cięższej bazy sprzed deloadu.",
      );
    let i = 0;
    while (ordered[i]?.verification?.phase === "reduced") {
      if (!complete(ordered[i]) || !comparableMechanics(e, ordered[i]))
        return review("Niepełny zapis lżejszego okresu przerywa porównywalność.");
      i++;
    }
    const prior = ordered[i];
    if (
      !prior ||
      !validDate(dateOf(prior)) ||
      dayDistance(ctx.asOfDate, dateOf(prior)) > 21 ||
      !complete(prior) ||
      !comparableMechanics(e, prior) ||
      prior.verification?.targetReps?.min !== target.min ||
      prior.verification.targetReps.max !== target.max ||
      prior.sets.some((x) => x.reps! < target.min || !finite(x.rir) || x.rir < target.rir)
    )
      return review(
        "Po lżejszym okresie wróć przez serie wprowadzające; brak porównywalnej zwykłej bazy.",
      );
    const reference = prior.sets[0].weightKg!;
    if (
      ctx.equipmentConfigured === false ||
      (ctx.availableWeightsKg && !ctx.availableWeightsKg.includes(reference))
    )
      return review(
        "Ciężar sprzed lżejszego okresu nie jest dostępny na aktualnym stanowisku. Dobierz dostępne obciążenie w seriach wprowadzających.",
      );
    return advice(
      "resume",
      `Po redukcji: punkt odniesienia ${reference} kg`,
      "Powrót do potwierdzonej zwykłej bazy; lżejszy tydzień nie upoważnia do nowego rekordu.",
      prior.sets[0].weightKg!,
      "resume",
    );
  }
  const failures = ordered
    .slice(0, 2)
    .filter(
      (s) =>
        validDate(dateOf(s)) &&
        dayDistance(ctx.asOfDate, dateOf(s)) <= 21 &&
        complete(s) &&
        comparableMechanics(e, s) &&
        failed(s),
    );
  if (failed(latest) && (!mixed || lastFailed))
    return drop(
      weight,
      failures.length === 2 ? 0.075 : 0.05,
      ctx,
      failures.length === 2
        ? "Dwie nieudane porównywalne ekspozycje: zmniejsz ciężar i przejrzyj dawkę całego tygodnia."
        : "Nie osiągnięto minimalnych powtórzeń albo istotnie zabrakło zaplanowanego zapasu.",
    );
  if (ctx.loadPreference === "lighter")
    return drop(
      weight,
      0.05,
      ctx,
      "W dzisiejszym check-inie wybrano mniejszy ciężar. To preferencja treningowa, nie rozpoznanie zmęczenia; zachowaj zaplanowany zapas.",
    );
  if (
    verified.targetReps?.min !== target.min ||
    verified.targetReps.max !== target.max ||
    supportedSets.some((x) => !finite(x.rir) || x.rir < target.rir)
  )
    return review(
      "Zmienił się zakres powtórzeń lub wymagany zapas. Ciężar z innej dawki nie jest gotową rekomendacją.",
    );
  if (
    mixed ||
    reductions >= 2 ||
    (ctx.lighterRequests ?? 0) >= 2 ||
    ctx.mode === "maintenance" ||
    ctx.declinedIncrease ||
    ctx.matches7d >= 2 ||
    ctx.nearestMatchDays <= 2 ||
    ctx.hardDays7d >= 4 ||
    ctx.unknownPastExternalLoad ||
    (ctx.readinessScore !== undefined && ctx.readinessScore < 7)
  )
    return hold(
      weight,
      mixed
        ? "W ostatniej ekspozycji zmniejszono ciężar między seriami. Oprzyj kolejną na ostatnim mniejszym ciężarze z potwierdzonym zapasem; przyczyna obniżki nie jest znana."
        : reductions >= 2
          ? `Obniżenie ciężaru w ${reductions} z ostatnich trzech porównywalnych ekspozycji. Oprzyj kolejną sesję na ostatnim mniejszym ciężarze i odbuduj powtarzalne wykonanie; przyczyna obniżki nie jest znana.`
          : (ctx.lighterRequests ?? 0) >= 2
            ? `W ${ctx.lighterRequests} z ostatnich trzech siłowni wybrano mniejszy ciężar. Bez automatycznej podwyżki; oceń wymagany zapas.`
            : ctx.declinedIncrease
              ? "Ostatnio wybrano pozostanie przy własnym ciężarze. To nie jest nieudana seria; podwyżkę możesz ponownie rozważyć samodzielnie."
              : "Utrzymanie lub obciążenie tygodnia ogranicza podwyżkę. Sama mniejsza liczba serii nie wymaga mniejszego ciężaru.",
    );
  const required = ctx.age < 18 || ctx.mode === "foundation" ? 3 : 2;
  const recent = ordered.slice(0, required);
  const comparable =
    recent.length === required &&
    new Set(recent.map((s) => s.sessionKey)).size === required &&
    new Set(recent.map(dateOf)).size === required &&
    recent.every(
      (s) =>
        validDate(dateOf(s)) &&
        dateOf(s) < ctx.asOfDate &&
        dayDistance(ctx.asOfDate, dateOf(s)) <= 28 &&
        complete(s) &&
        s.verification?.phase !== "reduced" &&
        s.verification?.prescriptionKey === exercisePrescriptionKey(e) &&
        s.verification.expectedSets === plannedExerciseSets(e) &&
        s.sets.every(
          (x) =>
            x.weightKg === weight &&
            x.reps! >= target.max &&
            finite(x.rir) &&
            x.rir >= target.rir + 1,
        ),
    );
  if (!comparable)
    return hold(
      weight,
      "Brak kolejnych pełnych ekspozycji na tej samej dawce z dodatkowym zapasem. Utrzymanie ciężaru jest prawidłową decyzją.",
    );
  const next = weightStep(
    weight,
    "up",
    ctx.age < 18 || ctx.mode === "power_support" ? 0.025 : 0.05,
    ctx,
  );
  if (next === undefined)
    return hold(
      weight,
      "Najmniejszy znany skok sprzętu byłby za duży. Utrzymaj ciężar; nie przeskakuj do przypadkowego obciążenia.",
    );
  return advice(
    "increase",
    `Propozycja: ${next} kg`,
    "Kolejne pełne porównywalne sesje z dodatkowym zapasem. Zmień tylko ciężar, dobierając rzeczywiście dostępny sprzęt; bez dokładania serii.",
    next,
  );
}

/** Negative feedback may lower the next set immediately; one easy set never raises it. */
export function nextSetLoadAdvice(
  e: TrainingExercise,
  previous: HistorySetLog | undefined,
  ctx: StrengthLoadContext,
): ProgressionAdvice | null {
  if (
    !previous ||
    !finite(previous.weightKg) ||
    previous.weightKg <= 0 ||
    ["explosive", "hold", "easy"].includes(e.engineDose?.intent ?? "") ||
    e.engineDose?.seconds !== undefined ||
    e.duration ||
    e.engineDose?.cluster ||
    ctx.date !== ctx.asOfDate
  )
    return null;
  const target = targets(e);
  if (
    !target.min ||
    !finite(target.rir) ||
    !Number.isInteger(previous.reps) ||
    previous.reps! < 0 ||
    (previous.rir !== null && (!finite(previous.rir) || previous.rir < 0 || previous.rir > 10))
  )
    return null;
  if (
    previous.reps! < target.min ||
    (finite(previous.rir) && target.rir >= 2 && previous.rir <= target.rir - 2)
  )
    return drop(
      previous.weightKg,
      0.05,
      ctx,
      "Ostatnia seria nie utrzymała wymaganej dawki lub zapasu. Po pełnej przerwie oceń mniejszy ciężar następnej serii; nie dodawaj prób na odrobienie.",
    );
  return null;
}
