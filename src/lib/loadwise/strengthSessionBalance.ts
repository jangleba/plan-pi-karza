import type { Profile, TrainingExercise, TrainingSection } from "./types";
import { buildAthleteTrainingProfile } from "./athleteProfile";
import {
  getExerciseDefinition,
  hydrateTrainingExerciseFromDefinition,
  isExerciseAllowedForProfile,
  resolveExerciseByName,
} from "./exerciseLibrary";
const definition = (e: TrainingExercise) =>
  getExerciseDefinition(e.exerciseId ?? "") ?? resolveExerciseByName(e.name);
const identity = (e: TrainingExercise) =>
  definition(e)?.id ?? e.name.trim().toLocaleLowerCase("pl");
const held = (e: TrainingExercise) =>
  definition(e)?.movementPattern === "isometric" ||
  /^(?:side_plank|plank|copenhagen_plank|bodyweight_march_hold)$/.test(definition(e)?.id ?? "");
const kneeFlexion = (e: TrainingExercise) =>
  /leg_curl|nordic|heel_dig|hamstring_iso/.test(identity(e));
const compound = (e: TrainingExercise) =>
  ["squat", "hinge", "lunge"].includes(definition(e)?.movementPattern ?? "") && !kneeFlexion(e);
export function normalizeStrengthHold(e: TrainingExercise): TrainingExercise {
  if (!held(e)) return e;
  const duration =
    e.duration ??
    (/\d.*(?:\bs\b|sek|utrzymania)/i.test(e.reps ?? "") ? e.reps : undefined) ??
    "15–20 s";
  const next = { ...e, duration, reps: undefined, rir: undefined, displayPrescription: undefined };
  return JSON.stringify(next) === JSON.stringify(e) ? e : next;
}
/** Keep both upper-body directions before optional repeat core/calf work. */
export function supportPriority(e: TrainingExercise): number {
  const d = definition(e);
  return d?.movementPattern === "push"
    ? 0
    : d?.movementPattern === "pull"
      ? 1
      : d?.category === "core" || d?.movementPattern === "brace"
        ? 2
        : 3;
}
/** Full training sessions, not a primer or a timed micro-session. No prescription
 * is added unless its movement is missing and it passes the athlete's equipment gate. */
