export type FuelTab = "now" | "day" | "food";
export type SessionKind =
  | "football_training"
  | "match"
  | "strength"
  | "sprint"
  | "conditioning"
  | "recovery";
export type SessionLoad = "low" | "moderate" | "high" | "match";
export type FuelPhase =
  | "idle"
  | "early"
  | "main_meal"
  | "top_up"
  | "last_hour"
  | "during"
  | "recovery"
  | "complete";
export type FuelCoreState = "quiet" | "needs_action" | "ready" | "active" | "recovery";

export interface AthleteProfile {
  id: string;
  bodyMassKg?: number;
  age?: number;
  dietaryPattern?: "omnivore" | "vegetarian" | "vegan";
  allergens?: string[];
  requiresClinicalPlan?: boolean;
}

export interface TrainingSession {
  id: string;
  startAt: string;
  durationMinutes: number;
  kind: SessionKind;
  load: SessionLoad;
  title: string;
}

export interface FuelEntry {
  id: string;
  loggedAt: string;
  kind: "meal" | "snack" | "fluid";
  label: string;
  sessionId?: string;
}

export interface QuickSignals {
  hunger?: "low" | "normal" | "high";
  gutComfort?: "light" | "normal" | "heavy";
  prepMinutes?: 2 | 10 | 20;
  place?: "home" | "store" | "out";
  lastMeal?: "under_1h" | "1_to_3h" | "over_3h" | "unknown";
}

export interface FuelContext {
  now: string;
  athlete: AthleteProfile;
  session?: TrainingSession;
  nextSessionAt?: string;
  entries?: FuelEntry[];
  signals?: QuickSignals;
  hotConditions?: boolean;
}

export interface EvidenceSource {
  id: string;
  shortName: string;
  citation: string;
  url: string;
  supports: string[];
}

export interface FuelTarget {
  id: "carbohydrate" | "fluid" | "protein";
  label: string;
  min?: number;
  max?: number;
  unit: "g" | "ml" | "g/kg" | "g/h";
  display: string;
  evidenceIds: string[];
  interpretation: "consensus" | "operational" | "individual";
}

export interface MealOption {
  id: string;
  name: string;
  description: string;
  prepMinutes: number;
  places: Array<"home" | "store" | "out">;
  phases: FuelPhase[];
  loads: SessionLoad[];
  allergens: string[];
  vegetarian: boolean;
  vegan: boolean;
  gentle: boolean;
  tags: string[];
}

export interface FuelRecommendation {
  phase: FuelPhase;
  coreState: FuelCoreState;
  minutesToStart: number | null;
  eyebrow: string;
  title: string;
  subtitle: string;
  primaryAction: string;
  alternateAction: string;
  targets: FuelTarget[];
  reasons: string[];
  tips: string[];
  options: MealOption[];
  evidenceIds: string[];
  safetyNotes: string[];
  numericPersonalisation: boolean;
  disclaimer: string;
}

export const EVIDENCE_SOURCES: EvidenceSource[] = [
  {
    id: "uefa-2021",
    shortName: "UEFA 2021",
    citation:
      "Collins J. i wsp. UEFA expert group statement on nutrition in elite football. Br J Sports Med. 2021;55:416–442.",
    url: "https://doi.org/10.1136/bjsports-2019-101961",
    supports: [
      "periodyzację węglowodanów zgodnie z obciążeniem",
      "1–3 g/kg węglowodanów 3–4 h przed meczem",
      "5–7 ml/kg płynów 2–4 h przed rozpoczęciem",
      "30–60 g/h węglowodanów w meczu po wcześniejszym przećwiczeniu strategii",
      "około 1 g/kg/h węglowodanów przez 4 h przy pilnej regeneracji",
      "podejście food first"
    ]
  },
  {
    id: "portugal-2021",
    shortName: "FPF 2021",
    citation:
      "Abreu R. i wsp. Portuguese Football Federation consensus statement 2020: nutrition and performance in football. BMJ Open Sport Exerc Med. 2021;7:e001082.",
    url: "https://doi.org/10.1136/bmjsem-2021-001082",
    supports: [
      "30–60 g/h węglowodanów podczas meczu",
      "5–7 ml/kg płynów 2–3 h przed meczem",
      "indywidualizację według tolerancji i warunków"
    ]
  },
  {
    id: "cho-review-2024",
    shortName: "Przegląd 2024",
    citation:
      "Pueyo M. i wsp. Influence of Carbohydrate Intake on Different Parameters of Soccer Players' Performance: Systematic Review. Nutrients. 2024.",
    url: "https://pubmed.ncbi.nlm.nih.gov/39519564/",
    supports: [
      "korzyści spożycia węglowodanów przed i podczas meczu dla sprintu, zmęczenia oraz części parametrów technicznych i poznawczych",
      "brak podstaw do obiecywania poprawy każdego elementu gry"
    ]
  },
  {
    id: "reds-2023",
    shortName: "IOC REDs 2023",
    citation:
      "Mountjoy M. i wsp. 2023 IOC consensus statement on Relative Energy Deficiency in Sport. Br J Sports Med. 2023;57:1073–1097.",
    url: "https://pubmed.ncbi.nlm.nih.gov/37752011/",
    supports: [
      "ostrzeżenie przed przewlekle zbyt niską dostępnością energii",
      "unikanie automatycznego promowania restrykcji żywieniowych"
    ]
  }
];

