import type { PlanWeek, PlanSession, PlanDay, ExerciseItem } from "@/lib/loadwise/types";
import { dayName, parseIso } from "@/lib/loadwise/labels";

/** Kategoria ćwiczenia siłowego pokazywana jako badge. */
export type GymExerciseCategory =
  | "Strength"
  | "Power"
  | "Isometric"
  | "Accessory"
  | "Rehab"
  | "Core";

/** Sygnał zapisywany po analizie — nigdy nie zmienia planu automatycznie. */
export type GymTechniqueSignal =
  | "technique_issue"
  | "coach_confirmed_issue"
  | "invalid_execution"
  | "good_execution";

/** Pojedyncze ćwiczenie z aktualnego planu, gotowe do analizy techniki. */
export interface GymPlanExercise {
  /** Stabilny klucz w obrębie tygodnia (data + sesja + ćwiczenie). */
  key: string;
  exerciseName: string;
  goal: string;
  prescription: string | null;
  rest: string | null;
  date: string;
  trainingDayLabel: string;
  sessionTitle: string;
  sessionType: string;
  category: GymExerciseCategory;
}

/** Czy sesja to jednostka gym / strength / power / rehab / prehab. */
function isGymSession(session: PlanSession): boolean {
  const cls = session.source?.classification;
  if (cls) {
    if (cls.isGym || cls.countsAsStrength || cls.isPrehab) return true;
  }
  return (
    session.type === "strength_power" ||
    session.type === "prehab_mobility"
  );
}

/** Heurystyka kategorii ćwiczenia na podstawie nazwy i typu sesji. */
export function categorizeGymExercise(
  name: string,
  sessionType: string,
): GymExerciseCategory {
  const n = name.toLowerCase();
  if (/(core|plank|dead\s?bug|pallof|anti-|brzuch|deska|rotac)/.test(n)) return "Core";
  if (/(izome|isome|nordic|copenhagen|overcoming|hold|utrzym)/.test(n)) return "Isometric";
  if (/(rehab|prehab|mobil|band|opaska|stabil|balans|balance)/.test(n))
    return "Rehab";
  if (
    /(jump|skok|throw|rzut|plyo|hop|bound|pogo|snap|clean|snatch|power|moc|explos|eksplo)/.test(
      n,
    )
  )
    return "Power";
  if (
    /(squat|przysiad|deadlift|martwy|rdl|hinge|hip\s?thrust|lunge|wykrok|split|press|wyciska|row|wioslo|pull|podciag|calf|lydk|bench)/.test(
      n,
    )
  )
    return "Strength";
  if (sessionType === "prehab_mobility") return "Rehab";
  if (sessionType === "strength_power") return "Strength";
  return "Accessory";
}

function collectFromDay(day: PlanDay): GymPlanExercise[] {
  const out: GymPlanExercise[] = [];
  const dayLabel = dayName(parseIso(day.date));
  day.sessions.forEach((session, si) => {
    if (!isGymSession(session)) return;
    (session.exercises ?? []).forEach((ex: ExerciseItem, ei) => {
      if (!ex?.name) return;
      out.push({
        key: `${day.date}::${si}::${ei}::${ex.name}`,
        exerciseName: ex.name,
        goal: ex.cue ?? session.title,
        prescription: ex.prescription ?? null,
        rest: ex.rest ?? null,
        date: day.date,
        trainingDayLabel: dayLabel,
        sessionTitle: session.title,
        sessionType: session.type,
        category: categorizeGymExercise(ex.name, session.type),
      });
    });
  });
  return out;
}

/** Zwraca wszystkie ćwiczenia siłowe z podanego (aktualnego) tygodnia planu. */
export function getGymExercisesFromWeek(week: PlanWeek | null): GymPlanExercise[] {
  if (!week) return [];
  const out: GymPlanExercise[] = [];
  for (const day of week.days) {
    if (day.outsideActivePlan) continue;
    out.push(...collectFromDay(day));
  }
  return out;
}

/** Wyszukuje ćwiczenie po kluczu w tygodniu. */
export function findGymExercise(
  week: PlanWeek | null,
  key: string,
): GymPlanExercise | null {
  return getGymExercisesFromWeek(week).find((e) => e.key === key) ?? null;
}
