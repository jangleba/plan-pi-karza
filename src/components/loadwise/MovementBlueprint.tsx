import type { TrainingExercise } from "@/lib/loadwise/types";
import { ImageOff } from "lucide-react";

import highBarSquat from "@/assets/blueprints/high_bar_squat.png";
import nordicHamstring from "@/assets/blueprints/nordic_hamstring.png";
import hamstringSliderCurl from "@/assets/blueprints/hamstring_slider_curl.png";
import sprintAcceleration from "@/assets/blueprints/sprint_acceleration.png";
import bounds from "@/assets/blueprints/bounds.png";
import deceleration from "@/assets/blueprints/deceleration.png";
import pallofPress from "@/assets/blueprints/pallof_press.png";
import deadBug from "@/assets/blueprints/dead_bug.png";
import backSquat from "@/assets/blueprints/back_squat.png";
import gobletSquat from "@/assets/blueprints/goblet_squat.png";
import rdl from "@/assets/blueprints/rdl.png";
import splitSquat from "@/assets/blueprints/split_squat.png";
import cmj from "@/assets/blueprints/cmj.png";
import broadJump from "@/assets/blueprints/broad_jump.png";
import changeOfDirection from "@/assets/blueprints/change_of_direction.png";
import copenhagenPlank from "@/assets/blueprints/copenhagen_plank.png";
import calfRaise from "@/assets/blueprints/calf_raise.png";
import pogoJump from "@/assets/blueprints/pogo_jump.png";
import maxVelocitySprint from "@/assets/blueprints/max_velocity_sprint.png";
import pinIsoAnkle from "@/assets/blueprints/pin_iso_ankle.png";
import pinIsoFullFoot from "@/assets/blueprints/pin_iso_full_foot.png";
import facePull from "@/assets/blueprints/face_pull.png";
import frontSquat from "@/assets/blueprints/front_squat.png";
import trapBarHighPin from "@/assets/blueprints/trap_bar_high_pin.png";
import medBallHipThrow from "@/assets/blueprints/med_ball_hip_throw.png";
import birdDog from "@/assets/blueprints/bird_dog.png";
import sidePlank from "@/assets/blueprints/side_plank.png";
import kettlebellSwing from "@/assets/blueprints/kettlebell_swing.png";
import razorCurl from "@/assets/blueprints/razor_curl.png";
import longLeverBridgeIso from "@/assets/blueprints/long_lever_bridge_iso.png";
import bandBroadJump from "@/assets/blueprints/band_broad_jump.png";
import fallingStart from "@/assets/blueprints/falling_start.png";

/**
 * System grafik ćwiczeń — TWARDE mapowanie 1:1.
 *
 * ZASADA NADRZĘDNA: jedno ćwiczenie = jedna dedykowana grafika.
 * Grafika jest pobierana WYŁĄCZNIE po jednoznacznym visualId, a to z kolei
 * po DOKŁADNEJ (znormalizowanej) nazwie ćwiczenia zapisanej w `exerciseNames`.
 *
 * NIE MA fallbacku „najbardziej podobne ćwiczenie", NIE MA dopasowań po
 * kategorii, kolejności czy heurystyce słów kluczowych. Jeśli ćwiczenie nie
 * jest jawnie zapisane do grafiki → pokazujemy placeholder, nigdy cudzą grafikę.
 */

export type MovementType =
  | "squat"
  | "hinge"
  | "lunge"
  | "pull"
  | "jump"
  | "sprint"
  | "core"
  | "isometric"
  | "calf";

export interface ExerciseVisual {
  /** Jednoznaczny identyfikator grafiki. */
  visualId: string;
  /** Zaimportowany plik grafiki. */
  src: string;
  /** Tytuł grafiki (do alt/aria). */
  title: string;
  /** Typ ruchu — metadana walidacyjna. */
  movementType: MovementType;
  /**
   * DOKŁADNE nazwy ćwiczeń, które ta grafika przedstawia. To jedyne źródło
   * prawdy dla przypisania. Każda nazwa jest normalizowana przy budowie mapy.
   */
  exerciseNames: string[];
}

/**
 * Biblioteka grafik — kluczowana po visualId. Każdy wpis przedstawia dokładnie
 * to ćwiczenie (lub jego bezpośrednie warianty o identycznym wzorcu ruchu).
 */