export const MEAL_OPTIONS: MealOption[] = [
  {
    id: "rice-chicken-mango",
    name: "Ryż jaśminowy, kurczak i mango",
    description: "Pełny posiłek przed wymagającą sesją.",
    prepMinutes: 20,
    places: ["home", "out"],
    phases: ["early", "main_meal", "recovery"],
    loads: ["moderate", "high", "match"],
    allergens: [],
    vegetarian: false,
    vegan: false,
    gentle: true,
    tags: ["pełny posiłek", "wysokie paliwo"]
  },
  {
    id: "pasta-turkey",
    name: "Pasta pomodoro z indykiem",
    description: "Znany, prosty posiłek z przewagą węglowodanów.",
    prepMinutes: 20,
    places: ["home", "out"],
    phases: ["early", "main_meal", "recovery"],
    loads: ["moderate", "high", "match"],
    allergens: ["gluten"],
    vegetarian: false,
    vegan: false,
    gentle: true,
    tags: ["pełny posiłek"]
  },
  {
    id: "oats-banana-vanilla",
    name: "Owsianka banan–wanilia",
    description: "Z jogurtem lub napojem roślinnym i miękkimi owocami.",
    prepMinutes: 8,
    places: ["home"],
    phases: ["main_meal", "top_up", "recovery"],
    loads: ["low", "moderate", "high", "match"],
    allergens: ["gluten", "milk"],
    vegetarian: true,
    vegan: false,
    gentle: true,
    tags: ["szybkie", "ciepłe"]
  },
  {
    id: "rice-pudding-banana",
    name: "Ryż na mleku z bananem",
    description: "Lekka opcja, gdy do treningu zostało mniej czasu.",
    prepMinutes: 5,
    places: ["home", "store"],
    phases: ["top_up", "last_hour", "recovery"],
    loads: ["low", "moderate", "high", "match"],
    allergens: ["milk"],
    vegetarian: true,
    vegan: false,
    gentle: true,
    tags: ["lekki", "5 min"]
  },
  {
    id: "sandwiches-juice",
    name: "Jasne pieczywo z dżemem + sok",
    description: "Szybkie, proste źródła węglowodanów bez eksperymentowania.",
    prepMinutes: 2,
    places: ["home", "store"],
    phases: ["top_up", "last_hour"],
    loads: ["moderate", "high", "match"],
    allergens: ["gluten"],
    vegetarian: true,
    vegan: true,
    gentle: true,
    tags: ["2 min", "awaryjne"]
  },
  {
    id: "banana-rice-cakes",
    name: "Banan + wafle ryżowe z miodem",
    description: "Mała, znana przekąska blisko rozpoczęcia sesji.",
    prepMinutes: 2,
    places: ["home", "store", "out"],
    phases: ["last_hour"],
    loads: ["low", "moderate", "high", "match"],
    allergens: [],
    vegetarian: true,
    vegan: false,
    gentle: true,
    tags: ["2 min", "lekki"]
  },
  {
    id: "yogurt-cereal-fruit",
    name: "Skyr, płatki i owoce",
    description: "Prosty zestaw łączący węglowodany i białko po sesji.",
    prepMinutes: 5,
    places: ["home", "store"],
    phases: ["recovery"],
    loads: ["low", "moderate", "high", "match"],
    allergens: ["milk", "gluten"],
    vegetarian: true,
    vegan: false,
    gentle: true,
    tags: ["regeneracja", "5 min"]
  },
  {
    id: "tofu-rice-bowl",
    name: "Miska ryżu z tofu i warzywami",
    description: "Roślinny pełny posiłek do odbudowy po wysiłku.",
    prepMinutes: 20,
    places: ["home", "out"],
    phases: ["main_meal", "recovery"],
    loads: ["low", "moderate", "high", "match"],
    allergens: ["soy"],
    vegetarian: true,
    vegan: true,
    gentle: false,
    tags: ["roślinny", "pełny posiłek"]
  }
];

