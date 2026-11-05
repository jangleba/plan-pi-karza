import { balanceStrengthSections, supportPriority } from "../strengthSessionBalance";
import { isFieldMasCurrent, paceRangeFromMas } from "@/lib/running/engine";
import type { Profile, SessionDay, TrainingExercise, TrainingSection, WeekPhase } from "../types";
import { buildAthleteTrainingProfile } from "../athleteProfile";
import {
  buildStrengthPowerStructured,
  flatToStructured,
  structuredToFlat,
} from "../strengthBlocks";
import {
  getExerciseDefinition,
  hydrateTrainingExerciseFromDefinition,
  isExerciseAllowedForProfile,
} from "../exerciseLibrary";
import { getTrainingMethod } from "./catalogue";
import { methodEquipment } from "./eligibility";
import type { MethodExecution, MethodSessionConditions, TrainingMethodId } from "./types";

export function profileWithMethodEquipment(
  profile: Profile,
  conditions: MethodSessionConditions = {},
): Profile {
  return {
    ...profile,
    equipment: [
      ...new Set([
        ...(profile.equipment ?? []),
        ...(profile.trainingMethodPreferences?.declaredEquipment ?? []),
        ...(conditions.equipment ?? []),
      ]),
    ],
  };
}
export function methodPhase(
  session: Pick<SessionDay, "blockPhaseLabel" | "blockWeekNumber">,
): WeekPhase {
  const label = session.blockPhaseLabel ?? "";
  if (/deload|odciąż|konsolid|świeżość/i.test(label)) return "deload";
  if (/szczyt|peak|intensyfik/i.test(label)) return "peak";
  if (/kalibr|adapt|wprowad/i.test(label)) return "adaptation";
  return session.blockWeekNumber === 4 ? "deload" : "development";
}
export function executionFor(
  id: TrainingMethodId,
  patch: Partial<MethodExecution> = {},
): MethodExecution {
  const def = getTrainingMethod(id)!;
  return {
    methodId: id,
    mode: def.clock,
    rounds: 1,
    repetitions: 1,
    restSeconds: 0,
    roundRestSeconds: 0,
    intensityLabel: "Zachowaj jakość i zapas.",
    stopRule: def.stopRule,
    focus: def.coachingFocus,
    assessment: "athlete_or_coach",
    ...patch,
  };
}
function exercise(
  id: string,
  instance: string,
  patch: Partial<TrainingExercise> = {},
): TrainingExercise {
  const definition = getExerciseDefinition(id);
  if (!definition) throw new Error(`Brak zatwierdzonego ćwiczenia: ${id}`);
  return hydrateTrainingExerciseFromDefinition({
    id: instance,
    exerciseId: definition.id,
    name: definition.displayNamePl,
    visualId: definition.id,
    ...patch,
  });
}
function allowedId(profile: Profile, ids: string[]): string {
  const athlete = buildAthleteTrainingProfile(profile);
  const result = ids.find(
    (id) => isExerciseAllowedForProfile(getExerciseDefinition(id), athlete).ok,
  );
  if (!result)
    throw new Error(
      "Brak wariantu ćwiczenia spełniającego warunki tej metody. Wybierz prostszą metodę.",
    );
  return result;
}
const isPower = (e: TrainingExercise) =>
  ["power", "plyometric"].includes(getExerciseDefinition(e.exerciseId ?? "")?.category ?? "");
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function capSupport(sections: TrainingSection[], maximum = 3): TrainingSection[] {
  let kept = 0;
  return sections
    .map((s) =>
      s.type !== "accessory"
        ? s
        : {
            ...s,
            blocks: s.blocks
              .flatMap((b) =>
                b.exercises
                  .filter((e) => !isPower(e))
                  .map((e) => ({
                    ...b,
                    id: `${b.id}:${e.id}`,
                    blockType: "single" as const,
                    exercises: [
                      {
                        ...e,
                        sets: "2",
                        restAfterPair: undefined,
                        restAfterExercise: e.restAfterExercise ?? "60 s",
                      },
                    ],
                  })),
              )
              .sort((a, b) => supportPriority(a.exercises[0]) - supportPriority(b.exercises[0]))
              .filter(() => kept++ < maximum),
          },
    )
    .filter((s) => s.blocks.length);
}
export function buildStrengthMethod(
  session: SessionDay,
  profile: Profile,
  id: TrainingMethodId,
  conditions: MethodSessionConditions = {},
  availableMinutes?: number,
): TrainingSection[] {
  const p = profileWithMethodEquipment(profile, conditions),
    phase = methodPhase(session),
    week = Math.max(0, (session.blockWeekNumber ?? 2) - 1);
  const originalMain = session.structuredSections
    ?.flatMap((s) => s.blocks.flatMap((b) => b.exercises))
    .find((e) => e.label === "A1");
  const hinge = getExerciseDefinition(originalMain?.exerciseId ?? "")?.movementPattern === "hinge";
  const supplied = session.structuredSections;
  const athlete = buildAthleteTrainingProfile(p);
  const reusable =
    (!session.trainingMethods ||
      ["M02", "M03", "M04", "M05", "M06", "M08", "M09", "M11", "M17", "M39"].includes(
        session.trainingMethods.primary,
      )) &&
    supplied?.some((s) => s.type === "main") &&
    supplied.every((s) =>
      s.blocks.every((b) =>
        b.exercises.every(
          (e) =>
            !e.executionBlockedReason &&
            isExerciseAllowedForProfile(getExerciseDefinition(e.exerciseId ?? ""), athlete).ok,
        ),
      ),
    );
  const base = reusable
    ? { sections: supplied! }
    : buildStrengthPowerStructured(p, {
        mdLabel: session.mdLabel,
        weekPhase: phase,
        weekIndex: week,
        gymSessionIndexInWeek: hinge ? 1 : 0,
        gymSessionsThisWeekTotal: 2,
        forcedMainFamily: hinge ? "trap_bar" : "squat",
        powerFocus: p.goal === "power" || p.goal === "speed",
        history: { usedMainThisWeek: [], usedMainLastWeek: [], usedRolesThisWeek: [] },
      });
  if (!base) throw new Error("Nie udało się przygotować metody dla tej sesji.");
  let sections = clone(base.sections);
  let main = sections.find((s) => s.type === "main");
  if (!main?.blocks.length) return sections;
  const all = main.blocks.flatMap((b) => b.exercises),
    primary = all.find((e) => e.label === "A1") ?? all.find((e) => !isPower(e));
  if (!primary) throw new Error("Brak głównego ruchu siłowego.");
  const ham = all.find((e) => e.label === "B1" && e.id !== primary.id);
  const singles = (rows: TrainingExercise[]) =>
    rows.map((e, i) => ({
      id: `method:${id}:${i}:${e.id}`,
      title: e.name,
      blockType: "single" as const,
      intent: isPower(e) ? ("power" as const) : ("strength" as const),
      exercises: [e],
    }));
  const stamp = (e: TrainingExercise, patch: Partial<TrainingExercise>): TrainingExercise => ({
    ...e,
    displayPrescription: undefined,
    restAfterPair: undefined,
    methodExecution: undefined,
    ...patch,
  });
  const compoundDose =
    phase === "adaptation"
      ? { sets: "3", reps: "5–6", rir: "3", restAfterExercise: "2 min" }
      : phase === "peak"
        ? { sets: "3", reps: "2–4", rir: "2–3", restAfterExercise: "3 min" }
        : phase === "deload"
          ? { sets: "2", reps: "3–5", rir: "3–4", restAfterExercise: "2 min" }
          : { sets: "3", reps: "3–5", rir: "2–3", restAfterExercise: "3 min" };
  let rows: TrainingExercise[] = [];
  if (id === "M02") {
    rows = [
      stamp(primary, {
        sets: "2",
        reps: "6–8",
        rir: "3–4",
        rpe: "RPE 6–7",
        tempo: "2-0-1",
        restAfterExercise: "90 s",
        loadTarget: "Lekko, nauka i kontrola ruchu",
      }),
    ];
    if (ham)
      rows.push(
        stamp(ham, {
          sets: "2",
          ...(ham.duration
            ? { duration: "15 s", reps: undefined, rir: undefined }
            : { reps: "6–8", rir: "3–4" }),
          restAfterExercise: "60–90 s",
        }),
      );
  } else if (
    id === "M03" ||
    id === "M04" ||
    id === "M05" ||
    id === "M08" ||
    id === "M11" ||
    id === "M15" ||
    id === "M39"
  ) {
    let first = stamp(primary, {
      ...compoundDose,
      rpe: undefined,
      loadTarget: "Dobierz ciężar do zapasu powtórzeń; bez upadku.",
    });
    if (id === "M04")
      first = stamp(first, {
        sets: phase === "deload" ? "2" : "3",
        reps: "8–10",
        rir: "2–3",
        restAfterExercise: "90–120 s",
      });
    if (id === "M05")
      first = exercise(
        allowedId(p, ["reverse_lunge", "bodyweight_split_squat", "bulgarian_split_squat"]),
        primary.id,
        { label: "A1", sets: "2", reps: "6–8 / strona", rir: "3", restAfterExercise: "90 s" },
      );
    if (id === "M08") {
      const groups = phase === "peak" ? [1, 1, 1] : [2, 2, 2],
        sets = phase === "deload" || phase === "adaptation" ? 2 : 3,
        total = groups.reduce((a, b) => a + b, 0);
      first = stamp(first, {
        sets: String(sets),
        reps: String(total),
        rir: "3",
        displayPrescription: `${sets} × (${groups.join(" + ")})`,
        restAfterExercise: "3 min",
        methodExecution: executionFor(id, {
          mode: "cluster",
          rounds: sets,
          repetitions: groups.length,
          repGroups: groups,
          workReps: groups[0],
          restSeconds: 20,
          roundRestSeconds: 180,
          intensityLabel: "Szybkie, kontrolowane powtórzenia; krótki odpoczynek wewnątrz serii.",
        }),
      });
    }
    if (id === "M15")
      first = exercise("band_resisted_squat", primary.id, {
        label: "A1",
        sets: "3",
        reps: "5",
        rir: "3",
        restAfterExercise: "3 min",
        loadTarget:
          "Zacznij lżej; zapisuj masę sztangi i używaj tej samej gumy oraz mocowania przy porównaniu.",
      });
    if (id === "M39")
      first = stamp(first, {
        rir: undefined,
        loadTarget: "Pomiary z urządzenia; ciężar dobrany z trenerem",
        methodExecution: executionFor(id, {
          mode: "velocity",
          rounds: Number(first.sets) || 3,
          repetitions: Math.max(...(first.reps?.match(/\d+/g)?.map(Number) ?? [5])),
          restSeconds: 180,
          roundRestSeconds: 0,
          assessment: "external_validated_measurement",
          velocityLossLimitPct: 15,
          intensityLabel:
            "Próg utraty prędkości ustaw z trenerem. Wpisuj ważne pomiary z urządzenia.",
        }),
      });
    rows = [first];
    if (ham) {
      let second = stamp(ham, { sets: phase === "deload" ? "1" : "2", restAfterExercise: "90 s" });
      if (id === "M11")
        second = exercise(
          allowedId(p, [
            "assisted_nordic_hamstring",
            "bilateral_slider_leg_curl",
            "prone_band_leg_curl",
            "lying_leg_curl",
          ]),
          ham.id,
          {
            label: "B1",
            sets: "2",
            reps: "4–6",
            rir: "3",
            tempo: "3-0-1",
            restAfterExercise: "2 min",
            cue: "Kontroluj opuszczanie; nie dokładaj kolejnego ćwiczenia hamstringów.",
          },
        );
      rows.push(second);
    }
  } else if (id === "M07") {
    rows = [
      exercise("clean_pull_from_hang", `${primary.id}:pull`, {
        label: "A",
        sets: "3",
        reps: "3",
        restAfterExercise: "3 min",
        loadTarget: "Lekki opór dobrany przez trenera; szybki wyprost bez chwytu",
      }),
      stamp(primary, { sets: "2", reps: "4–6", rir: "3", restAfterExercise: "2 min" }),
    ];
  } else if (id === "M06" || id === "M17") {
    const jump = exercise(
      allowedId(p, id === "M17" ? ["repeated_broad_jump"] : ["countermovement_jump", "broad_jump"]),
      `${primary.id}:power`,
      {
        label: "A",
        sets: phase === "deload" ? "2" : "3",
        reps: "3",
        groundContacts: 3,
        restAfterExercise: "2 min",
        loadTarget: "Szybki ruch i stabilne lądowanie",
      },
    );
    rows = [
      jump,
      stamp(primary, {
        ...compoundDose,
        sets: "2",
        reps: "3–5",
        rir: "3",
        restAfterExercise: "3 min",
      }),
    ];
    if (ham) rows.push(stamp(ham, { sets: "2", restAfterExercise: "90 s" }));
  } else if (id === "M09" || id === "M10") {
    const rounds = id === "M10" ? 2 : 3;
    const first = stamp(primary, {
      label: "A1",
      sets: String(rounds),
      reps: "3–4",
      rir: "3",
      restAfterExercise: "3 min",
    });
    const power = exercise(
      allowedId(p, ["countermovement_jump", "broad_jump"]),
      `${primary.id}:A2`,
      {
        label: "A2",
        sets: String(rounds),
        reps: "3",
        groundContacts: 3,
        restAfterExercise: id === "M10" ? "45 s" : undefined,
        restAfterPair: id === "M09" ? "3 min" : undefined,
        loadTarget: "Każde odbicie szybkie i kontrolowane",
      },
    );
    const pair = [first, power];
    if (id === "M10")
      pair.push(
        exercise("dumbbell_jump_squat", `${primary.id}:A3`, {
          label: "A3",
          sets: String(rounds),
          reps: "3",
          groundContacts: 3,
          restAfterExercise: "45 s",
          loadTarget: "Lekki opór dobrany z trenerem; zachowaj szybkość",
        }),
        exercise("band_assisted_jump", `${primary.id}:A4`, {
          label: "A4",
          sets: String(rounds),
          reps: "3",
          groundContacts: 3,
          restAfterPair: "3 min",
          loadTarget: "Kontrolowana pomoc gumy, bez szarpnięcia",
        }),
      );
    main.blocks = [
      {
        id: `method:${id}:pair`,
        title: id === "M10" ? "Kontrast czterech zadań" : "Para siła–moc",
        blockType: "contrast",
        intent: "power",
        restAfterBlock: "3 min",
        safetyNotes:
          id === "M10"
            ? "Wariant wprowadzający: 2 rundy. Trener kontroluje wszystkie przejścia; wydłuż odpoczynek przy spadku jakości."
            : "Odpocznij po sile oraz po skoku. Zakończ przy pogorszeniu jakości.",
        exercises: pair,
      },
    ];
    if (ham && id === "M09")
      main.blocks.push(...singles([stamp(ham, { sets: "2", restAfterExercise: "90 s" })]));
  } else if (id === "M12" || id === "M13" || id === "M14") {
    const chosen =
      id === "M12"
        ? "flywheel_squat"
        : id === "M14"
          ? "overcoming_pin_squat"
          : allowedId(p, ["long_lever_hamstring_iso", "adductor_bridge_squeeze"]);
    rows = [
      exercise(chosen, primary.id, {
        label: "A",
        sets: id === "M12" ? "2" : "3",
        ...(id === "M12"
          ? {
              reps: "6",
              displayPrescription: "2 × 6 powtórzeń",
              loadTarget: "Lekka konfiguracja wprowadzająca; inercja według trenera",
            }
          : {
              duration: id === "M14" ? "6 s" : "20 s",
              loadTarget:
                id === "M14"
                  ? "Stopniowo narastający nacisk pod nadzorem trenera"
                  : "Stabilna pozycja i spokojny oddech",
            }),
        restAfterExercise: id === "M14" ? "2 min" : "90 s",
        methodExecution: executionFor(id, {
          mode: id === "M12" ? "none" : "hold",
          rounds: id === "M12" ? 2 : 3,
          repetitions: 1,
          workSeconds: id === "M14" ? 6 : 20,
          restSeconds: 0,
          roundRestSeconds: id === "M14" ? 120 : 90,
          intensityLabel: "Dawka wprowadzająca; nadzór i jakość mają pierwszeństwo.",
        }),
      }),
    ];
    if (id === "M13") {
      // Holding isometrics complement the session; choosing a hamstring hold
      // must not erase its only squat/hinge strength exercise.
      rows[0] = { ...rows[0], id: `${primary.id}:isometric`, label: "B1" };
      rows.unshift(stamp(primary, compoundDose));
    }
  }
  if (rows.length) main.blocks = singles(rows);
  sections = capSupport(sections, id === "M10" || id === "M14" ? 2 : 3);
  if (availableMinutes !== undefined && availableMinutes <= 25) {
    main = sections.find((s) => s.type === "main");
    if (main)
      main.blocks = [
        main.blocks.find((b) => b.exercises.some((e) => !isPower(e))) ?? main.blocks[0],
      ]
        .filter(Boolean)
        .map((b) => ({
          ...b,
          blockType: "single",
          exercises: [b.exercises.find((e) => !isPower(e)) ?? b.exercises[0]]
            .filter(Boolean)
            .map((e) => ({
              ...e,
              sets: "2",
              reps: e.duration ? undefined : "4–6",
              restAfterPair: undefined,
              restAfterExercise: "2 min",
              methodExecution: undefined,
              displayPrescription: undefined,
            })),
        }));
    sections = capSupport(sections, 1);
  }
  return balanceStrengthSections(
    sections,
    p,
    availableMinutes === undefined || availableMinutes > 25,
  );
}