export const visualLibrary: Record<string, ExerciseVisual> = {
  pin_iso_ankle: {
    visualId: "pin_iso_ankle",
    src: pinIsoAnkle,
    title: "Przysiad przy pinach (iso) — staw skokowy",
    movementType: "isometric",
    exerciseNames: ["Przysiad przy pinach (iso) — staw skokowy"],
  },
  pin_iso_full_foot: {
    visualId: "pin_iso_full_foot",
    src: pinIsoFullFoot,
    title: "Przysiad przy pinach (iso) — cała stopa",
    movementType: "isometric",
    exerciseNames: ["Przysiad przy pinach (iso) — cała stopa"],
  },
  face_pull: {
    visualId: "face_pull",
    src: facePull,
    title: "Face pull (guma / wyciąg)",
    movementType: "pull",
    exerciseNames: [
      "Face pull",
      "Face pull (guma / wyciąg)",
      "Face pull (guma)",
      "Face pull (wyciąg)",
    ],
  },
  front_squat: {
    visualId: "front_squat",
    src: frontSquat,
    title: "Przysiad czołowy (front squat)",
    movementType: "squat",
    exerciseNames: ["Przysiad czołowy (front squat)"],
  },
  high_bar_squat: {
    visualId: "high_bar_squat",
    src: highBarSquat,
    title: "Przysiad ze sztangą (high bar)",
    movementType: "squat",
    exerciseNames: ["Przysiad ze sztangą (high bar)"],
  },
  back_squat: {
    visualId: "back_squat",
    src: backSquat,
    title: "Przysiad ze sztangą (low bar)",
    movementType: "squat",
    exerciseNames: [
      "Przysiad ze sztangą (low bar)",
      "Safety bar squat (przysiad)",
    ],
  },
  goblet_squat: {
    visualId: "goblet_squat",
    src: gobletSquat,
    title: "Goblet squat",
    movementType: "squat",
    exerciseNames: ["Goblet squat"],
  },
  split_squat: {
    visualId: "split_squat",
    src: splitSquat,
    title: "Split squat",
    movementType: "lunge",
    exerciseNames: ["Split squat"],
  },
  rdl: {
    visualId: "rdl",
    src: rdl,
    title: "Martwy ciąg rumuński (RDL)",
    movementType: "hinge",
    exerciseNames: ["Martwy ciąg rumuński (RDL)"],
  },
  trap_bar_high_pin: {
    visualId: "trap_bar_high_pin",
    src: trapBarHighPin,
    title: "Trap bar martwy ciąg (z wysokich pinów)",
    movementType: "hinge",
    exerciseNames: ["Trap bar martwy ciąg (z wysokich pinów)"],
  },
  kettlebell_swing: {
    visualId: "kettlebell_swing",
    src: kettlebellSwing,
    title: "Kettlebell swing",
    movementType: "hinge",
    exerciseNames: ["Kettlebell swing"],
  },
  med_ball_hip_throw: {
    visualId: "med_ball_hip_throw",
    src: medBallHipThrow,
    title: "Rzut piłką lekarską z bioder (hip-dominant)",
    movementType: "hinge",
    exerciseNames: ["Rzut piłką lekarską z bioder (hip-dominant)"],
  },
  nordic_hamstring: {
    visualId: "nordic_hamstring",
    src: nordicHamstring,
    title: "Nordic hamstring",
    movementType: "hinge",
    exerciseNames: ["Nordic hamstring"],
  },
  razor_curl: {
    visualId: "razor_curl",
    src: razorCurl,
    title: "Razor curl",
    movementType: "hinge",
    exerciseNames: ["Razor curl"],
  },
  hamstring_slider_curl: {
    visualId: "hamstring_slider_curl",
    src: hamstringSliderCurl,
    title: "Hamstring slider curl",
    movementType: "hinge",
    exerciseNames: ["Hamstring slider curl"],
  },
  long_lever_bridge_iso: {
    visualId: "long_lever_bridge_iso",
    src: longLeverBridgeIso,
    title: "Long-lever hamstring bridge iso",
    movementType: "isometric",
    exerciseNames: ["Long-lever hamstring bridge iso"],
  },
  calf_raise: {
    visualId: "calf_raise",
    src: calfRaise,
    title: "Wspięcia na łydki",
    movementType: "calf",
    exerciseNames: ["Wspięcia na łydki (ekscentryczne)"],
  },
  pallof_press: {
    visualId: "pallof_press",
    src: pallofPress,
    title: "Pallof press (anty-rotacja)",
    movementType: "core",
    exerciseNames: ["Pallof press (anty-rotacja)"],
  },
  dead_bug: {
    visualId: "dead_bug",
    src: deadBug,
    title: "Dead bug",
    movementType: "core",
    exerciseNames: ["Dead bug"],
  },
  bird_dog: {
    visualId: "bird_dog",
    src: birdDog,
    title: "Bird dog",
    movementType: "core",
    exerciseNames: ["Bird dog"],
  },
  side_plank: {
    visualId: "side_plank",
    src: sidePlank,
    title: "Plank boczny",
    movementType: "core",
    exerciseNames: ["Plank boczny"],
  },
  copenhagen_plank: {
    visualId: "copenhagen_plank",
    src: copenhagenPlank,
    title: "Copenhagen plank",
    movementType: "core",
    exerciseNames: ["Copenhagen plank"],
  },
  cmj: {
    visualId: "cmj",
    src: cmj,
    title: "Skok pionowy (CMJ)",
    movementType: "jump",
    exerciseNames: ["Skok pionowy (CMJ)"],
  },
  broad_jump: {
    visualId: "broad_jump",
    src: broadJump,
    title: "Skok w dal z miejsca",
    movementType: "jump",
    exerciseNames: ["Skok w dal z miejsca"],
  },
  band_broad_jump: {
    visualId: "band_broad_jump",
    src: bandBroadJump,
    title: "Skok w dal z oporem gumy (band-resisted)",
    movementType: "jump",
    exerciseNames: ["Skok w dal z oporem gumy (band-resisted)"],
  },
  bounds: {
    visualId: "bounds",
    src: bounds,
    title: "Bounds (skoki zamaszyste)",
    movementType: "jump",
    exerciseNames: [
      "Bounds (skoki zamaszyste)",
      "Bounds (wieloskoki) — niska objętość",
    ],
  },
  pogo_jump: {
    visualId: "pogo_jump",
    src: pogoJump,
    title: "Niskie pogo jumps",
    movementType: "jump",
    exerciseNames: ["Niskie pogo jumps"],
  },
  sprint_acceleration: {
    visualId: "sprint_acceleration",
    src: sprintAcceleration,
    title: "Sprinty z akceleracją",
    movementType: "sprint",
    exerciseNames: ["Sprinty z akceleracją 10–20 m"],
  },
  falling_start: {
    visualId: "falling_start",
    src: fallingStart,
    title: "Falling start",
    movementType: "sprint",
    exerciseNames: ["Falling start"],
  },
  max_velocity_sprint: {
    visualId: "max_velocity_sprint",
    src: maxVelocitySprint,
    title: "Narastające przebieżki (build-up)",
    movementType: "sprint",
    exerciseNames: ["Narastające przebieżki (build-up)"],
  },
  deceleration: {
    visualId: "deceleration",
    src: deceleration,
    title: "Sprint + kontrolowane hamowanie",
    movementType: "sprint",
    exerciseNames: [
      "Sprint 10 m + kontrolowane hamowanie",
      "Sprint 15 m + kontrolowane hamowanie",
    ],
  },
  change_of_direction: {
    visualId: "change_of_direction",
    src: changeOfDirection,
    title: "Zmiana kierunku",
    movementType: "sprint",
    exerciseNames: ["Lateral cut / drop step 45°–90°"],
  },
};