const roundTo50 = (value: number) => Math.max(50, Math.round(value / 50) * 50);
const roundTo5 = (value: number) => Math.max(5, Math.round(value / 5) * 5);

export function getMinutesToStart(nowIso: string, session?: TrainingSession): number | null {
  if (!session) return null;
  const now = new Date(nowIso).getTime();
  const start = new Date(session.startAt).getTime();
  if (!Number.isFinite(now) || !Number.isFinite(start)) return null;
  return Math.round((start - now) / 60_000);
}

export function getFuelPhase(nowIso: string, session?: TrainingSession): FuelPhase {
  if (!session) return "idle";
  const minutes = getMinutesToStart(nowIso, session);
  if (minutes === null) return "idle";
  if (minutes > 240) return "early";
  if (minutes > 180) return "main_meal";
  if (minutes > 60) return "top_up";
  if (minutes >= 0) return "last_hour";
  if (minutes >= -session.durationMinutes) return "during";
  if (minutes >= -(session.durationMinutes + 240)) return "recovery";
  return "complete";
}

function numericPersonalisationAllowed(profile: AthleteProfile): boolean {
  return Boolean(
    profile.bodyMassKg &&
      profile.bodyMassKg >= 35 &&
      profile.bodyMassKg <= 180 &&
      (profile.age === undefined || profile.age >= 16) &&
      !profile.requiresClinicalPlan
  );
}

function filterMeals(context: FuelContext, phase: FuelPhase): MealOption[] {
  const allergens = new Set((context.athlete.allergens ?? []).map((item) => item.toLowerCase()));
  const signals = context.signals ?? {};
  const pattern = context.athlete.dietaryPattern ?? "omnivore";

  const filtered = MEAL_OPTIONS.filter((meal) => {
    if (!meal.phases.includes(phase)) return false;
    if (context.session && !meal.loads.includes(context.session.load)) return false;
    if (meal.allergens.some((allergen) => allergens.has(allergen.toLowerCase()))) return false;
    if (pattern === "vegan" && !meal.vegan) return false;
    if (pattern === "vegetarian" && !meal.vegetarian) return false;
    if (signals.place && !meal.places.includes(signals.place)) return false;
    if (signals.prepMinutes && meal.prepMinutes > signals.prepMinutes) return false;
    if (signals.gutComfort === "heavy" && !meal.gentle) return false;
    return true;
  });

  const fallback = MEAL_OPTIONS.filter((meal) => {
    if (!meal.phases.includes(phase)) return false;
    if (meal.allergens.some((allergen) => allergens.has(allergen.toLowerCase()))) return false;
    if (pattern === "vegan" && !meal.vegan) return false;
    if (pattern === "vegetarian" && !meal.vegetarian) return false;
    return true;
  });

  return (filtered.length ? filtered : fallback).slice(0, 3);
}

