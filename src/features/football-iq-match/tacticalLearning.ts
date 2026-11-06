import type { JourneyQuality, JourneySession } from "./journeyTypes";
import type { Point } from "./types";
import { actorId, direction, distance, segment, teamOf } from "./tacticalWorld";

/** Geometry in pitch units, not a claim to measure real match performance. */
export function pressingAssessment(
  s: JourneySession,
  p: Point,
): { quality: JourneyQuality; why: string } {
  const id = actorId(s),
    team = teamOf(s, id),
    dir = direction(team);
  const ball = s.world.positions[s.world.carrierId];
  const goal = { x: 50, y: team === "home" ? 136 : 4 };
  const lane = segment(p, ball, goal);
  const goalSide = dir * (p.y - ball.y) < -0.5;
  const cover = s.players.filter((q) => {
    if (q.team !== team || q.id === id || q.goalkeeper) return false;
    const at = s.world.positions[q.id];
    const depth = -dir * (at.y - p.y);
    return depth >= 3 && depth <= 28 && distance(at, p) <= 30 && segment(at, ball, goal).gap <= 16;
  });
  const near = distance(p, ball);
  if (!goalSide || lane.gap > 5)
    return {
      quality: near < 12 ? "possible" : "error",
      why: "Z tej strony nie zamykasz drogi od piłki do własnej bramki. Rywal może minąć doskok do środka. Porównaj podejście od strony środka z osłoną odbiorcy.",
    };
  if (!cover.length)
    return {
      quality: "possible",
      why: "Podejście ogranicza środek, lecz bliski partner z pola nie osłania przestrzeni za Tobą. Sam bramkarz ani odległy partner nie zabezpiecza doskoku. Najpierw rozważ opóźnienie lub osłonę.",
    };
  return near < 6
    ? {
        quality: "good",
        why: `Doskok od strony środka ogranicza drogę do bramki, a partner nr ${cover[0].number} jest w zasięgu osłony za Tobą. Nadal sprawdzaj odbiorcę po drugiej stronie; osłona nie gwarantuje odbioru.`,
      }
    : {
        quality: near < 12 ? "possible" : "error",
        why: "Masz osłonę, ale kończysz za daleko od piłki, by ograniczyć pierwsze zagranie. Sprawdź, czy lepszy będzie krótszy doskok albo zamknięcie odbiorcy.",
      };
}