/** Normalizacja nazwy — identyczna dla klucza i dla wyszukania. */
function normalizeName(raw: string): string {
  return (raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9ąćęłńóśźż]+/gi, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Odwrotna mapa: znormalizowana nazwa → visualId. Budowana raz. */
const NAME_TO_VISUAL: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const visual of Object.values(visualLibrary)) {
    for (const name of visual.exerciseNames) {
      const key = normalizeName(name);
      if (map[key] && map[key] !== visual.visualId) {
        // Kolizja: ta sama nazwa przypisana do dwóch grafik — nie zgadujemy.
        // eslint-disable-next-line no-console
        console.error(
          `[blueprint] Duplicate exercise name mapping: "${name}" -> ${map[key]} & ${visual.visualId}`,
        );
        continue;
      }
      map[key] = visual.visualId;
    }
  }
  return map;
})();

export type VisualResolution =
  | { status: "ready"; visual: ExerciseVisual }
  | { status: "missing"; reason: string };

/**
 * Rozwiązuje grafikę dla ćwiczenia WYŁĄCZNIE po dokładnej nazwie.
 * Zwraca { status: "missing" } gdy nie ma dedykowanej grafiki — NIGDY cudzej.
 */
export function resolveExerciseVisual(e: TrainingExercise): VisualResolution {
  const key = normalizeName(e.name);
  if (!key) return { status: "missing", reason: "empty-name" };

  const visualId = NAME_TO_VISUAL[key];
  if (!visualId) {
    return { status: "missing", reason: "no-dedicated-visual" };
  }

  const visual = visualLibrary[visualId];
  if (!visual) {
    // eslint-disable-next-line no-console
    console.error(`[blueprint] visualId "${visualId}" not found in library`);
    return { status: "missing", reason: "visual-not-found" };
  }

  // Twarda walidacja spójności: grafika musi jawnie zawierać tę nazwę.
  const enrolled = visual.exerciseNames.some((n) => normalizeName(n) === key);
  if (!enrolled) {
    // eslint-disable-next-line no-console
    console.error(
      `Exercise visual mismatch: "${e.name}" expected an enrolled name for ${visualId}, but was not found`,
    );
    return { status: "missing", reason: "mismatch" };
  }

  return { status: "ready", visual };
}