function buildTargets(context: FuelContext, phase: FuelPhase): FuelTarget[] {
  const profile = context.athlete;
  const bodyMass = profile.bodyMassKg;
  const allowed = numericPersonalisationAllowed(profile);
  const session = context.session;
  if (!allowed || !bodyMass || !session) return [];

  const targets: FuelTarget[] = [];

  if (phase === "main_meal") {
    const multiplierMax = session.load === "match" ? 3 : session.load === "high" ? 2 : 1.5;
    const min = roundTo5(bodyMass * 1);
    const max = roundTo5(bodyMass * multiplierMax);
    targets.push({
      id: "carbohydrate",
      label: "Węglowodany w posiłku",
      min,
      max,
      unit: "g",
      display: `${min}–${max} g`,
      evidenceIds: ["uefa-2021"],
      interpretation: session.load === "match" ? "consensus" : "operational"
    });
  }

  if ((phase === "main_meal" || phase === "top_up") && getMinutesToStart(context.now, session)! <= 240) {
    const min = roundTo50(bodyMass * 5);
    const max = roundTo50(bodyMass * 7);
    targets.push({
      id: "fluid",
      label: "Płyny w oknie 2–4 h",
      min,
      max,
      unit: "ml",
      display: `${min}–${max} ml`,
      evidenceIds: ["uefa-2021", "portugal-2021"],
      interpretation: "consensus"
    });
  }

  if (phase === "during" && (session.load === "match" || session.durationMinutes > 75)) {
    targets.push({
      id: "carbohydrate",
      label: "Węglowodany podczas wysiłku",
      min: 30,
      max: 60,
      unit: "g/h",
      display: "30–60 g/h",
      evidenceIds: ["uefa-2021", "portugal-2021", "cho-review-2024"],
      interpretation: "individual"
    });
  }

  if (phase === "recovery") {
    const urgentRecovery = Boolean(
      session.load === "match" ||
        (context.nextSessionAt &&
          new Date(context.nextSessionAt).getTime() - new Date(context.now).getTime() < 24 * 60 * 60 * 1000)
    );

    if (urgentRecovery) {
      const carb = roundTo5(bodyMass * 1);
      targets.push({
        id: "carbohydrate",
        label: "Pierwsza godzina regeneracji",
        min: carb,
        max: carb,
        unit: "g",
        display: `około ${carb} g`,
        evidenceIds: ["uefa-2021"],
        interpretation: "consensus"
      });
    }

    const proteinMin = roundTo5(bodyMass * 0.3);
    const proteinMax = roundTo5(bodyMass * 0.4);
    targets.push({
      id: "protein",
      label: "Białko w posiłku regeneracyjnym",
      min: proteinMin,
      max: proteinMax,
      unit: "g",
      display: `${proteinMin}–${proteinMax} g`,
      evidenceIds: ["uefa-2021"],
      interpretation: "consensus"
    });
  }

  return targets;
}

function phaseCopy(phase: FuelPhase, session?: TrainingSession) {
  const sessionName = session?.title ?? "sesja";
  switch (phase) {
    case "idle":
      return {
        coreState: "quiet" as const,
        eyebrow: "BRAK NAJBLIŻSZEJ SESJI",
        title: "Dodaj trening do Planu",
        subtitle: "Fuel wykorzysta godzinę, rodzaj i obciążenie sesji.",
        primaryAction: "Przejdź do Planu",
        alternateAction: "Dodaj jedzenie"
      };
    case "early":
      return {
        coreState: "quiet" as const,
        eyebrow: sessionName.toUpperCase(),
        title: "Zbuduj dzień wokół sesji",
        subtitle: "Nie potrzebujesz jeszcze przekąski awaryjnej. Zadbaj o regularne posiłki i płyny.",
        primaryAction: "Pokaż oś dnia",
        alternateAction: "Dodaj jedzenie"
      };
    case "main_meal":
      return {
        coreState: "needs_action" as const,
        eyebrow: "GŁÓWNY POSIŁEK PRZED SESJĄ",
        title: "Brakuje jednego kroku",
        subtitle: "To najlepsze okno na znany, pełny posiłek z przewagą węglowodanów.",
        primaryAction: "Wybieram",
        alternateAction: "Inna opcja"
      };
    case "top_up":
      return {
        coreState: "needs_action" as const,
        eyebrow: "UZUPEŁNIENIE PALIWA",
        title: "Wybierz prostą opcję",
        subtitle: "Im bliżej treningu, tym ważniejsza jest znana tolerancja i prostota posiłku.",
        primaryAction: "Wybieram",
        alternateAction: "Mam coś innego"
      };
    case "last_hour":
      return {
        coreState: "ready" as const,
        eyebrow: "OSTATNIA GODZINA",
        title: "Nie komplikuj",
        subtitle: "Jeśli jesteś głodny, wybierz małą, dobrze znaną przekąskę. Nie testuj nowości.",
        primaryAction: "Pokaż lekkie opcje",
        alternateAction: "Czuję się gotowy"
      };
    case "during":
      return {
        coreState: "active" as const,
        eyebrow: "SESJA W TOKU",
        title: "Trzymaj przećwiczony plan",
        subtitle: "Strategia podczas długiej lub meczowej sesji powinna być wcześniej sprawdzona na treningu.",
        primaryAction: "Pokaż mój plan",
        alternateAction: "Dodaj płyny"
      };
    case "recovery":
      return {
        coreState: "recovery" as const,
        eyebrow: "REGENERACJA",
        title: "Rozpocznij odbudowę",
        subtitle: "Połącz węglowodany, porcję białka i uzupełnianie płynów.",
        primaryAction: "Wybieram posiłek",
        alternateAction: "Szybka opcja"
      };
    default:
      return {
        coreState: "quiet" as const,
        eyebrow: "DZIEŃ ZAMKNIĘTY",
        title: "Plan wykonany",
        subtitle: "Fuel wróci, gdy pojawi się kolejna sesja.",
        primaryAction: "Zobacz jutro",
        alternateAction: "Dodaj jedzenie"
      };
  }
}

