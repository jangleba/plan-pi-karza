import type { Profile, SessionDay } from "../types";
import { buildAthleteTrainingProfile } from "../athleteProfile";
import { resolveEquipmentId } from "../exerciseLibrary";
import { getTrainingMethod, isTrainingMethodId } from "./catalogue";
import type {
  MethodEligibility,
  MethodSessionConditions,
  TrainingMethodId,
  TrainingMethodPreferences,
} from "./types";

export const METHOD_SPECIAL_EQUIPMENT = [
  "flywheel",
  "fixed_pins",
  "assistance_rig",
  "velocity_device",
  "chains",
  "hill",
] as const;
const rank = (value: string | undefined, order: string[]) =>
  Math.max(0, order.indexOf(value ?? ""));
export function normalizeMethodPreferences(raw: unknown): TrainingMethodPreferences {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>,
    out: TrainingMethodPreferences = {};
  if (["auto", "linear", "undulating"].includes(String(r.periodization)))
    out.periodization = r.periodization as TrainingMethodPreferences["periodization"];
  for (const key of ["strength", "conditioning", "sprint"] as const) {
    const value = r[key],
      method = getTrainingMethod(String(value));
    const domains = key === "strength" ? ["strength", "power"] : [key];
    if (
      value === "auto" ||
      (isTrainingMethodId(value) && method?.role === "workout" && domains.includes(method.domain))
    )
      out[key] = value;
  }
  if (
    typeof r.spaceLengthM === "number" &&
    Number.isFinite(r.spaceLengthM) &&
    r.spaceLengthM >= 10 &&
    r.spaceLengthM <= 500
  )
    out.spaceLengthM = Math.floor(r.spaceLengthM);
  if (Array.isArray(r.declaredEquipment))
    out.declaredEquipment = [
      ...new Set(
        r.declaredEquipment.filter(
          (v): v is string =>
            typeof v === "string" && (METHOD_SPECIAL_EQUIPMENT as readonly string[]).includes(v),
        ),
      ),
    ].slice(0, 6);
  return out;
}
export function normalizeMethodConditions(raw: unknown): MethodSessionConditions {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>,
    c: MethodSessionConditions = {};
  if (r.coachPresent === true) c.coachPresent = true;
  if (r.validatedVelocityDevice === true) c.validatedVelocityDevice = true;
  if (
    typeof r.participants === "number" &&
    Number.isInteger(r.participants) &&
    r.participants >= 1 &&
    r.participants <= 22
  )
    c.participants = r.participants;
  if (
    typeof r.spaceLengthM === "number" &&
    Number.isFinite(r.spaceLengthM) &&
    r.spaceLengthM >= 10 &&
    r.spaceLengthM <= 500
  )
    c.spaceLengthM = Math.floor(r.spaceLengthM);
  if (Array.isArray(r.equipment))
    c.equipment = [
      ...new Set(
        r.equipment.filter(
          (x): x is string =>
            typeof x === "string" &&
            ((METHOD_SPECIAL_EQUIPMENT as readonly string[]).includes(x) ||
              !!resolveEquipmentId(x)),
        ),
      ),
    ].slice(0, 24);
  return c;
}
export function methodEquipment(
  profile: Profile,
  conditions: MethodSessionConditions = {},
): Set<string> {
  const basic = profile.hasGym
    ? [
        "barbell",
        "trap_bar",
        "rack",
        "band",
        "cable",
        "dumbbell",
        "kettlebell",
        "bench",
        "box",
        "platform",
        "swiss_ball",
        "med_ball",
        "sliders",
        "nordic_setup",
        "machine",
      ]
    : [];
  const entries = [
    ...basic,
    ...(profile.equipment ?? []),
    ...(profile.homeEquipment ?? []),
    ...(profile.trainingMethodPreferences?.declaredEquipment ?? []),
    ...(conditions.equipment ?? []),
  ];
  const gear = new Set(entries.map((x) => resolveEquipmentId(x) ?? x));
  for (const x of profile.unavailableEquipmentIds ?? []) gear.delete(x);
  return gear;
}
export function trainingMethodEligibility(
  id: TrainingMethodId,
  profile: Profile,
  session?: Pick<SessionDay, "mdLabel" | "dayType" | "externalCommitment" | "loadLabelOverride"> &
    Partial<
      Pick<
        SessionDay,
        "blockPhaseLabel" | "blockWeekNumber" | "readinessAdjustedDate" | "readinessAdjustmentKey"
      >
    >,
  rawConditions: MethodSessionConditions = {},
): MethodEligibility {
  const m = getTrainingMethod(id),
    reasons: string[] = [],
    conditions = normalizeMethodConditions(rawConditions);
  if (!m) return { allowed: false, reasons: ["Nieznana metoda."] };
  if (m.role !== "workout") return { allowed: true, reasons: [] };
  const a = buildAthleteTrainingProfile(profile),
    gear = methodEquipment(profile, conditions);
  if (
    profile.painInjury ||
    profile.seasonPhase === "return_injury" ||
    session?.loadLabelOverride === "Wstrzymaj trening"
  )
    reasons.push("Aktualne ograniczenia mają pierwszeństwo przed wyborem metody.");
  // A method choice must not restore work removed by today's check-in. Healthy
  // check-ins (8–10, no severe signal) leave the normal choice available.
  if (session?.readinessAdjustedDate) {
    let unrestricted = false;
    try {
      const r = JSON.parse(session.readinessAdjustmentKey ?? "null");
      unrestricted =
        r &&
        typeof r.overall === "number" &&
        r.overall >= 8 &&
        r.overall <= 10 &&
        typeof r.sleep === "number" &&
        r.sleep > 2 &&
        typeof r.fatigue === "number" &&
        r.fatigue < 9 &&
        typeof r.soreness === "number" &&
        r.soreness < 9 &&
        typeof r.jointPain === "number" &&
        r.jointPain < 4 &&
        !r.altersMovement &&
        !r.redFlags?.length;
    } catch {
      /* Missing or invalid context must not unlock a full rebuild. */
    }
    if (!unrestricted)
      reasons.push(
        "Po dzisiejszej korekcie zachowaj dopasowaną dawkę; zmiana metody nie może odtworzyć pełnego treningu.",
      );
  }
  if (
    ["M09", "M10"].includes(id) &&
    (/deload|odciąż|konsolid|świeżość|kalibr|adapt|wprowad/i.test(session?.blockPhaseLabel ?? "") ||
      session?.blockWeekNumber === 4)
  )
    reasons.push("W etapie wprowadzającym lub odciążeniu wybierz osobne serie zamiast kontrastu.");
  if (
    session &&
    (session.dayType === "club" || session.dayType === "match" || session.externalCommitment)
  )
    reasons.push("To zewnętrzny trening lub mecz; metoda nie zastępuje jego treści.");
  if (m.minAge && (a.age === null || a.age < m.minAge))
    reasons.push(`Ta metoda w BallWise wymaga wieku co najmniej ${m.minAge} lat.`);
  if (m.minMonths && (a.strengthTrainingAge ?? 0) < m.minMonths)
    reasons.push(
      `Uzupełnij staż; ta metoda wymaga co najmniej ${m.minMonths} miesięcy regularnego treningu siłowego.`,
    );
  if (
    m.minGymLevel &&
    rank(a.gymExperienceLevel, ["none", "beginner", "intermediate", "advanced"]) <
      rank(m.minGymLevel, ["none", "beginner", "intermediate", "advanced"])
  )
    reasons.push("Potrzebne jest większe doświadczenie siłowe.");
  if (
    m.minCompetence &&
    rank(a.movementCompetenceLevel, ["low", "medium", "high"]) <
      rank(m.minCompetence, ["low", "medium", "high"])
  )
    reasons.push("Najpierw utrwal kontrolę podstawowych ruchów.");
  if (m.requiresCoach && (profile.supervisionLevel !== "full" || !conditions.coachPresent))
    reasons.push("Potrzebny jest trener prowadzący tę sesję; potwierdź jego obecność.");
  if (a.age !== null && a.age < 18 && m.minGymLevel && profile.supervisionLevel !== "full")
    reasons.push("Ta praca siłowa osoby niepełnoletniej wymaga pełnego nadzoru trenera.");
  for (const equipment of m.equipment ?? [])
    if (!gear.has(equipment)) reasons.push(`Potrzebny sprzęt: ${equipment}.`);
  if (m.anyEquipment?.length && !m.anyEquipment.some((e) => gear.has(e)))
    reasons.push(
      id === "M20"
        ? "Potrzebne są sanie, bezpiecznie użyta guma albo potwierdzony podbieg."
        : "Potrzebny jest dostępny opór zewnętrzny, np. sztanga lub hantle.",
    );
  if (
    id === "M20" &&
    !gear.has("sled") &&
    !gear.has("hill") &&
    gear.has("band") &&
    (conditions.participants ?? 1) < 2
  )
    reasons.push("Sprint z oporem gumy wymaga partnera kontrolującego opór.");
  const space = conditions.spaceLengthM ?? profile.trainingMethodPreferences?.spaceLengthM;
  if (m.minSpaceM && (space === undefined || space < m.minSpaceM))
    reasons.push(`Potwierdź co najmniej ${m.minSpaceM} m wolnej przestrzeni wraz z wyhamowaniem.`);
  if (m.minParticipants && (conditions.participants ?? 1) < m.minParticipants)
    reasons.push(`Zadanie wymaga co najmniej ${m.minParticipants} osób.`);
  if (m.requiresVelocityDevice && !conditions.validatedVelocityDevice)
    reasons.push(
      "Potrzebny jest sprawdzony pomiar prędkości z urządzenia; telefon nie zastępuje pomiaru.",
    );
  if (
    ["M03", "M04", "M06", "M08", "M11"].includes(id) &&
    ["MD-2", "MD-1", "MD", "MD+1"].includes(session?.mdLabel ?? "")
  )
    reasons.push(
      "Blisko meczu zachowaj prostą dawkę przygotowawczą zamiast dodatkowej wymagającej pracy nóg.",
    );
  // MD-3 alone is not a reason to simplify: the remaining context (club volume,
  // block phase, other sessions) decides. Closer to and right after a match stays simple.
  if (m.highCost && ["MD-2", "MD-1", "MD", "MD+1", "MD+2"].includes(session?.mdLabel ?? ""))
    reasons.push("W tym miejscu względem meczu wybierz lżejszą metodę.");
  if (m.highCost && (profile.clubTrainingDays ?? []).length >= 4)
    reasons.push("Przy czterech treningach klubowych zachowujemy prostszą dawkę dodatkową.");
  return { allowed: reasons.length === 0, reasons };
}
