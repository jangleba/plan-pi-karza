import type { Equipment } from "../profile";
import type { AthleteContext, ExerciseVariant, SetupOption, Unlock } from "./types";

/**
 * Jedna kwalifikacja dla generowania, adaptacji z check-inu, dodania, zamiany i zmiany wariantu.
 * Założenia produktu (jawne, do przeglądu): profil „gym” daje standardową siłownię, „field/track” – boisko i znaczniki,
 * „bodyweight” – ścianę, matę, podparcie i stabilne podwyższenie. Podłoga, strefa lądowania, kawałek płaskiego miejsca do biegu i stożki są bazą (decyzja produktu: sprint i COD działają zawsze).
 * Wszystko inne (guma z kotwą, ślizgacze, trap bar, partner, nadzór) trzeba zadeklarować – nie dopisujemy tego zawodnikowi.
 */
export const BASE_ENV = ["suitable_floor", "non_slip_floor", "clear_landing_zone", "clear_floor_space", "compatible_floor", "suitable_runway", "suitable_open_area", "suitable_open_runway", "marked_runway", "measured_runway"];
const BASE_EQ = ["wall", "mat", "hand_support", "stable_support", "stable_platform", "markers", "timer"];
const GYM_EQ = ["barbell", "rack", "safeties", "bench", "dumbbell", "dumbbells", "kettlebell", "cable_station", "rope_attachment", "box", "hurdle", "band", "rated_anchor", "sliders", "knee_pad", "landing_pad", "rated_low_bar", "rated_pull_up_bar", "stable_bench"];
const GYM_ENV = ["clear_lifting_zone", "clear_swing_zone"];
const FIELD_EQ = ["markers", "timer"];
const FIELD_ENV = ["suitable_runway", "suitable_open_area", "suitable_open_runway", "marked_runway", "measured_runway"];

export function availableTokens(equipment: Equipment[], declared: AthleteContext["declared"]) {
  const eq = new Set<string>([...BASE_EQ, ...declared.equipment]);
  const env = new Set<string>([...BASE_ENV, ...declared.environment]);
  if (equipment.includes("gym")) { GYM_EQ.forEach((t) => eq.add(t)); GYM_ENV.forEach((t) => env.add(t)); }
  if (equipment.includes("field") || equipment.includes("track")) { FIELD_EQ.forEach((t) => eq.add(t)); FIELD_ENV.forEach((t) => env.add(t)); }
  return { eq, env, people: new Set(declared.people) };
}

export type QualCode =
  | "not_published" | "incomplete_content" | "age" | "no_setup" | "missing_prerequisite"
  | "supervision_required" | "familiarity_required" | "user_avoided";
export type Qualification =
  | { ok: true }
  | { ok: false; code: QualCode; messagePl: string; missing?: string[]; unlock?: Unlock };

/** Źródła, które wolno uznać za potwierdzenie danego wymagania. Samoocena nie wystarcza na przeszkolenie specjalisty. */
function acceptable(code: string, source: string): boolean {
  if (code.startsWith("qualified_instruction")) return source === "previously_trained" || source === "coach_assessed";
  if (code.startsWith("familiar_")) return true;
  return source !== "performed_in_app" || code.startsWith("controlled_") || code.startsWith("learned_");
}

export function missingPrerequisites(v: ExerciseVariant, ctx: AthleteContext): string[] {
  return v.prerequisites.filter((p) => {
    const c = ctx.competences[p];
    return !(c && acceptable(p, c.source));
  });
}

