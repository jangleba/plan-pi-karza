import { getTrainingMethod, isTrainingMethodId } from "./catalogue";
import type { TrainingMethodPreferences } from "./types";

/** Zapisane w profilu preferencje metod (dane profilu, nie układanie treningu). */
export const METHOD_SPECIAL_EQUIPMENT = [
  "flywheel",
  "fixed_pins",
  "assistance_rig",
  "velocity_device",
  "chains",
  "hill",
  "sled",
  "flat_markers",
] as const;
export function normalizeMethodPreferences(raw: unknown): TrainingMethodPreferences {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>,
    out: TrainingMethodPreferences = {};
  if (
    ["auto", "acceleration", "max_velocity", "curve", "braking", "planned_cod"].includes(
      String(r.sprintFocus),
    )
  )
    out.sprintFocus = r.sprintFocus as TrainingMethodPreferences["sprintFocus"];
  if (r.coachedIsometricPrimer === true) out.coachedIsometricPrimer = true;
  if (r.activationLocation === "field" || r.activationLocation === "gym")
    out.activationLocation = r.activationLocation;
  if (["general", "hip", "ankle", "thoracic"].includes(String(r.mobilityFocus)))
    out.mobilityFocus = r.mobilityFocus as TrainingMethodPreferences["mobilityFocus"];
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
