import type { JourneySession } from "./journeyTypes";
import type { PlannedAction } from "./types";
import { distance } from "./tacticalWorld";
export const replayColors = {
  ball: "#f3cf73",
  run: "#78c7fa",
  rival: "#ff9b87",
};
/** Only observed paths, shown in analysis; never a recommended solution before choosing. */
export function attackReplay(
  session: JourneySession,
  index: number,
): PlannedAction[] {
  const beat = session.beats[index];
  if (!beat) return [];
  const rows = beat.live ?? [];
  const actions: PlannedAction[] = [];
  const actor = beat.actorId;
  if (distance(beat.before.positions[actor], beat.after.positions[actor]) > 2)
    actions.push({
      id: "analysis-run",
      type: "run",
      playerId: actor,
      from: beat.before.positions[actor],
      to: beat.after.positions[actor],
      analysisColor: replayColors.run,
    });
  const flights: (typeof rows)[] = [];
  for (const row of rows) {
    if (row.inFlight) {
      if (!flights.length || flights.at(-1)!.at(-1)!.kicker !== row.kicker)
        flights.push([]);
      flights.at(-1)!.push(row);
    }
  }
  for (const [i, flight] of flights.slice(-2).entries()) {
    const a = flight[0],
      b = flight.at(-1)!;
    actions.push({
      id: `analysis-ball-${i}`,
      type: "pass",
      playerId: a.kicker ?? actor,
      targetId: beat.receiverId ?? "space",
      from: a.ball,
      to: b.ball,
      analysisColor: replayColors.ball,
    });
  }
  const rival = session.players
    .filter((p) => p.team === "away" && !p.goalkeeper)
    .sort(
      (a, b) =>
        distance(beat.before.positions[a.id], beat.before.positions[actor]) -
        distance(beat.before.positions[b.id], beat.before.positions[actor]),
    )[0];
  if (
    rival &&
    distance(beat.before.positions[rival.id], beat.after.positions[rival.id]) >
      2
  )
    actions.push({
      id: "analysis-rival",
      type: "cover",
      playerId: rival.id,
      from: beat.before.positions[rival.id],
      to: beat.after.positions[rival.id],
      analysisColor: replayColors.rival,
    });
  return actions;
}