/** Najmniej brakujących elementów spośród pełnych konfiguracji (jedna pełna wystarczy). */
export function bestSetup(v: ExerciseVariant, ctx: AthleteContext): { ok: boolean; missing: string[]; option?: SetupOption } {
  const t = availableTokens(ctx.equipment, ctx.declared);
  let best: { ok: boolean; missing: string[]; option?: SetupOption } | null = null;
  for (const o of v.setupOptions) {
    const missing = [
      ...o.equipmentAllOf.filter((x) => !t.eq.has(x)),
      ...o.environmentAllOf.filter((x) => !t.env.has(x)),
      ...o.people.filter((x) => !t.people.has(x)),
    ];
    if (missing.length === 0) return { ok: true, missing: [], option: o };
    if (!best || missing.length < best.missing.length) best = { ok: false, missing, option: o };
  }
  return best ?? { ok: true, missing: [] };
}

export function qualify(v: ExerciseVariant, ctx: AthleteContext, opts: { ignorePrefs?: boolean } = {}): Qualification {
  if (v.reviewStatus !== "published" && v.reviewStatus !== "reviewed")
    return { ok: false, code: "not_published", messagePl: "To ćwiczenie jest jeszcze w przeglądzie, więc nie trafia do planu." };
  if (v.contentStatus !== "complete")
    return { ok: false, code: "incomplete_content", messagePl: "Brakuje opisu i materiału tego ćwiczenia, więc nie trafia do planu." };
  if (ctx.age < v.minimumAge)
    return { ok: false, code: "age", messagePl: `Ćwiczenie od ${v.minimumAge}. roku życia.` };
  const s = bestSetup(v, ctx);
  if (!s.ok) {
    const people = s.option?.people.filter((p) => s.missing.includes(p)) ?? [];
    return { ok: false, code: "no_setup", missing: s.missing, messagePl: people.length ? "Potrzebna osoba do pomocy – nie zakładamy jej bez zgłoszenia." : "Brakuje sprzętu lub miejsca do tego ćwiczenia.", unlock: people.length ? undefined : { kind: "gear", tokens: s.missing, variantId: v.id } };
  }
  if (v.supervision === "qualified_required" && !ctx.qualifiedSupervision)
    return { ok: false, code: "supervision_required", messagePl: "To ćwiczenie wymaga bieżącego nadzoru wykwalifikowanej osoby.", unlock: { kind: "supervision", tokens: [], variantId: v.id } };
  if (v.supervision === "qualified_required") {
    const needCoach = v.prerequisites.filter((p) => ctx.competences[p]?.source !== "coach_assessed" && ctx.competences[p]?.source !== "previously_trained" && p.startsWith("qualified_instruction"));
    if (needCoach.length) return { ok: false, code: "missing_prerequisite", missing: needCoach, messagePl: "Potrzebne przeszkolenie lub ocena trenera.", unlock: { kind: "competence", tokens: needCoach, variantId: v.id } };
  }
  const miss = missingPrerequisites(v, ctx);
  if (miss.length)
    return { ok: false, code: "missing_prerequisite", missing: miss, messagePl: "Nie potwierdzono, że opanowałeś(-aś) wymagane elementy.", unlock: { kind: "competence", tokens: miss, variantId: v.id } };
  if (v.familiarityRequired && !ctx.familiarVariants.includes(v.id))
    return { ok: false, code: "familiarity_required", messagePl: "Najpierw wykonaj łatwiejszy wariant tego ruchu." };
  if (!opts.ignorePrefs && ctx.prefs[v.id]?.mode === "avoid")
    return { ok: false, code: "user_avoided", messagePl: "Wybrano wcześniej zmianę tego ćwiczenia." };
  return { ok: true };
}

/** Rozdziela brakujące elementy na sprzęt, środowisko i osoby (do zapisu deklaracji zawodnika). */
export function splitTokens(v: ExerciseVariant, tokens: string[]): { equipment: string[]; environment: string[]; people: string[] } {
  const env = new Set(v.setupOptions.flatMap((o) => o.environmentAllOf));
  const people = new Set(v.setupOptions.flatMap((o) => o.people));
  return { environment: tokens.filter((t) => env.has(t)), people: tokens.filter((t) => people.has(t)), equipment: tokens.filter((t) => !env.has(t) && !people.has(t)) };
}
