import type { ExerciseVariant } from "./types";

/**
 * Kierunkowe, zatwierdzone relacje zamian dla funkcji slotu. `variantOf`/rodzina oznaczają tylko pokrewieństwo.
 * Zakres: equivalent_for_slot (ta sama funkcja slotu, nowa recepta), changes_stimulus / changes_session_goal (wymaga przebudowy bloku i potwierdzenia).
 */
export type SwapScope = "equivalent_for_slot" | "changes_stimulus" | "changes_session_goal";
export interface SwapRelation {
  from: string; to: string; slotFn: string; scope: SwapScope;
  rationalePl: string;
  /** Zawsze nowa recepta: kg, %RM i jednostki poprzedniego zadania nie przechodzą. */
  dosePolicy: "represcribe";
}
const eq = (from: string, to: string, slotFn: string, rationalePl: string): SwapRelation => ({ from, to, slotFn, scope: "equivalent_for_slot", rationalePl, dosePolicy: "represcribe" });
const st = (from: string, to: string, slotFn: string, rationalePl: string, scope: SwapScope = "changes_stimulus"): SwapRelation => ({ from, to, slotFn, scope, rationalePl, dosePolicy: "represcribe" });

export const SWAPS: SwapRelation[] = [
  eq("back-squat", "goblet-squat", "squat_main", "Ten sam wzorzec przysiadu, lżejszy ciężar."),
  eq("back-squat", "step-up", "squat_main", "Siła nóg jednostronnie, bez sztangi."),
  eq("goblet-squat", "step-up", "squat_main", "Siła nóg jednostronnie."),
  eq("step-up", "goblet-squat", "squat_main", "Przysiad obunóż zamiast wejścia."),
  eq("bench-press", "db-bench-press", "push_main", "Pchanie poziome z hantlami."),
  eq("bench-press", "push-up", "push_main", "Pchanie poziome z masą ciała."),
  eq("db-bench-press", "push-up", "push_main", "Pchanie poziome z masą ciała."),
  eq("bb-row", "db-row", "pull_row", "Wiosłowanie z hantlem."),
  eq("bb-row", "inverted-row", "pull_row", "Wiosłowanie z masą ciała."),
  eq("db-row", "inverted-row", "pull_row", "Wiosłowanie z masą ciała."),
  eq("sl-straight-leg-ht", "glute-bridge", "hip_ext", "Wyprost biodra w prostszej wersji."),
  eq("sl-glute-bridge", "glute-bridge", "hip_ext", "Wyprost biodra obunóż."),
  eq("sl-calf-raise", "seated-sl-calf", "calf", "Łydka z obciążeniem."),
  eq("seated-sl-calf", "sl-calf-raise", "calf", "Łydka z masą ciała."),
  eq("slider-leg-curl", "nordic-assisted", "knee_flex", "Zgięcie kolana z naciskiem na opuszczanie."),
  eq("nordic-curl", "nordic-assisted", "knee_flex", "Zgięcie kolana z asystą."),
  eq("nordic-assisted", "slider-leg-curl", "knee_flex", "Zgięcie kolana na ślizgaczach."),
  eq("hang-power-clean", "kb-swing", "power_block", "Moc z wyprostu biodra bez zarzutu sztangi."),
  eq("kb-swing", "hang-power-clean", "power_block", "Moc z wyprostu biodra ze sztangą."),
  eq("depth-jump-hurdle", "depth-box-jump", "jump_after_strength", "Skok reaktywny po siłowej serii."),
  eq("depth-jump-hurdle", "box-jump", "jump_after_strength", "Skok pionowy po siłowej serii (mniej reaktywny)."),
  eq("depth-box-jump", "box-jump", "jump_after_strength", "Skok pionowy po siłowej serii (mniej reaktywny)."),
  eq("box-jump", "pogo-jumps", "jump_after_strength", "Sprężyste podskoki po siłowej serii."),
  eq("sl-box-jump", "box-jump", "jump_prep", "Skok pionowy obunóż."),
  eq("sl-box-jump", "pogo-jumps", "jump_prep", "Sprężyste podskoki."),
  eq("box-jump", "pogo-jumps", "jump_prep", "Sprężyste podskoki."),
  eq("sl-jumps-llrr", "pogo-jumps", "plyo_ankle", "Podskoki obunóż."),
  eq("heiden-jumps", "sl-jumps-llrr", "plyo_ankle", "Skoki jednonóż."),
  eq("resisted-sprint", "sprint-30", "acceleration", "Przyspieszenie bez oporu."),
  // zmiany bodźca – nie są zamiennikami równoważnymi
  st("slider-leg-curl", "glute-bridge", "knee_flex", "Zmienia zgięcie kolana na wyprost biodra."),
  st("knee-iso-push", "sl-hip-thrust-iso", "iso_knee", "Zmienia izometrię kolana na izometrię biodra."),
  st("hang-power-clean", "box-jump", "power_block", "Zmienia ćwiczenie mocy na skok pionowy."),
  st("nordic-curl", "sl-rdl-bw", "knee_flex", "Zmienia zgięcie kolana na dominujący wyprost biodra."),
  st("nordic-assisted", "sl-rdl-bw", "knee_flex", "Zmienia zgięcie kolana na dominujący wyprost biodra."),
  st("copenhagen", "side-plank", "adductor_core", "Zmienia pracę przywodzicieli na stabilizację boczną tułowia."),
  st("cod-turnover", "deceleration", "cod", "Zmienia zmianę kierunku na samo hamowanie.", "changes_stimulus"),
];

export const swapsFrom = (id: string): SwapRelation[] => SWAPS.filter((s) => s.from === id);
export const findSwap = (from: string, to: string, slotFn?: string): SwapRelation | undefined =>
  SWAPS.find((s) => s.from === from && s.to === to && (!slotFn || s.slotFn === slotFn)) ?? SWAPS.find((s) => s.from === from && s.to === to);

/** Czy wszystkie odwołania istnieją (test) i czy relacje nie prowadzą do samego siebie. */
export function validateSwaps(pool: Record<string, ExerciseVariant>): string[] {
  const e: string[] = [];
  for (const s of SWAPS) {
    if (!pool[s.from]) e.push(`brak ${s.from}`);
    if (!pool[s.to]) e.push(`brak ${s.to}`);
    if (s.from === s.to) e.push(`pętla ${s.from}`);
    if (s.scope === "equivalent_for_slot" && pool[s.to] && !pool[s.to]!.functions.includes(s.slotFn)) e.push(`${s.to} nie pełni funkcji ${s.slotFn}`);
  }
  return e;
}