// ---------------------------------------------------------------------------
// Dev validation report — uruchamiany tylko w dev.
// ---------------------------------------------------------------------------

export interface VisualValidationReport {
  ok: boolean;
  totalVisuals: number;
  duplicateNames: string[];
  duplicateVisualIds: string[];
}

export function validateVisualLibrary(): VisualValidationReport {
  const seenNames: Record<string, string> = {};
  const duplicateNames: string[] = [];
  const seenIds = new Set<string>();
  const duplicateVisualIds: string[] = [];

  for (const [id, visual] of Object.entries(visualLibrary)) {
    if (seenIds.has(visual.visualId)) duplicateVisualIds.push(visual.visualId);
    seenIds.add(visual.visualId);
    if (id !== visual.visualId) {
      duplicateVisualIds.push(`${id} != ${visual.visualId}`);
    }
    for (const name of visual.exerciseNames) {
      const key = normalizeName(name);
      if (seenNames[key] && seenNames[key] !== visual.visualId) {
        duplicateNames.push(`${name} (${seenNames[key]} & ${visual.visualId})`);
      }
      seenNames[key] = visual.visualId;
    }
  }

  return {
    ok: duplicateNames.length === 0 && duplicateVisualIds.length === 0,
    totalVisuals: Object.keys(visualLibrary).length,
    duplicateNames,
    duplicateVisualIds,
  };
}

if (import.meta.env?.DEV) {
  const report = validateVisualLibrary();
  if (!report.ok) {
    // eslint-disable-next-line no-console
    console.warn("[blueprint] Visual library validation issues:", report);
  }
}

/** Schludny placeholder — pokazywany zamiast cudzej grafiki. */
export function ExerciseVisualPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/70 bg-muted/30 px-4 py-10 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <ImageOff className="h-5 w-5" />
      </span>
      <div className="text-sm font-medium text-muted-foreground">
        Brak ilustracji dla tego ćwiczenia
      </div>
    </div>
  );
}

export function MovementBlueprint({ exercise }: { exercise: TrainingExercise }) {
  const resolution = resolveExerciseVisual(exercise);

  if (resolution.status === "missing") {
    return <ExerciseVisualPlaceholder />;
  }

  const { visual } = resolution;
  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-white shadow-sm">
      <img
        src={visual.src}
        alt={visual.title}
        loading="lazy"
        width={1024}
        height={1280}
        className="block w-full object-contain"
      />
    </div>
  );
}
