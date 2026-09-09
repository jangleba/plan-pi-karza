import type { TrainingExercise } from "@/lib/loadwise/types";

/** Rodzaj pomiaru wykonania serii. */
export type MetricKind = "load" | "time" | "distance" | "contacts" | "hold";

export interface MetricField {
  id: "weight" | "reps" | "rir" | "value";
  label: string;
  suffix?: string;
  step?: number;
}

/** Deterministyczny typ pomiaru wynikający z danych ćwiczenia. */
export function metricKindForExercise(e: TrainingExercise): MetricKind {
  const text = `${e.name} ${e.displayPrescription ?? ""} ${e.reps ?? ""} ${e.duration ?? ""}`;
  if (/deska|plank|izometr|utrzyman|hold|wall sit/i.test(text)) return "hold";
  if (typeof e.groundContacts === "number" && e.groundContacts > 0) return "contacts";
  if (/skok|jump|podskok|hop|bound/i.test(e.name)) return "contacts";
  if (/\b\d+\s?m\b|sprint|biegi|dystans/i.test(text)) return "distance";
  if (!e.reps && (e.duration || /\b\d+\s?s\b|min/i.test(text))) return "time";
  return "load";
}

export function fieldsForMetric(kind: MetricKind): MetricField[] {
  switch (kind) {
    case "time":
      return [{ id: "value", label: "Czas", suffix: "s", step: 1 }];
    case "hold":
      return [{ id: "value", label: "Utrzymanie", suffix: "s", step: 1 }];
    case "distance":
      return [{ id: "value", label: "Dystans", suffix: "m", step: 1 }];
    case "contacts":
      return [
        { id: "value", label: "Kontakty", step: 1 },
        { id: "rir", label: "RIR", step: 1 },
      ];
    case "load":
    default:
      return [
        { id: "weight", label: "Ciężar", suffix: "kg", step: 2.5 },
        { id: "reps", label: "Powt.", step: 1 },
        { id: "rir", label: "RIR", step: 1 },
      ];
  }
}

export function metricUnit(kind: MetricKind): string {
  if (kind === "distance") return "m";
  if (kind === "time" || kind === "hold") return "s";
  if (kind === "contacts") return "kontaktów";
  return "";
}