export function buildFieldMethod(
  session: SessionDay,
  profile: Profile,
  id: TrainingMethodId,
  conditions: MethodSessionConditions = {},
): TrainingSection[] {
  const p = profileWithMethodEquipment(profile, conditions),
    regular = profile.level !== "beginner",
    phase = methodPhase(session),
    light = phase === "deload" || phase === "adaptation";
  const original = session.structuredSections?.length
    ? clone(session.structuredSections)
    : flatToStructured(session.sections);
  const edges = original.filter((s) => ["warmup", "prep", "cooldown"].includes(s.type));
  let recipe: MethodExecution, canonical: string;
  if (id === "M26") {
    canonical = "easy_aerobic_run";
    recipe = executionFor(id, {
      workSeconds: (regular ? 20 : 12) * 60,
      intensityLabel: "Swobodny bieg, rozmowa pełnymi zdaniami; RPE około 3–4.",
    });
  } else if (id === "M27") {
    canonical = "easy_aerobic_run";
    recipe = executionFor(id, {
      rounds: 1,
      repetitions: 6,
      workSeconds: 20,
      restSeconds: 60,
      intensityLabel: "Kontrolowane tempo submaksymalne; bez przyspieszania do sprintu.",
    });
  } else if (id === "M28") {
    canonical = "method_interval_run";
    recipe = executionFor(id, {
      repetitions: light ? 2 : 3,
      workSeconds: 120,
      restSeconds: 120,
      intensityLabel: "Równe, mocne odcinki około RPE 7–8; bez finiszu do wyczerpania.",
    });
  } else if (id === "M29") {
    canonical = "method_interval_run";
    recipe = executionFor(id, {
      rounds: light ? 1 : 2,
      repetitions: 6,
      workSeconds: 15,
      restSeconds: 15,
      roundRestSeconds: 120,
      intensityLabel: "Powtarzalne tempo; krótki wysiłek z krótkim odpoczynkiem.",
    });
  } else if (id === "M30") {
    canonical = "method_repeated_sprint";
    recipe = executionFor(id, {
      rounds: light ? 1 : 2,
      repetitions: 4,
      distanceM: 20,
      restSeconds: 40,
      roundRestSeconds: 180,
      intensityLabel: "Szybkie odcinki z niepełną regeneracją; kontrola powtarzalności.",
    });
  } else if (id === "M31") {
    canonical = "method_sprint_interval";
    recipe = executionFor(id, {
      repetitions: 3,
      workSeconds: 20,
      restSeconds: 180,
      intensityLabel: "Bardzo wysoki wysiłek pod nadzorem trenera; duży koszt sesji.",
    });
  } else if (id === "M18") {
    canonical = "free_acceleration_sprint";
    recipe = executionFor(id, {
      repetitions: light ? 4 : 6,
      distanceM: regular ? 20 : 10,
      restSeconds: regular ? 120 : 90,
      runOutM: 15,
      intensityLabel: "Jakość przyspieszenia; pełny odpoczynek przed kolejną próbą.",
    });
  } else if (id === "M19") {
    canonical = "flying_sprint";
    recipe = executionFor(id, {
      repetitions: light ? 3 : 4,
      runInM: 20,
      distanceM: 15,
      runOutM: 25,
      restSeconds: 180,
      intensityLabel: "Lotny odcinek po płynnym rozbiegu; pełna droga wyhamowania.",
    });
  } else if (id === "M20") {
    const gear = methodEquipment(p, conditions);
    canonical = gear.has("hill")
      ? "hill_acceleration"
      : gear.has("sled")
        ? "resisted_sled_acceleration"
        : "band_resisted_acceleration";
    recipe = executionFor(id, {
      repetitions: 4,
      distanceM: 15,
      restSeconds: 150,
      runOutM: 20,
      intensityLabel: "Opór dobrany do techniki; bez uniwersalnego procentu masy ciała.",
    });
  } else if (id === "M21") {
    canonical = "assisted_straight_sprint";
    recipe = executionFor(id, {
      repetitions: 3,
      runInM: 25,
      distanceM: 15,
      runOutM: 35,
      restSeconds: 240,
      intensityLabel: "Kontrolowana asysta ustawiona przez trenera.",
    });
  } else if (id === "M22") {
    canonical = "method_speed_endurance";
    recipe = executionFor(id, {
      repetitions: 3,
      distanceM: 80,
      runOutM: 35,
      restSeconds: 300,
      intensityLabel:
        "Dawka wytrzymałości szybkościowej dobrana z trenerem; bez automatycznego kopiowania objętości lekkoatlety.",
    });
  } else if (id === "M23") {
    canonical = "progressive_run_three_step_stop";
    recipe = executionFor(id, {
      repetitions: 4,
      distanceM: 10,
      runOutM: 10,
      restSeconds: 75,
      intensityLabel:
        "Kontrolowane wejście i stabilne zatrzymanie; nie zaczynaj od maksymalnej prędkości.",
    });
  } else if (id === "M24") {
    canonical = "planned_cut";
    recipe = executionFor(id, {
      rounds: 2,
      repetitions: 3,
      distanceM: 10,
      restSeconds: 60,
      roundRestSeconds: 120,
      intensityLabel: "Pierwsza runda w lewo, druga w prawo; zaplanowany łagodny kąt.",
    });
  } else if (id === "M25") {
    canonical = "planned_cut";
    recipe = executionFor(id, {
      rounds: 2,
      repetitions: 3,
      distanceM: 10,
      restSeconds: 60,
      roundRestSeconds: 120,
      intensityLabel: "Partner wybiera kierunek ruchem; zawodnik reaguje po jego działaniu.",
    });
  } else if (id === "M32") {
    canonical = "football_technical_self_selected";
    recipe = executionFor(id, {
      rounds: 2,
      repetitions: 3,
      workSeconds: 40,
      restSeconds: 40,
      roundRestSeconds: 90,
      intensityLabel:
        "Przyjęcie kierunkowe do dwóch bramek: spójrz przed podaniem/odbiciem i wybierz wolny kierunek.",
    });
  } else if (id === "M33") {
    canonical = "football_technical_self_selected";
    recipe = executionFor(id, {
      repetitions: 3,
      workSeconds: 120,
      restSeconds: 90,
      intensityLabel:
        "Gra 2 na 2 na dwie małe bramki; punkt po przyjęciu i podaniu w wolny korytarz.",
    });
  } else
    throw new Error("Ta pozycja organizuje trening lub naukę i nie jest osobną sesją ćwiczeń.");
  if (!getExerciseDefinition(canonical))
    throw new Error(`Nie ma zatwierdzonego ćwiczenia dla tej metody (${canonical}).`);
  const pace =
    profile.fieldMasKmh &&
    isFieldMasCurrent(profile.fieldMasTestedAt, session.date) &&
    ["M26", "M28", "M29"].includes(id)
      ? paceRangeFromMas(
          profile.fieldMasKmh,
          id === "M26" ? 65 : id === "M28" ? 90 : 100,
          id === "M26" ? 75 : id === "M28" ? 95 : 105,
        )
      : null;
  if (pace)
    recipe.intensityLabel += ` Orientacyjne tempo z aktualnego testu: ${pace.label}. Dostosuj do warunków i odczucia wysiłku.`;
  const name = getExerciseDefinition(canonical)!.displayNamePl;
  const dose = recipe.workSeconds
    ? `${recipe.workSeconds} s`
    : recipe.distanceM
      ? `${recipe.distanceM} m`
      : "według instrukcji";
  const count =
    recipe.rounds > 1
      ? `${recipe.rounds} bloki × ${recipe.repetitions}`
      : String(recipe.repetitions);
  const work = exercise(canonical, `method:${id}:main`, {
    name,
    sets: String(recipe.rounds * recipe.repetitions),
    reps: recipe.distanceM ? `${recipe.distanceM} m` : undefined,
    duration: recipe.workSeconds ? `${recipe.workSeconds} s` : undefined,
    displayPrescription:
      (recipe.mode === "continuous"
        ? `${Math.round((recipe.workSeconds ?? 0) / 60)} min`
        : `${count} × ${dose}`) + (pace ? ` · ${pace.label}` : ""),
    restAfterExercise: recipe.restSeconds ? `${recipe.restSeconds} s` : undefined,
    methodExecution: recipe,
    cue: recipe.focus,
    technique: recipe.intensityLabel,
  });
  if (id === "M25" || id === "M32" || id === "M33")
    work.instructionSteps = [
      {
        title: "Przygotuj",
        description:
          id === "M25"
            ? "Wyznaczcie dwa kierunki i wolną przestrzeń; partner stoi naprzeciw zawodnika."
            : "Wyznacz dwa cele podania albo dwie bramki; przygotuj piłkę i ustaw przestrzeń zadania.",
      },
      { title: "Wykonaj", description: recipe.intensityLabel },
      {
        title: "Oceń",
        description:
          "Po próbie zawodnik lub trener ocenia decyzję i wykonanie. Telefon nie potwierdza kierunku ani czasu reakcji.",
      },
    ];
  return [
    ...edges.filter((s) => s.type !== "cooldown"),
    {
      id: `method:${id}:section`,
      title: id === "M32" || id === "M33" ? "Zadanie piłkarskie" : "Część główna",
      type: "main",
      blocks: [
        {
          id: `method:${id}:block`,
          title: getTrainingMethod(id)!.name,
          blockType: id === "M23" || id === "M24" ? "deceleration" : "single",
          intent: id === "M23" || id === "M24" ? "braking" : "strength",
          exercises: [work],
          safetyNotes: recipe.stopRule,
        },
      ],
    },
    ...edges.filter((s) => s.type === "cooldown"),
  ];
}

export function flatMethodSections(sections: TrainingSection[]) {
  return structuredToFlat(sections);
}
