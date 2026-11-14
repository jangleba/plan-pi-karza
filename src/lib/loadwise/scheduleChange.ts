import { getAllEquipmentDefinitions, resolveEquipmentId } from "./exerciseLibrary";
import type { PlanInputsSnapshot, Profile, SessionDay } from "./types";

const DAYS = ["", "Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];
const days = (list: readonly number[]) =>
  list.length ? list.map((d) => DAYS[d]).join(", ") : "brak";
const dates = (list: readonly string[]) =>
  list.length ? list.map((d) => `${Number(d.slice(8))}.${d.slice(5, 7)}`).join(", ") : "brak";
const same = <T>(a: readonly T[], b: readonly T[]) =>
  a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);
const equipmentName = (value: string) =>
  getAllEquipmentDefinitions().find((e) => e.id === (resolveEquipmentId(value) ?? value))
    ?.displayName ?? value;

export interface ScheduleChange {
  kind: "match" | "days" | "club" | "minutes" | "equipment";
  line: string;
}

/**
 * What changed between the inputs a saved plan was built from and the profile now. Only
 * schedule inputs are named; a plan saved before inputs were recorded yields no named change.
 */
export function describeScheduleChanges(
  saved: PlanInputsSnapshot | undefined,
  profile: Profile,
  minutesPerSession: number,
  todayIso?: string,
): ScheduleChange[] {
  if (!saved) return [];
  const out: ScheduleChange[] = [];
  const upcoming = (list: readonly string[]) =>
    todayIso ? list.filter((d) => d >= todayIso) : list;
  const matchesNow = [...(profile.matchDates ?? [])].sort();
  if (!same(upcoming(saved.matchDates), upcoming(matchesNow)))
    out.push({
      kind: "match",
      line: `Terminy meczów: ${dates(upcoming(saved.matchDates))} → ${dates(upcoming(matchesNow))}.`,
    });
  if (
    !same(saved.individualTrainingDays, profile.individualTrainingDays) ||
    !same(saved.unavailableDays, profile.unavailableDays ?? [])
  )
    out.push({
      kind: "days",
      line: `Dni własnych treningów: ${days(saved.individualTrainingDays)} → ${days(profile.individualTrainingDays)}.`,
    });
  if (!same(saved.clubTrainingDays, profile.clubTrainingDays))
    out.push({
      kind: "club",
      line: `Dni treningów klubowych: ${days(saved.clubTrainingDays)} → ${days(profile.clubTrainingDays)}.`,
    });
  if (saved.minutesPerSession !== minutesPerSession)
    out.push({
      kind: "minutes",
      line: `Czas na jednostkę: ${saved.minutesPerSession} → ${minutesPerSession} min.`,
    });
  const lost = [
    ...saved.equipment.filter((e) => !profile.equipment.includes(e)),
    ...(profile.unavailableEquipmentIds ?? []).filter(
      (e) => !saved.unavailableEquipmentIds.includes(e),
    ),
  ];
  const gained = profile.equipment.filter((e) => !saved.equipment.includes(e));
  if (lost.length || gained.length)
    out.push({
      kind: "equipment",
      line: `Sprzęt: ${[...lost.map((e) => `brak ${equipmentName(e)}`), ...gained.map((e) => `dodano ${equipmentName(e)}`)].join(", ")}.`,
    });
  return out;
}

const own = (d: SessionDay) =>
  [d, ...(d.secondSession ? [d.secondSession] : [])]
    .filter((s) => s.engineV2)
    .map((s) => `${s.title} (${s.durationMin} min)`);

/** Next days of the saved plan against the preview: only dates whose own sessions differ. */
export function windowDiff(
  before: readonly SessionDay[],
  after: readonly SessionDay[],
  fromIso: string,
  horizonDays = 7,
): Array<{ date: string; before: string; after: string }> {
  const end = new Date(`${fromIso}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + horizonDays - 1);
  const last = end.toISOString().slice(0, 10);
  const out: Array<{ date: string; before: string; after: string }> = [];
  for (const d of after) {
    if (d.date < fromIso || d.date > last) continue;
    const old = before.find((x) => x.date === d.date);
    const b = (old ? own(old) : []).join(" + ") || "wolne";
    const a = own(d).join(" + ") || "wolne";
    if (a !== b) out.push({ date: d.date, before: b, after: a });
  }
  return out;
}
