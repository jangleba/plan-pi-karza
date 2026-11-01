import type { JourneyChoice, JourneySession, JourneyStep } from "./journeyTypes";
import type { PlannedAction, Point } from "./types";
const gap = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const kindTitles: Record<string, string> = {
  pass: "Wybierz podanie",
  finish: "Jak zakończysz akcję?",
  move: "Pokaż się do podania",
  carry: "Wybierz drogę z piłką",
  cover: "Osłoń drogę do bramki",
  mark: "Zajmij pozycję przy rywalu",
  press: "Wybierz kierunek doskoku",
  transition: "Zareaguj po stracie",
};

export function lessonInstruction(session: JourneySession, step: JourneyStep) {
  const holder = session.players.find((p) => p.id === session.world.carrierId)!;
  const possession = holder.controlled
    ? "TY masz piłkę."
    : holder.team === "home"
      ? `Piłkę ma Twój partner nr ${holder.number}.`
      : `Piłkę ma rywal nr ${holder.number}.`;
  const task =
    step.kind === "move"
      ? "TY wybierasz pozycję do następnego podania."
      : step.kind === "carry"
        ? "TY wybierasz kierunek prowadzenia."
        : ["pass", "finish"].includes(step.kind)
          ? "Sprawdź odbiorcę i rywala na drodze piłki."
          : "TY wybierasz ustawienie między piłką a swoją bramką.";
  return { title: kindTitles[step.kind] ?? step.prompt, situation: `${possession} ${task}` };
}
/** Describe the actual proposed coordinates, without announcing their assessment. */
export function lessonOption(session: JourneySession, step: JourneyStep, choice: JourneyChoice) {
  if (choice.targetId) {
    const p = session.players.find((p) => p.id === choice.targetId)!;
    return {
      title: `Podaj do nr ${p.number}`,
      detail: `${p.role}. ${choice.delivery && choice.delivery !== "ground" ? "Zagranie górą" : "Podanie po ziemi"}; strzałka pokazuje tor piłki.`,
    };
  }
  if (choice.id === "shot")
    return { title: "Spróbuj strzału", detail: "Zakończ akcję strzałem w kierunku bramki." };
  if (step.kind === "transition")
    return {
      title: choice.label,
      detail: choice.id.includes("press")
        ? "Podejdź do zawodnika z piłką po stracie."
        : "Wróć w stronę swojej bramki i osłoń dalszy atak.",
    };
  const from = session.world.positions.you,
    dx = choice.point.x - from.x,
    dy = choice.point.y - from.y;
  const side = Math.abs(dx) < 5 ? "na wprost" : dx < 0 ? "w lewo" : "w prawo";
  const depth =
    Math.abs(dy) < 6
      ? "na podobnej wysokości"
      : dy < 0
        ? "w stronę bramki rywala"
        : "w stronę swojej bramki";
  const verb =
    step.kind === "carry" ? "Poprowadź" : step.kind === "press" ? "Podejdź" : "Przesuń się";
  return {
    title: `${verb} ${side}`,
    detail: `Ruch ${depth}. Strzałka zaczyna się przy TY i kończy w wybranym miejscu.`,
  };
}
export function lessonPreviewAction(session: JourneySession, choice: JourneyChoice): PlannedAction {
  const base = {
    id: "lesson-preview",
    playerId: "you",
    from: session.world.positions.you,
    to: choice.point,
  };
  return choice.targetId
    ? { ...base, type: "pass", targetId: choice.targetId }
    : { ...base, type: "run" };
}
export function lessonFocus(session: JourneySession, choice?: JourneyChoice) {
  const world = session.world,
    from = world.positions.you,
    holder = world.positions[world.carrierId];
  const target = choice?.point ?? from;
  const rivals = session.players
    .filter((p) => p.team === "away" && !p.goalkeeper)
    .sort(
      (a, b) =>
        Math.min(gap(world.positions[a.id], from), gap(world.positions[a.id], target)) -
        Math.min(gap(world.positions[b.id], from), gap(world.positions[b.id], target)),
    )
    .slice(0, 2);
  const points = [from, holder, target, ...rivals.map((p) => world.positions[p.id])];
  const labels = ["you", ...(choice?.targetId ? [choice.targetId] : []), world.carrierId];
  return { points, labelIds: [...new Set(labels)].slice(0, 3) };
}
export function lessonPlaybackPoints(session: JourneySession, from: number, to: number) {
  let clock = 0;
  return session.beats.flatMap((beat) => {
    const start = clock;
    clock += beat.duration;
    if (clock < from || start > to) return [];
    return [
      beat.from,
      beat.to,
      beat.before.positions.you,
      beat.after.positions.you,
      beat.before.positions[beat.before.carrierId],
      beat.after.positions[beat.after.carrierId],
    ];
  });
}
