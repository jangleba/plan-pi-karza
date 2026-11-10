/** Start instruction and situation picker for the live IQ lesson.
 * The instruction is built from the real starting state, so it can never
 * describe a different picture than the one the player is about to play.
 */
import { advancedJourneyBank } from "./advancedJourneyBank";
import { decisionSituation } from "./decisionOptions";
import { roleLabels, rolesForPosition } from "./journeyBank";
import {
  gameMomentLabels,
  playableSituationBank,
  situationFor,
  type GameMoment,
} from "./situationBank";
import type { JourneyDefinition, JourneyMode, JourneySession } from "./journeyTypes";

export const ACTION_TIME_LIMIT_SECONDS = 240;

export function startLines(s: JourneySession, mode: JourneyMode): string[] {
  const you = s.players.find((p) => p.id === "you")!;
  const carrier = s.players.find((p) => p.id === s.world.carrierId)!;
  const kind = decisionSituation(s, "you");
  const ball =
    kind === "own"
      ? "Na starcie masz piłkę."
      : kind === "partner"
        ? `Na starcie piłkę ma partner ${carrier.number}.`
        : kind === "rival"
          ? `Na starcie piłkę ma rywal ${carrier.number}.`
          : "Na starcie piłka jest wolna.";
  return [
    `Grasz jako TY – nr ${you.number}, ${roleLabels[s.definition.role].toLowerCase()}. ${ball}`,
    "Przed decyzją nic nie podpowiada odpowiedzi: sam patrzysz na rywali, partnerów i wolne miejsce.",
    `Z piłką: ${controlsLine("own")} Gdy piłkę ma partner: ${controlsLine("partner")} W obronie: ${controlsLine("rival")}`,
    "„Wykonanie” zmienia moment zagrania (teraz albo po chwili) i rodzaj podania.",
    `Akcja toczy się dalej sama: do gola, niecelnego strzału albo spalonego, najdłużej ${ACTION_TIME_LIMIT_SECONDS / 60} minuty gry. Po stracie bronisz dalej.`,
    mode === "learn"
      ? "Po każdej decyzji zobaczysz, co się stało, i możesz obejrzeć inne rozwiązanie."
      : "Bez przerw po drodze. Omówienie zobaczysz na końcu.",
  ];
}

/** How taps map to actions. Says what a gesture does, never which action is right. */
export function controlsLine(kind: "own" | "partner" | "rival"): string {
  return kind === "own"
    ? "Dotknij partnera (podanie), wolnego pola (podanie w przestrzeń), miejsca obok siebie (prowadzenie), bramki (strzał) albo siebie (ochrona piłki)."
    : kind === "rival"
      ? "Dotknij rywala z piłką (doskok), innego rywala (zamknięcie podania do niego), miejsca (ustawienie lub powrót) albo siebie (zostajesz)."
      : "Dotknij miejsca, do którego biegniesz, albo siebie, żeby zostać.";
}

/** The only line on the start screen: who TY is and who has the ball. */
export function startLine(s: JourneySession): string {
  const you = s.players.find((p) => p.id === "you")!;
  const carrier = s.players.find((p) => p.id === s.world.carrierId)!;
  const kind = decisionSituation(s, "you");
  return kind === "own"
    ? `Jesteś nr ${you.number} i masz piłkę.`
    : kind === "partner"
      ? `Jesteś nr ${you.number}. Piłkę ma partner ${carrier.number}.`
      : kind === "rival"
        ? `Jesteś nr ${you.number}. Piłkę ma rywal ${carrier.number}.`
        : `Jesteś nr ${you.number}. Piłka jest wolna.`;
}

const conceptMoment: Record<string, GameMoment> = {
  "third-player": "build",
  "overload-switch": "attack",
  "press-cover": "defend",
};
export function momentOf(def: JourneyDefinition): GameMoment {
  return situationFor(def)?.moment ?? conceptMoment[def.concept ?? ""] ?? "attack";
}

export type PickerItem = {
  def: JourneyDefinition;
  moment: GameMoment;
  role: string;
  own: boolean;
};
/** One entry per topic (its first playable picture), own position first, grouped by game
 * moment. Only hand-placed situations: every position has its own realistic pictures. */
export function pickerItems(position?: string, all = false): PickerItem[] {
  const roles = rolesForPosition(position);
  const order: GameMoment[] = ["build", "attack", "transition", "defend"];
  const seen = new Set<string>();
  return playableSituationBank
    .filter((d) => !seen.has(d.topicId) && !!seen.add(d.topicId))
    .map((def) => ({
      def,
      moment: momentOf(def),
      role: roleLabels[def.role],
      own: roles.includes(def.role),
    }))
    .filter((i) => all || i.own)
    .sort(
      (a, b) =>
        order.indexOf(a.moment) - order.indexOf(b.moment) ||
        Number(b.own) - Number(a.own) ||
        a.def.ordinal - b.def.ordinal,
    );
}
export const momentLabel = (m: GameMoment) => gameMomentLabels[m];

/** The next topic after the current one, cycling through the player's list. */
export function nextDefinition(current: JourneyDefinition, position?: string) {
  const list = pickerItems(position, false);
  const pool = list.length > 1 ? list : pickerItems(position, true);
  const index = pool.findIndex((i) => i.def.topicId === current.topicId);
  return pool[(index + 1) % pool.length].def;
}
/** Same topic in its next playable picture (another pressing side, closed lane, line
 * height or start spot), cycling through all of them. */
export function nextContext(current: JourneyDefinition) {
  const variants = playableSituationBank.filter((d) => d.topicId === current.topicId);
  if (variants.length) {
    const at = variants.findIndex((d) => d.id === current.id);
    return variants[(at + 1) % variants.length];
  }
  return advancedJourneyBank.find(
    (d) => d.topicId === current.topicId && d.context === (current.context + 1) % 3,
  )!;
}