export function balanceStrengthSections(
  input: TrainingSection[],
  profile: Profile,
  complete = true,
  compactIntroHinge = false,
): TrainingSection[] {
  const athlete = buildAthleteTrainingProfile(profile);
  const work = input
    .filter((s) => ["main", "accessory"].includes(s.type))
    .flatMap((s) => s.blocks.flatMap((b) => b.exercises));
  const workIds = new Set(work.map(identity));
  const seen = new Set<string>();
  let sections = input
    .map((s) => ({
      ...s,
      blocks: s.blocks
        .map((b) => ({
          ...b,
          exercises: b.exercises
            .filter((e) => {
              const key = identity(e);
              if (s.type === "warmup" && workIds.has(key)) return false;
              if (!["main", "accessory"].includes(s.type)) return true;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            })
            .map(normalizeStrengthHold),
        }))
        .filter((b) => b.exercises.length),
    }))
    .filter((s) => s.blocks.length);
  const main = sections.find((s) => s.type === "main");
  const lower = main?.blocks
    .flatMap((b) => b.exercises)
    .some(
      (e) =>
        ["hinge", "squat", "lunge"].includes(definition(e)?.movementPattern ?? "") &&
        !/leg_curl|nordic|heel_dig/.test(identity(e)),
    );
  if (complete && lower && main) {
    const all = () =>
      sections
        .filter((s) => ["main", "accessory"].includes(s.type))
        .flatMap((s) => s.blocks.flatMap((b) => b.exercises));
    const choose = (ids: string[]) =>
      ids
        .map(getExerciseDefinition)
        .find((d) => d && !seen.has(d.id) && isExerciseAllowedForProfile(d, athlete).ok);
    const add = (ids: string[], slot: string, target: TrainingSection) => {
      const d = choose(ids);
      if (!d) return;
      const e = normalizeStrengthHold(
        hydrateTrainingExerciseFromDefinition({
          id: `balanced:${slot}`,
          exerciseId: d.id,
          name: d.displayNamePl,
          label: slot,
          sets: "2",
          reps: d.movementPattern === "lunge" ? "6–8 / strona" : "6–10",
          rir: "3–4",
          restAfterExercise: "60–90 s",
          loadTarget: "Kontrola i zapas; bez dokładania drugiego ciężkiego ruchu nóg",
        }),
      );
      target.blocks.push({
        id: `balanced:block:${slot}`,
        title: d.displayNamePl,
        blockType: "single",
        intent: "strength",
        exercises: [e],
      });
      seen.add(d.id);
    };
    // Hip emphasis still needs a knee-dominant movement, not three hip variants.
    if (!all().some((e) => ["squat", "lunge"].includes(definition(e)?.movementPattern ?? "")))
      add(
        (athlete.strengthTrainingAge ?? 0) >= 6
          ? ["goblet_squat", "reverse_lunge", "bodyweight_split_squat", "bodyweight_squat"]
          : ["bodyweight_split_squat", "reverse_lunge", "bodyweight_squat"],
        "B",
        main,
      );
    let support = sections.find((s) => s.type === "accessory");
    if (!support) {
      support = {
        id: "balanced:support",
        title: "Uzupełnienie całego ciała",
        type: "accessory",
        blocks: [],
      };
      const idx = sections.findIndex((s) => s.type === "cooldown");
      sections.splice(idx < 0 ? sections.length : idx, 0, support);
    }
    if (!all().some((e) => definition(e)?.movementPattern === "push"))
      add(["push_up", "incline_push_up", "dumbbell_bench_press"], "C", support);
    if (!all().some((e) => definition(e)?.movementPattern === "pull"))
      add(["one_arm_dumbbell_row", "bodyweight_row", "face_pull_band"], "D", support);
  }
  if (complete && lower && main) {
    const mainWork = main.blocks.flatMap((b) => b.exercises);
    // A hinge session already loads the posterior chain. Keep its knee complement
    // before any isolation, rather than appending it after a second hamstring task.
    const hipMain = mainWork.find((e) => e.label === "A1") ?? mainWork.find(compound);
    const hasHipMain = definition(hipMain ?? { id: "", name: "" })?.movementPattern === "hinge";
    if (
      compactIntroHinge &&
      (athlete.strengthTrainingAge ?? 0) < 6 &&
      hasHipMain &&
      mainWork.some((e) => ["squat", "lunge"].includes(definition(e)?.movementPattern ?? ""))
    ) {
      // Keep an introductory session concise once hip and knee patterns are
      // covered. This is a dose limit, not a claim that RDL and knee flexion are
      // equivalent. Experienced sessions and explicit eccentric methods retain
      // their separate knee-flexion stimulus.
      main.blocks = main.blocks
        .map((b) => ({ ...b, exercises: b.exercises.filter((e) => !kneeFlexion(e)) }))
        .filter((b) => b.exercises.length);
    }
    // Preserve an explicitly paired contrast/cluster block; order whole blocks.
    main.blocks = main.blocks
      .map((block, index) => ({ block, index }))
      .sort((a, b) => {
        const priority = (b: typeof a.block) =>
          b.blockType === "contrast"
            ? 0
            : b.exercises.some((e) =>
                  ["power", "plyometric"].includes(definition(e)?.category ?? ""),
                )
              ? 0
              : b.exercises.some(compound)
                ? 1
                : 2;
        return priority(a.block) - priority(b.block) || a.index - b.index;
      })
      .map((x) => x.block);
  }
  if (complete && lower) {
    const supports = sections
      .filter((s) => s.type === "accessory")
      .flatMap((s) => s.blocks.flatMap((b) => b.exercises));
    const ordered = [...supports].sort((a, b) => supportPriority(a) - supportPriority(b));
    const chosen = new Set<TrainingExercise>();
    let core = false;
    for (const e of ordered) {
      const isCore = supportPriority(e) === 2;
      if (isCore && core) continue;
      if (chosen.size >= 4) continue;
      chosen.add(e);
      if (isCore) core = true;
    }
    sections = sections
      .map((s) =>
        s.type !== "accessory"
          ? s
          : {
              ...s,
              blocks: s.blocks
                .map((b) => ({ ...b, exercises: b.exercises.filter((e) => chosen.has(e)) }))
                .filter((b) => b.exercises.length),
            },
      )
      .filter((s) => s.blocks.length);
    // The selected priority must also become the visible/execution order.
    for (const s of sections)
      if (s.type === "accessory")
        s.blocks.sort(
          (a, b) =>
            Math.min(...a.exercises.map(supportPriority)) -
            Math.min(...b.exercises.map(supportPriority)),
        );
  }
  return JSON.stringify(sections) === JSON.stringify(input) ? input : sections;
}
