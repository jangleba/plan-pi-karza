/** Debrief after the action: three separate judgements and one concrete tip.
 *
 * - Wybór (choice): what the chosen option gives with a clean execution, compared with the
 *   other options at the same moment. Several options can be good.
 * - Wykonanie (execution): the first touch and the pass in the simulator, compared with the
 *   same choice executed cleanly.
 * - Rezultat (result): what actually happened.
 *
 * Tips talk about tactics only: where the rivals were, which side was shut, which lane was
 * free and when the partner ran. Nothing about body details, and phone orientation is never
 * described as where the player looked.
 */
import { PITCH, angleDiff, headingOf, sub } from "./fpMath";
import {
  evaluateOptions,
  OUTCOME_SCORE,
  SENSIBLE_SCORE,
  sensibleOptions,
  simAt,
  classifyInput,
  type OptionEval,
  type OptionKey,
} from "./fpOptions";
import { runSim, type FpInput, type Outcome, type OutcomeKind, type SimState } from "./fpSim";
import type { FpVariant } from "./fpVariants";

export type Grade = "good" | "ok" | "poor";
export type PrincipleKey = "touch" | "lane" | "timing";
export type Debrief = {
  outcome: Outcome;
  decisionTick: number | null;
  choice: {
    grade: Grade;
    key: OptionKey | null;
    alsoGood: OptionKey[];
    best: OptionKey | null;
    text: string;
  };
  execution: { grade: Grade; touchQuality: number | null; passError: number | null; text: string };
  result: { kind: OutcomeKind; text: string };
  tip: string;
  problem: PrincipleKey | null;
  /** Tick to start the replay from: a moment before the decision. */
  keyMoment: number;
};

export const PRINCIPLES: Record<PrincipleKey, { title: string; rule: string }> = {
  touch: {
    title: "Przyjęcie pod presją",
    rule: "Pierwszym kontaktem zabierz piłkę na stronę, której doskakujący obrońca nie zamyka.",
  },
  lane: {
    title: "Wolna linia podania",
    rule: "Podawaj do partnera, którego linii podania nie zasłania żaden obrońca.",
  },
  timing: {
    title: "Podanie za linię obrony",
    rule: "Zagraj za linię obrony w chwili, gdy partner z niej rusza, a nie gdy już za nią stoi.",
  },
};

export const OPTION_LABELS: Record<OptionKey, string> = {
  support: "krótkie podanie do partnera z tyłu",
  runner: "podanie do wybiegającego partnera",
  space: "piłka w wolne pole za linię obrony",
  lofted: "podanie górą za linię obrony",
  carry: "prowadzenie piłki w wolną przestrzeń",
};

const RESULT_TEXT: Record<OutcomeKind, string> = {
  chance: "Sytuacja strzelecka",
  progress: "Piłka zagrana do przodu",
  kept: "Piłka utrzymana",
  loss: "Strata piłki",
  offside: "Spalony",
  timeout: "Akcja stanęła",
};
export const resultText = (kind: OutcomeKind) => RESULT_TEXT[kind];
const DETAIL: Partial<Record<Outcome["detail"], string>> = {
  intercept: "przechwyt",
  tackle: "odbiór",
  out: "piłka za linią",
  keeper: "bramkarz zdążył",
  carried: "wejście z piłką za linię obrony",
};
function resultDetail(o: Outcome) {
  const who =
    o.by === "support" ? "partner z tyłu" : o.by === "runner" ? "wybiegający partner" : null;
  const detail = DETAIL[o.detail];
  if (o.kind === "loss") return `${RESULT_TEXT.loss}${detail ? `: ${detail}` : ""}.`;
  if (o.detail === "received" && who) return `${RESULT_TEXT[o.kind]} (${who} przy piłce).`;
  return `${RESULT_TEXT[o.kind]}${detail && o.kind !== "offside" ? ` (${detail})` : ""}.`;
}

const RIVAL: Record<string, string> = {
  d1: "doskakującego obrońcy",
  d2: "obrońcy asekurującego",
  gk: "bramkarza",
};

/** The input that counts as TY's decision: the pass (or, without a pass, the first carry). */
export function decisionInput(s: SimState, inputs: readonly FpInput[]): FpInput | null {
  const pass = s.events.find((e) => e.type === "pass" && e.from === "ty");
  const applied = inputs.filter((i) => i.kind === "pass" || i.kind === "carry");
  if (pass) {
    const passes = applied.filter((i) => i.kind === "pass" && i.tick <= pass.tick);
    return passes[passes.length - 1] ?? null;
  }
  return applied.find((i) => s.controlTick !== null && i.tick >= s.controlTick) ?? null;
}

