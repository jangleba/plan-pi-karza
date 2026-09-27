import type { SprintExercise } from "./types";

const VISUAL_BY_KEY: Readonly<Record<string, string>> = {
  "ramp-jog": "/sprint/ramp/progressive-jog.svg",
  "ramp-ankle": "/sprint/ramp/ankle-mobility.svg",
  "ramp-glute-march": "/sprint/ramp/glute-bridge-march.png",
  "ramp-lunge-knee": "/sprint/ramp/reverse-lunge-knee-drive.svg",
  "ramp-hamstring-sweep": "/sprint/ramp/hamstring-sweep.svg",
  "ramp-acceleration": "/sprint/ramp/progressive-acceleration.svg",
  "skip-a": "/sprint/skips/skip-a.png",
  "skip-b": "/sprint/skips/skip-b.png",
  "skip-c": "/sprint/skips/skip-c.png",
  "skip-d": "/sprint/skips/skip-d.png",
};

const EXACT_KEY_BY_NAME: Readonly<Record<string, string>> = {
  "trucht progresywny": "ramp-jog",
  "mobilizacja stawu skokowego": "ramp-ankle",
  "glute bridge march": "ramp-glute-march",
  "wykrok w tył + kolano": "ramp-lunge-knee",
  "hamstring sweep": "ramp-hamstring-sweep",
  "przyspieszenia progresywne": "ramp-acceleration",
  "skip a": "skip-a",
  "skip b": "skip-b",
  "skip c": "skip-c",
  "skip d": "skip-d",
};

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase("pl-PL");
}

/** Wyłącznie jawne ID/nazwa. Nigdy nie pokazuje grafiki innego ruchu jako fallbacku. */
export function resolveSprintVisual(exercise: SprintExercise): string | null {
  if (exercise.visualSrc) return exercise.visualSrc;
  const byId = VISUAL_BY_KEY[normalized(exercise.id)];
  if (byId) return byId;
  const key = EXACT_KEY_BY_NAME[normalized(exercise.title)];
  return key ? VISUAL_BY_KEY[key] : null;
}

