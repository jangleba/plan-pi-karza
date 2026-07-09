import type { TrainingExercise } from "@/lib/loadwise/types";
import { Dumbbell } from "lucide-react";

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

/**
 * System Movement Blueprint.
 *
 * Każdy blueprintType mapuje się na premium, minimalistyczną ilustrację ruchu
 * (cienkie linie, side/3-4-view, niebieska strzałka kierunku). Jeśli dla danego
 * typu nie ma jeszcze ilustracji, pokazujemy kompaktowy, elegancki fallback —
 * nigdy pustego boxa ani niskiej jakości placeholdera.
 */
export type BlueprintType =
  | "high_bar_squat"
  | "back_squat"
  | "goblet_squat"
  | "nordic_hamstring"
  | "hamstring_slider_curl"
  | "rdl"
  | "split_squat"
  | "cmj"
  | "vertical_jump"
  | "broad_jump"
  | "bounds"
  | "sprint_acceleration"
  | "max_velocity_sprint"
  | "deceleration"
  | "change_of_direction"
  | "pallof_press"
  | "dead_bug"
  | "copenhagen_plank"
  | "calf_raise"
  | "pogo_jump";

type BlueprintSpec = {
  src: string;
  title: string;
  directionLabel: string;
};

/** Registry ilustracji ruchu. Tylko wpisy z realnym `src` renderują grafikę. */
const blueprintRegistry: Partial<Record<BlueprintType, BlueprintSpec>> = {
  high_bar_squat: {
    src: highBarSquat,
    title: "Przysiad — w dół i w górę",
    directionLabel: "Pion w dół i w górę",
  },
  nordic_hamstring: {
    src: nordicHamstring,
    title: "Nordic — kontrolowany opad",
    directionLabel: "Opad tułowia w przód",
  },
  hamstring_slider_curl: {
    src: hamstringSliderCurl,
    title: "Slider curl — pięty do bioder",
    directionLabel: "Pięty do bioder",
  },
  sprint_acceleration: {
    src: sprintAcceleration,
    title: "Akceleracja — mocne wypchnięcie",
    directionLabel: "Napęd do przodu",
  },
  bounds: {
    src: bounds,
    title: "Bounds — długi rytmiczny skok",
    directionLabel: "Skok w przód",
  },
  deceleration: {
    src: deceleration,
    title: "Hamowanie — nisko i stabilnie",
    directionLabel: "Zatrzymanie, nisko",
  },
  pallof_press: {
    src: pallofPress,
    title: "Pallof press — anty-rotacja",
    directionLabel: "Wypchnięcie od klatki",
  },
  dead_bug: {
    src: deadBug,
    title: "Dead bug — stabilny tułów",
    directionLabel: "Naprzemienne wyprosty",
  },
  back_squat: {
    src: backSquat,
    title: "Przysiad ze sztangą — w dół i w górę",
    directionLabel: "Pion w dół i w górę",
  },
  goblet_squat: {
    src: gobletSquat,
    title: "Goblet squat — w dół i w górę",
    directionLabel: "Pion w dół i w górę",
  },
  rdl: {
    src: rdl,
    title: "RDL — biodra w tył",
    directionLabel: "Zawias biodrowy w tył",
  },
  split_squat: {
    src: splitSquat,
    title: "Przysiad bułgarski — w dół i w górę",
    directionLabel: "Pion w dół i w górę",
  },
  cmj: {
    src: cmj,
    title: "Wyskok pionowy — eksplozja w górę",
    directionLabel: "Wyskok w górę",
  },
  broad_jump: {
    src: broadJump,
    title: "Skok w dal — napęd w przód",
    directionLabel: "Skok w przód",
  },
  change_of_direction: {
    src: changeOfDirection,
    title: "Zmiana kierunku — mocne wypchnięcie w bok",
    directionLabel: "Zmiana kierunku",
  },
  copenhagen_plank: {
    src: copenhagenPlank,
    title: "Copenhagen plank — biodra w górę",
    directionLabel: "Uniesienie bioder",
  },
  calf_raise: {
    src: calfRaise,
    title: "Wspięcia na palce — w górę",
    directionLabel: "Uniesienie na palce",
  },
  pogo_jump: {
    src: pogoJump,
    title: "Pogo — szybkie odbicia",
    directionLabel: "Szybkie odbicie w górę",
  },
  max_velocity_sprint: {
    src: maxVelocitySprint,
    title: "Prędkość maksymalna — wysoka postawa",
    directionLabel: "Napęd do przodu",
  },
};

/** Mapuje ćwiczenie na blueprintType na podstawie nazwy/techniki. */
export function blueprintFor(e: TrainingExercise): BlueprintType | null {
  const t = `${e.name} ${e.technique ?? ""}`.toLowerCase();
  const has = (...w: string[]) => w.some((x) => t.includes(x));

  if (has("nordic")) return "nordic_hamstring";
  if (has("slider", "leg curl na sliderach")) return "hamstring_slider_curl";
  if (has("goblet")) return "goblet_squat";
  if (has("high bar", "przysiad ze sztang", "back squat")) return "high_bar_squat";
  if (has("przysiad", "squat")) return "high_bar_squat";
  if (has("rdl", "martwy ciąg rumuń", "romanian")) return "rdl";
  if (has("bułgar", "split squat", "wykrok w podpor")) return "split_squat";
  if (has("bounds", "wieloskok", "skok naprzemienny")) return "bounds";
  if (has("cmj", "skok pionowy", "vertical jump", "wyskok")) return "cmj";
  if (has("skok w dal", "broad jump")) return "broad_jump";
  if (has("pogo")) return "pogo_jump";
  if (has("max velocity", "prędkość maksymaln", "lotny")) return "max_velocity_sprint";
  if (has("akcelerac", "sprint", "przyspiesz", "start", "wypchnięc")) return "sprint_acceleration";
  if (has("hamowan", "decel", "zatrzym")) return "deceleration";
  if (has("zmiana kierunk", "change of direction", "cod ")) return "change_of_direction";
  if (has("pallof")) return "pallof_press";
  if (has("dead bug", "martwy robak")) return "dead_bug";
  if (has("copenhagen")) return "copenhagen_plank";
  if (has("wspięci", "łydk", "calf")) return "calf_raise";
  return null;
}

/** Kompaktowy, elegancki fallback — bez wielkiego pustego pola. */
export function ExerciseBlueprintFallback() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Dumbbell className="h-4 w-4" />
      </span>
      <div className="text-sm text-muted-foreground">Diagram techniki w przygotowaniu</div>
    </div>
  );
}

export function MovementBlueprint({
  blueprintType,
  title,
  directionLabel,
}: {
  blueprintType: BlueprintType | null;
  title?: string;
  directionLabel?: string;
}) {
  const spec = blueprintType ? blueprintRegistry[blueprintType] : undefined;

  if (!spec) {
    return <ExerciseBlueprintFallback />;
  }

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
      <div className="mx-auto flex h-[190px] w-full max-w-[320px] items-center justify-center">
        <img
          src={spec.src}
          alt={title ?? spec.title}
          loading="lazy"
          className="max-h-[190px] w-auto object-contain"
        />
      </div>
      <div className="mt-1 flex flex-col items-center gap-0.5 text-center">
        <span className="text-sm font-medium text-foreground">{title ?? spec.title}</span>
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-primary">
          {directionLabel ?? spec.directionLabel}
        </span>
      </div>
    </div>
  );
}
