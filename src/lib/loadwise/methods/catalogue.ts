import { METHOD_RESEARCH_SOURCES, METHOD_RESEARCH_SUMMARY } from "./research";
import type {
  MethodDomain,
  MethodExecution,
  TrainingMethodDefinition,
  TrainingMethodId,
} from "./types";

type Rules = Omit<
  TrainingMethodDefinition,
  | "id"
  | "name"
  | "purpose"
  | "requirements"
  | "sources"
  | "evidenceNote"
  | "coachingFocus"
  | "stopRule"
> &
  Partial<Pick<TrainingMethodDefinition, "evidenceNote" | "coachingFocus" | "stopRule">>;
const workout = (
  domain: MethodDomain,
  clock: TrainingMethodDefinition["clock"],
  extra: Partial<Rules> = {},
): Rules => ({ domain, clock, role: "workout", ...extra });
const support = (domain: MethodDomain, extra: Partial<Rules> = {}): Rules => ({
  domain,
  clock: "none",
  role: "support",
  ...extra,
});
const loaded = ["barbell", "dumbbell", "kettlebell", "trap_bar", "machine"];
const experienced = {
  minAge: 18,
  minMonths: 12,
  minGymLevel: "intermediate",
  minCompetence: "high",
} as const;
const coached = {
  ...experienced,
  minMonths: 24,
  minGymLevel: "advanced",
  requiresCoach: true,
  manualOnly: true,
} as const;
const RULES: Record<TrainingMethodId, Rules> = {
  M01: support("preparation"),
  M02: workout("strength", "none"),
  M03: workout("strength", "none", { ...experienced, minMonths: 6, minCompetence: "medium" }),
  M04: workout("strength", "none", { ...experienced, manualOnly: true }),
  M05: workout("strength", "none", { manualOnly: true }),
  M06: workout("power", "none", {
    minMonths: 6,
    minGymLevel: "intermediate",
    minCompetence: "medium",
  }),
  M07: workout("power", "none", { ...coached, equipment: ["barbell", "platform"], highCost: true }),
  M08: workout("strength", "cluster", {
    ...experienced,
    anyEquipment: loaded,
    evidenceNote:
      "Klastry pomagają zachować prędkość w danej sesji. Nie oznacza to stałej przewagi długoterminowej nad zwykłymi seriami.",
  }),
  M09: workout("power", "none", {
    ...experienced,
    minMonths: 24,
    minGymLevel: "advanced",
    highCost: true,
    evidenceNote:
      "Para siła–moc jest opcją dla doświadczonego zawodnika. Nie gwarantuje PAPE; potrzebna przerwa i reakcja na zmęczenie są indywidualne.",
  }),
  M10: workout("power", "none", {
    ...coached,
    equipment: ["band", "dumbbell", "rack"],
    highCost: true,
    evidenceNote:
      "Mała baza badań u dorosłych daje zachęcające wyniki. Nie wykazano pewnej przewagi nad innymi kontrastami; to opcja pod nadzorem, nie obowiązkowy kolejny poziom.",
  }),
  M11: workout("strength", "none", {
    minMonths: 6,
    minGymLevel: "intermediate",
    minCompetence: "medium",
    manualOnly: true,
  }),
  M12: workout("strength", "none", {
    ...coached,
    equipment: ["flywheel"],
    highCost: true,
    evidenceNote:
      "Najpierw zapoznanie z urządzeniem i hamowaniem. Inercja nie jest kilogramami, a samo użycie flywheel nie potwierdza przeciążenia ekscentrycznego.",
  }),
  M13: workout("strength", "hold", {
    manualOnly: true,
    evidenceNote:
      "Efekt zależy od kąta, długości mięśnia, siły i intencji. Utrzymanie 20 s jest dawką wprowadzającą, nie uniwersalną terapią ani zamiennikiem całej siły.",
  }),
  M14: workout("strength", "hold", {
    ...coached,
    equipment: ["fixed_pins", "barbell", "rack"],
    highCost: true,
  }),
  M15: workout("strength", "none", {
    ...coached,
    equipment: ["band", "barbell", "rack"],
    manualOnly: true,
  }),
  M16: support("power"),
  M17: workout("power", "none", { ...coached, highCost: true }),
  M18: workout("sprint", "intervals", { minSpaceM: 35 }),
  M19: workout("sprint", "intervals", { minSpaceM: 60, minCompetence: "medium", highCost: true }),
  M20: workout("sprint", "intervals", {
    minAge: 16,
    minCompetence: "medium",
    minSpaceM: 40,
    anyEquipment: ["sled", "band", "hill"],
    manualOnly: true,
  }),
  M21: workout("sprint", "intervals", {
    ...coached,
    equipment: ["assistance_rig"],
    minSpaceM: 80,
    highCost: true,
  }),
  M22: workout("sprint", "intervals", { ...coached, minSpaceM: 150, highCost: true }),
  M23: workout("sprint", "intervals", { minSpaceM: 25 }),
  M24: workout("sprint", "intervals", { minSpaceM: 25 }),
  M25: workout("sprint", "reactive", { minSpaceM: 25, minParticipants: 2, manualOnly: true }),
  M26: workout("conditioning", "continuous"),
  M27: workout("conditioning", "intervals", { manualOnly: true }),
  M28: workout("conditioning", "intervals", { highCost: true }),
  M29: workout("conditioning", "intervals", { highCost: true }),
  M30: workout("conditioning", "intervals", {
    minAge: 16,
    minCompetence: "medium",
    minSpaceM: 40,
    manualOnly: true,
    highCost: true,
  }),
  M31: workout("conditioning", "intervals", { ...coached, minSpaceM: 400, highCost: true }),
  M32: workout("skills", "intervals"),
  M33: workout("skills", "intervals", { minParticipants: 4, minSpaceM: 20, manualOnly: true }),
  M34: { ...support("coaching"), role: "coaching" },
  M35: { ...support("coaching"), role: "coaching" },
  M36: support("preparation", {
    evidenceNote:
      "Badania FIFA 11+ dotyczą pełnego programu. Własna rozgrzewka BallWise nie jest jego równoważną kopią.",
  }),
  M37: support("support"),
  M38: { ...support("planning"), role: "planning" },
  M39: workout("strength", "velocity", {
    ...coached,
    equipment: ["velocity_device"],
    requiresVelocityDevice: true,
    evidenceNote:
      "Sterowanie wymaga pomiaru sprawdzonego dla danego ćwiczenia; telefon nie zgaduje prędkości sztangi.",
  }),
  M40: {
    ...support("planning"),
    role: "planning",
    evidenceNote:
      "Mniejsza objętość może być przydatna; nie ustalono jednej minimalnej skutecznej dawki.",
  },
  M41: {
    ...support("planning"),
    role: "planning",
    evidenceNote:
      "Praktyczna organizacja tygodnia; bez gwarancji prewencji urazu ani sztywnej reguły dla każdego terminarza.",
  },
  M42: { ...support("planning"), role: "planning" },
  M43: { ...support("planning"), role: "planning" },
  M44: { ...support("planning"), role: "planning" },
};
const FOCUS: Partial<Record<TrainingMethodId, string>> = {
  M02: "Powtarzalne ustawienie i spokojna kontrola ruchu.",
  M03: "Zostaw zapas i utrzymuj ten sam zakres ruchu.",
  M06: "Każde powtórzenie wykonaj szybko i pod kontrolą.",
  M08: "Odpocznij wewnątrz serii; kolejna grupa ma zachować jakość.",
  M09: "Po sile odpocznij przed ruchem mocy.",
  M10: "Cztery różne zadania, wspólny cel mocy i pełna kontrola lądowania.",
  M11: "Kontroluj fazę opuszczania; nie dodawaj dodatkowych serii hamstringów.",
  M12: "Zacznij od lekkiego ustawienia urządzenia i nauki hamowania.",
  M13: "Utrzymuj wskazaną pozycję i spokojnie oddychaj.",
  M14: "Nacisk kieruj w nieruchomy, pewnie ustawiony opór.",
  M18: "Mocno odepchnij podłoże i rozpędzaj się płynnie.",
  M19: "Rozpędź się płynnie; szybki odcinek zacznij po rozbiegu.",
  M20: "Opór ma pozwalać zachować zamierzony sposób biegu.",
  M23: "Przyjmij prędkość krótkimi krokami i zatrzymaj się stabilnie.",
  M24: "Najpierw wytrać prędkość, potem zmień kierunek.",
  M25: "Czytaj ruch partnera; wybierz kierunek po jego działaniu.",
  M26: "Utrzymuj swobodny oddech i możliwość rozmowy.",
  M28: "Utrzymuj równe odcinki bez finiszu do wyczerpania.",
  M29: "Krótki odcinek i odpoczynek tworzą jedną dawkę.",
  M30: "Celem jest powtarzalność szybkich akcji; obserwuj spadek jakości.",
  M32: "Spójrz przed przyjęciem i wybierz kierunek pierwszego kontaktu.",
  M33: "Oceniaj ustawienie rywala i wolną przestrzeń przed działaniem.",
  M34: "Zauważ istotną informację i uzasadnij wybór.",
  M35: "Skup się na jednej wskazówce w tej serii.",
  M39: "Wpisuj wyłącznie pomiary z potwierdzonego urządzenia.",
};
const STOP: Partial<Record<TrainingMethodId, string>> = {
  M18: "Zakończ szybkie próby, gdy nie utrzymujesz jakości biegu; wydłuż odpoczynek przed następną próbą.",
  M19: "Zakończ szybki odcinek przed utratą kontroli. Zostaw całą drogę wyhamowania.",
  M20: "Zmniejsz opór lub zakończ, jeśli nie utrzymujesz zamierzonej techniki.",
  M25: "Przerwij, gdy reakcja wymusza chaotyczne hamowanie lub zbyt małą przestrzeń.",
  M30: "Zakończ blok przy wyraźnym pogorszeniu wykonania; stoper sam tego nie ocenia.",
  M39: "Oceń utratę prędkości na podstawie ważnych pomiarów i progu ustawionego z trenerem.",
};
export const TRAINING_METHODS: readonly TrainingMethodDefinition[] = METHOD_RESEARCH_SUMMARY.map(
  (row) => {
    const id = row.id as TrainingMethodId,
      rule = RULES[id];
    return {
      id,
      name: row.method,
      purpose: row.purpose,
      requirements: row.requirements,
      sources: row.sourceIds.map(
        (source) => METHOD_RESEARCH_SOURCES.find((s) => s.id === source)!.url,
      ),
      evidenceNote:
        "Dobór zależy od celu, doświadczenia i kontekstu. Zasady produktu nie są uniwersalnym progiem biologicznym.",
      coachingFocus: FOCUS[id] ?? "Utrzymuj cel i jakość zaplanowanej pracy.",
      stopRule:
        STOP[id] ??
        "Zakończ serię przy utracie kontroli ruchu lub bólu. Nie wykonuj dodatkowych powtórzeń ponad plan.",
      ...rule,
    };
  },
);
const INDEX = new Map(TRAINING_METHODS.map((m) => [m.id, m]));
export const getTrainingMethod = (id: string | null | undefined) =>
  INDEX.get(id as TrainingMethodId);
export function isTrainingMethodId(value: unknown): value is TrainingMethodId {
  return typeof value === "string" && INDEX.has(value as TrainingMethodId);
}

/** Default execution settings of one catalogued method, with optional overrides. */
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
