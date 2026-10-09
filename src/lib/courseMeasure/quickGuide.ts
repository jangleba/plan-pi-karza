export interface QuickGuide {
  setup: string | null;
  action: string | null;
  focus: string | null;
  error: string | null;
}

interface GuideExercise {
  exerciseId?: string;
  setup?: string;
  technique?: string;
  cue?: string;
  commonMistake?: string;
  instructionSteps?: ReadonlyArray<{ title?: string; description?: string }>;
}

interface GuideDefinition {
  instructionsPl?: ReadonlyArray<string>;
  coachingCues?: ReadonlyArray<string>;
  commonErrors?: ReadonlyArray<string>;
}

/** Edited summaries of the existing exercise library; prescriptions stay in LoadWise. */
const SHORT_GUIDES: Record<
  string,
  Pick<QuickGuide, "setup" | "action" | "focus"> & { error?: string }
> = {
  a_skip: {
    setup: "Stań wysoko. Stopa zadarta, ręce pracują naprzemiennie.",
    action:
      "Unieś kolano do wysokości biodra. Sprowadź stopę pod siebie i zmień nogę w równym rytmie.",
    focus: "Biodra wysoko, kontakt pod sobą.",
  },
  a_skip_add_step: {
    setup:
      "Ustaw pozycję A: kolano wysoko, stopa zadarta, przeciwne ramię z przodu.",
    action:
      "Wykonaj dodatkowe odbicie na tej samej nodze podporowej, potem zmień nogi do pozycji A.",
    focus: "Dodatkowe odbicie → zmiana nóg. Powtarzaj równy rytm.",
  },
  a_skip_no_add_step: {
    setup: "Stań wysoko i ustaw naprzemienną pracę rąk.",
    action:
      "Prowadź kolano do wysokości biodra i zmieniaj nogi płynnie, bez dodatkowego odbicia.",
    focus: "Równy rytm, biodra wysoko.",
  },
  b_skip: {
    setup: "Stań wysoko, z luźnymi barkami.",
    action:
      "Unieś kolano, otwórz podudzie bez blokowania kolana i aktywnie sprowadź stopę pod biodro.",
    focus: "Unieś → otwórz → zgarnij. Kontakt pod sobą.",
  },
  c_skip: {
    setup: "Tułów wysoko, barki rozluźnione.",
    action:
      "Prowadź piętę krótko pod pośladek, naprzemiennie. Wracaj stopą pod biodro.",
    focus: "Krótki cykl nogi, równy rytm.",
  },
  d_skip: {
    setup: "Stań wysoko. Ruch prowadź z biodra.",
    action:
      "Wymieniaj nogi nożycowo. Sprowadzaj stopę aktywnie pod ciało, utrzymując sprężysty kontakt.",
    focus: "Stopa pod sobą, bez dalekiego wykroku.",
  },
  wall_march: {
    setup:
      "Dłonie oprzyj o ścianę na wysokości barków. Ciało utrzymuj w jednej linii.",
    action:
      "Unoś naprzemiennie kolano do przodu, pchając podłoże nogą podporową.",
    focus: "Zachowaj pochylenie całego ciała; nie zginaj się w pasie.",
  },
  falling_start: {
    setup: "Stań ze stopami pod biodrami. Wychyl całe ciało do przodu.",
    action:
      "Gdy tracisz równowagę, zrób pierwszy krok i płynnie przyspieszaj do końca odcinka z planu.",
    focus: "Pchaj podłoże za siebie i prostuj się stopniowo.",
  },
  split_stance_start: {
    setup:
      "Jedna stopa lekko z przodu, ciężar głównie na niej. Pochyl całe ciało.",
    action:
      "Odepchnij się i przyspieszaj przez cały odcinek z planu. Zmieniaj nogę startową.",
    focus: "Pierwsze kroki kieruj do przodu, bez kołysania do tyłu.",
  },
  free_acceleration_sprint: {
    setup: "Wygodny start. Rozluźnij barki.",
    action:
      "Przyspieszaj przez cały odcinek. Wyhamuj stopniowo za znacznikiem.",
    focus: "Pchaj podłoże za siebie; prostuj się stopniowo.",
    error: "Nie prostuj się od razu.",
  },
  flying_sprint: {
    setup:
      "Oddziel rozbieg, szybki odcinek i miejsce na wyhamowanie zgodnie z planem.",
    action:
      "Płynnie rozpędź się, przebiegnij szybki odcinek i stopniowo wyhamuj za nim.",
    focus: "Biodra wysoko, barki i twarz rozluźnione.",
  },
};

function clean(text: string | null | undefined): string | null {
  return text?.replace(/\s+/g, " ").trim() || null;
}

export function resolveQuickGuide(
  exercise: GuideExercise,
  definition?: GuideDefinition,
): QuickGuide {
  const edited = exercise.exerciseId
    ? SHORT_GUIDES[exercise.exerciseId]
    : undefined;
  // Explicit session-specific steps take precedence over general summaries.
  const specific = exercise.instructionSteps
    ?.map((step) =>
      clean([step.title, step.description].filter(Boolean).join(" — ")),
    )
    .filter((step): step is string => Boolean(step));
  const steps = specific?.length
    ? specific
    : (definition?.instructionsPl
        ?.map(clean)
        .filter((step): step is string => Boolean(step)) ?? []);
  const useEdited = !specific?.length;
  return {
    setup:
      clean(exercise.setup) ??
      (useEdited ? edited?.setup : null) ??
      steps[0] ??
      null,
    action:
      (useEdited ? edited?.action : null) ??
      steps[1] ??
      clean(exercise.technique),
    focus:
      (useEdited ? edited?.focus : null) ??
      clean(exercise.cue) ??
      clean(definition?.coachingCues?.[0]),
    error:
      clean(exercise.commonMistake) ??
      (useEdited ? edited?.error : null) ??
      clean(definition?.commonErrors?.[0]),
  };
}
