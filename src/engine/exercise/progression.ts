import { suggestNext, stepFor, type Choice, type Completion, type Suggestion } from "../progress";
import type { Strain } from "../adapt";
import type { ExerciseState } from "./history";
import { VARIANTS } from "./variants";

export type Axis = "load" | "reps" | "hold_time" | "contacts" | "distance" | "entry_speed" | "none";
export interface ProgressionSuggestion { axis: Axis; textPl: string; options: Choice[]; kg?: Suggestion }

const OPTIONS_STAY: Choice[] = ["stay", "lower", "swap", "skip"];

/**
 * Sugestia kolejnej dawki dla JEDNEGO wariantu, na jednej osi naraz (konserwatywna polityka automatyczna).
 * Zwiększenie pada tylko po potwierdzonym wykonaniu wszystkich powtórzeń, bez obciążenia z check-inu i poza rozładowaniem –
 * i nigdy nie jest nakazem: zawsze można zostać, obniżyć, zmienić ćwiczenie albo pominąć.
 * Potwierdzenie planowanych powtórzeń nie dowodzi dojścia do granicy możliwości, więc nie liczymy z tego maksimum.
 */
export function suggestProgression(state: ExerciseState, variantId: string, ctx: { strain: Strain; deload: boolean }): ProgressionSuggestion {
  const v = VARIANTS[variantId];
  const last = [...state.events].reverse().find((e) => e.exerciseId === variantId && e.variantVersion === (v?.version ?? 1));
  if (!v || !last) return { axis: "none", textPl: "Brak zapisu wykonania tego wariantu – zaczynamy od planu.", options: OPTIONS_STAY };
  const completion: Completion | undefined = last.completion;
  const rx = v.allowedPrescriptionTypes[0];
  const axis: Axis = rx === "strength" ? (v.loaded ? "load" : "reps") : rx === "isometric" ? "hold_time" : rx === "plyometric" ? "contacts" : rx === "sprint" ? "distance" : rx === "cod" ? "entry_speed" : "none";
  if (axis === "load") {
    if (last.loadConvention === "unknown" || !last.performed?.kg)
      return { axis, textPl: "Nie wiemy, jak zapisano ciężar (łącznie, na hantel, dodatkowo do masy ciała). Ustal to, zanim zaproponujemy zmianę – ciężar zostaje.", options: OPTIONS_STAY };
    const kg = suggestNext(variantId, last.performed.kg, ctx.strain, ctx.deload, completion);
    return { axis, textPl: kg?.text ?? "Ciężar bez zmian.", options: kg?.options ?? OPTIONS_STAY, ...(kg ? { kg } : {}) };
  }
  if (completion !== "all") return { axis, textPl: "Nie potwierdzono pełnego wykonania – dawka bez zmian.", options: OPTIONS_STAY };
  if (ctx.strain !== "none" || ctx.deload) return { axis, textPl: "Dziś lżej lub tydzień rozładowania – dawka bez zmian.", options: OPTIONS_STAY };
  const what: Record<Axis, string> = { load: "", reps: "o jedno powtórzenie więcej", hold_time: "o kilka sekund dłużej", contacts: "o kilka kontaktów więcej", distance: "o kilka metrów dłuższy odcinek", entry_speed: "nieco większą prędkość wejścia", none: "" };
  return { axis, textPl: `Możesz spróbować ${what[axis]} (ostrożna propozycja – zmieniamy tylko jedną rzecz naraz).`, options: ["raise", ...OPTIONS_STAY] };
}
export { stepFor };
