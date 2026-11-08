/** Start instruction and situation picker for the live IQ lesson.
 * The instruction is built from the real starting state, so it can never
 * describe a different picture than the one the player is about to play.
 */
import { advancedJourneyBank } from "./advancedJourneyBank";
import { decisionOptions, decisionSituation } from "./decisionOptions";
import { roleLabels, rolesForPosition } from "./journeyBank";
import { gameMomentLabels, situationBank, situationFor, type GameMoment } from "./situationBank";
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
  const count = decisionOptions({ ...s, controlledId: "you" }).length;
  return [
    `Grasz jako TY – nr ${you.number}, ${roleLabels[s.definition.role].toLowerCase()}. ${ball}`,
    mode === "learn"
      ? `Przy każdej decyzji wybierasz jedną z ${count} opcji (strzałki na boisku) albo dotykasz boiska.`
      : `Przy każdej decyzji najpierw sam dotykasz boiska. ${count} gotowe opcje pokażesz przyciskiem.`,
    `Akcja toczy się dalej sama: do gola, niecelnego strzału albo spalonego, najdłużej ${ACTION_TIME_LIMIT_SECONDS / 60} minuty gry. Po stracie bronisz dalej.`,
    mode === "learn"
      ? "Po każdej decyzji zobaczysz, co się stało."
      : "Bez podsumowań po drodze. Wynik zobaczysz na końcu.",
  ];
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
/** One entry per topic (first context), own position first, grouped by game moment. */
export function pickerItems(position?: string, all = false): PickerItem[] {
  const roles = rolesForPosition(position);
  const order: GameMoment[] = ["build", "attack", "transition", "defend"];
  return [...situationBank, ...advancedJourneyBank]
    .filter((d) => d.context === 0)
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
/** Same topic in the next context (different score and positions). */
export function nextContext(current: JourneyDefinition) {
  return [...situationBank, ...advancedJourneyBank].find(
    (d) => d.topicId === current.topicId && d.context === (current.context + 1) % 3,
  )!;
}