/** Side (−1 left, +1 right on screen when attacking up the pitch) the presser shuts. */
export function shutSide(variant: FpVariant) {
  const runnerSide = Math.sign(variant.start.runner.x - variant.start.ty.x) || variant.side;
  return variant.closes === "runner" ? runnerSide : -runnerSide;
}
const sideWord = (x: number) => (x < 0 ? "lewą" : "prawą");

export function principleFor(variant: FpVariant, previous?: PrincipleKey | null): PrincipleKey {
  if (previous) return previous;
  if (variant.runner === "depth" || variant.runner === "wide")
    return variant.seed % 2 ? "timing" : "touch";
  return variant.cover === "tight" ? "lane" : "touch";
}

export function buildDebrief(
  variant: FpVariant,
  inputs: readonly FpInput[],
  played?: SimState,
): Debrief {
  const s = played ?? runSim(variant, inputs, { record: false });
  const outcome = s.outcome!;
  const decision = decisionInput(s, inputs);
  const touch = s.events.find((e) => e.type === "touch");
  const result = { kind: outcome.kind, text: resultDetail(outcome) };
  const keyMoment = Math.max(0, (decision?.tick ?? touch?.tick ?? outcome.tick) - 60);
  const shut = shutSide(variant);

  // Touch into the presser, then lost before any decision.
  if (!decision) {
    const intoPressure =
      touch && touch.type === "touch" && touch.armed
        ? Math.abs(angleDiff(touch.dir, headingOf(sub(variant.start.d1, variant.start.ty)))) < 1.2
        : false;
    const tip =
      outcome.kind === "timeout"
        ? "Za długo z piłką: obrońcy zdążyli zamknąć linie podania. Zdecyduj, gdy partner jest jeszcze wolny."
        : intoPressure
          ? `Przyjęcie poszło w stronę doskakującego obrońcy. Zabierz piłkę na ${sideWord(-shut)} stronę, której on nie zamyka.`
          : `Obrońca zamykał ${sideWord(shut)} stronę i odebrał piłkę, zanim zagrałeś. Przyjmij na ${sideWord(-shut)} stronę albo graj od razu do wolnego partnera.`;
    return {
      outcome,
      decisionTick: null,
      choice: {
        grade: "poor",
        key: null,
        alsoGood: [],
        best: null,
        text: "Nie było decyzji z piłką.",
      },
      execution: {
        grade: (s.touchQuality ?? 1) < 0.6 ? "poor" : "ok",
        touchQuality: s.touchQuality,
        passError: null,
        text: touchText(s.touchQuality),
      },
      result,
      tip,
      problem: intoPressure ? "touch" : outcome.kind === "timeout" ? "lane" : "touch",
      keyMoment,
    };
  }

  const prefix = inputs.filter((i) => i.tick < decision.tick);
  const options = evaluateOptions(variant, prefix, decision.tick);
  const at = simAt(variant, prefix, decision.tick);
  const key = classifyInput(at, decision);
  const ideal = runSim(variant, [...prefix, decision], { idealFrom: decision.tick, record: false });
  const idealScore = OUTCOME_SCORE[ideal.outcome!.kind];
  const sensible = sensibleOptions(options);
  const best = [...options].sort((a, b) => b.score - a.score)[0] ?? null;
  const bestScore = best?.score ?? 0;
  const grade: Grade =
    idealScore >= SENSIBLE_SCORE && idealScore >= bestScore - 0.3
      ? "good"
      : idealScore >= SENSIBLE_SCORE
        ? "ok"
        : "poor";
  const alsoGood = sensible.map((o) => o.key).filter((k) => k !== key);
  const choiceText =
    grade === "good"
      ? `${cap(OPTION_LABELS[key])}.${alsoGood.length ? ` Też sensowne: ${OPTION_LABELS[alsoGood[0]!]}.` : ""}`
      : grade === "ok"
        ? `${cap(OPTION_LABELS[key])}. Było lepsze wyjście.`
        : `${cap(OPTION_LABELS[key])}: małe szanse powodzenia nawet przy czystym podaniu.`;

  const actualScore = OUTCOME_SCORE[outcome.kind];
  const execPoor = actualScore < idealScore - 0.2;
  const execGrade: Grade = execPoor
    ? "poor"
    : (s.touchQuality ?? 1) < 0.6 || (s.passError ?? 0) > 2.5
      ? "ok"
      : "good";
  const execText = execPoor
    ? "Podanie niedokładne: ten sam wybór zagrany czysto dawał więcej."
    : execGrade === "ok"
      ? touchText(s.touchQuality) + ((s.passError ?? 0) > 2.5 ? " Podanie lekko niedokładne." : "")
      : "Przyjęcie i podanie czyste.";

  const tip = pickTip({ outcome, grade, key, best, bestScore, execPoor, shut, alsoGood, options });
  const problem: PrincipleKey | null =
    outcome.kind === "offside"
      ? "timing"
      : grade !== "good" && best && (best.key === "space" || best.key === "lofted")
        ? "timing"
        : grade === "poor"
          ? "lane"
          : null;
  return {
    outcome,
    decisionTick: decision.tick,
    choice: { grade, key, alsoGood, best: best?.key ?? null, text: choiceText },
    execution: {
      grade: execGrade,
      touchQuality: s.touchQuality,
      passError: s.passError,
      text: execText,
    },
    result,
    tip,
    problem,
    keyMoment,
  };
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

function touchText(q: number | null) {
  if (q === null) return "Bez przyjęcia.";
  return q >= 0.75
    ? "Przyjęcie czyste."
    : q >= 0.55
      ? "Przyjęcie trochę za daleko."
      : "Przyjęcie za daleko od nogi.";
}

function pickTip(c: {
  outcome: Outcome;
  grade: Grade;
  key: OptionKey;
  best: OptionEval | null;
  bestScore: number;
  execPoor: boolean;
  shut: number;
  alsoGood: OptionKey[];
  options: OptionEval[];
}) {
  const { outcome, grade, best } = c;
  if (outcome.kind === "offside")
    return "W chwili podania partner stał już za linią obrony. Zagraj wcześniej, gdy rusza z linii, albo poczekaj, aż wróci na równą pozycję.";
  if (grade === "good" && c.execPoor)
    return "Wybór był dobry, zawiodło wykonanie. W następnym wariancie zagraj to samo spokojniej, z ustawionej pozycji.";
  if (grade === "good") {
    const other = c.alsoGood[0];
    return outcome.kind === "chance"
      ? `To działa: ${OPTION_LABELS[c.key]} w tempo dało sytuację.${other ? ` Druga dobra droga: ${OPTION_LABELS[other]}.` : ""}`
      : other
        ? `Twoje rozwiązanie było sensowne. Następnym razem sprawdź też: ${OPTION_LABELS[other]}.`
        : "Twoje rozwiązanie było sensowne. W następnym wariancie zmieni się pressing i ruch partnerów.";
  }
  if (outcome.kind === "loss" && outcome.detail === "intercept" && outcome.by)
    return `Podanie szło przez strefę ${RIVAL[outcome.by] ?? "obrońcy"}. ${best && best.score >= SENSIBLE_SCORE ? `Wolne było: ${OPTION_LABELS[best.key]}.` : "Szukaj partnera z wolną linią podania."}`;
  if (outcome.kind === "loss" && outcome.detail === "tackle")
    return `Obrońca zamykał ${sideWord(c.shut)} stronę i zdążył odebrać. Zagraj szybciej albo zabierz piłkę na ${sideWord(-c.shut)} stronę.`;
  if (outcome.kind === "timeout")
    return "Za długo z piłką: obrońcy zdążyli zamknąć linie podania. Zdecyduj, gdy partner jest jeszcze wolny.";
  if (best && best.score > OUTCOME_SCORE.kept)
    return `Było lepsze wyjście: ${OPTION_LABELS[best.key]}. ${best.key === "space" || best.key === "lofted" || best.key === "runner" ? "Partner wychodził za linię obrony, a obrońcy jeszcze nie zdążyli się cofnąć." : "Ta strona była wolna od obrońców."}`;
  return "Wybierz partnera, do którego linia podania jest wolna, zanim obrońcy ją zamkną.";
}

/** Model action for the demonstration: an open first touch, then the best option. */
export function modelInputs(variant: FpVariant, principle: PrincipleKey): FpInput[] {
  const shut = shutSide(variant);
  const touch: FpInput = { tick: 20, kind: "touch", dir: -shut * 1.0 };
  const base = runSim(variant, [touch], { record: false });
  if (base.controlTick === null) return [touch];
  let bestPlan: { input: FpInput; score: number } | null = null;
  for (const k of [8, 24, 40]) {
    const options = evaluateOptions(variant, [touch], base.controlTick + k, 0);
    for (const o of options) {
      if (o.key === "carry") continue;
      const fit =
        principle === "timing"
          ? o.key === "space" || o.key === "lofted" || o.key === "runner"
            ? 0.05
            : 0
          : 0;
      const score = o.score + fit;
      if (!bestPlan || score > bestPlan.score) bestPlan = { input: o.input, score };
    }
  }
  return bestPlan ? [touch, bestPlan.input] : [touch];
}

export const isInPitch = (x: number, y: number) =>
  Math.abs(x) <= PITCH.halfWidth && Math.abs(y) <= PITCH.halfLength;