function buildReasons(context: FuelContext, phase: FuelPhase, minutes: number | null): string[] {
  const reasons: string[] = [];
  if (minutes !== null && minutes >= 0) reasons.push(`Do rozpoczęcia zostało ${formatDuration(minutes)}.`);
  if (context.session?.load === "match" || context.session?.load === "high") {
    reasons.push("Wysokie obciążenie zwiększa znaczenie dostępności węglowodanów.");
  }
  if (phase === "main_meal") reasons.push("Jesteś w oknie 3–4 godzin przed rozpoczęciem.");
  if (phase === "top_up") reasons.push("Pełny ciężki posiłek może być już mniej praktyczny niż mniejsze uzupełnienie.");
  if (context.signals?.gutComfort === "heavy") reasons.push("Zgłosiłeś ciężkość brzucha, więc pokazujemy łagodniejsze opcje.");
  if (context.hotConditions) reasons.push("W cieple nawodnienie wymaga indywidualnego planu opartego o straty potu.");
  return reasons.slice(0, 3);
}

function buildTips(context: FuelContext, phase: FuelPhase): string[] {
  const tips = ["Wybieraj produkty, które wcześniej dobrze tolerowałeś."];
  if (["main_meal", "top_up", "last_hour"].includes(phase)) {
    tips.push("Nie nadrabiaj całego dnia jednym bardzo dużym posiłkiem tuż przed treningiem.");
  }
  if (phase === "during") tips.push("Plan żywienia podczas meczu przećwicz wcześniej na mniej ważnej sesji.");
  if (phase === "recovery") tips.push("Jeśli kolejna sesja jest szybko, nie odkładaj pierwszego posiłku regeneracyjnego.");
  if (context.athlete.age !== undefined && context.athlete.age < 16) {
    tips.push("Dla zawodnika poniżej 16 lat plan powinien być prowadzony przez opiekuna i specjalistę.");
  }
  return tips.slice(0, 3);
}

function buildSafetyNotes(context: FuelContext): string[] {
  const notes: string[] = [];
  if (context.athlete.requiresClinicalPlan) {
    notes.push("Włączony jest plan kliniczny: Fuel nie generuje samodzielnych wartości liczbowych.");
  }
  if (!context.athlete.allergens) {
    notes.push("Brak potwierdzonej listy alergenów — sprawdź skład produktu przed wyborem.");
  }
  if (context.athlete.age !== undefined && context.athlete.age < 16) {
    notes.push("Tryb edukacyjny dla osoby niepełnoletniej: bez spersonalizowanych dawek i suplementów.");
  }
  return notes;
}

export function buildFuelRecommendation(context: FuelContext): FuelRecommendation {
  const phase = getFuelPhase(context.now, context.session);
  const minutes = getMinutesToStart(context.now, context.session);
  const copy = phaseCopy(phase, context.session);
  const options = filterMeals(context, phase);
  const targets = buildTargets(context, phase);
  const evidenceIds = Array.from(
    new Set([
      "uefa-2021",
      ...targets.flatMap((target) => target.evidenceIds),
      ...(phase === "during" ? ["cho-review-2024"] : []),
      ...(context.athlete.requiresClinicalPlan ? ["reds-2023"] : [])
    ])
  );

  return {
    phase,
    coreState: copy.coreState,
    minutesToStart: minutes,
    eyebrow: copy.eyebrow,
    title: copy.title,
    subtitle: copy.subtitle,
    primaryAction: copy.primaryAction,
    alternateAction: copy.alternateAction,
    targets,
    reasons: buildReasons(context, phase, minutes),
    tips: buildTips(context, phase),
    options,
    evidenceIds,
    safetyNotes: buildSafetyNotes(context),
    numericPersonalisation: numericPersonalisationAllowed(context.athlete),
    disclaimer: "Wsparcie edukacyjne dla zdrowych zawodników; nie jest diagnozą ani indywidualną poradą medyczną."
  };
}

export function getEvidenceForRecommendation(recommendation: FuelRecommendation): EvidenceSource[] {
  const ids = new Set(recommendation.evidenceIds);
  return EVIDENCE_SOURCES.filter((source) => ids.has(source.id));
}

export function formatDuration(totalMinutes: number): string {
  if (totalMinutes <= 0) return "teraz";
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours} godz. ${minutes} min` : `${hours} godz.`;
}

