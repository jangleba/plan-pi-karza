import { journeyPointChoice, journeyStep } from "./journeyEngine";
import type { ActionTiming, DribbleStyle, JourneyChoice, JourneySession } from "./journeyTypes";
import { actorId, bound, direction, teamOf } from "./tacticalWorld";
import type { Point } from "./types";
import type { BallDelivery } from "./ballFlight";

/** Resolve what was touched, never select a target by its hidden assessment. */
export function spatialPointChoice(s: JourneySession, point: Point) {
  const id = actorId(s),
    own = s.world.carrierId === id;
  if (own && point.y <= 5 && Math.abs(point.x - 50) < 14) {
    const shot = journeyStep(s).choices.find((c) => c.intent === "shoot" && !c.timing);
    if (shot) return shot;
  }
  return journeyPointChoice(
    s,
    point,
    own ? "carry" : teamOf(s, s.world.carrierId) === "home" ? "move" : "cover",
  );
}
export function spatialStay(s: JourneySession) {
  const c = journeyStep(s).choices.find(
    (c) => ["wait", "hold"].includes(c.intent ?? "") && !c.timing && !c.style,
  );
  if (!c) throw new Error("Ta decyzja nie jest dostępna.");
  return c;
}
export function spatialPlayerChoice(s: JourneySession, targetId: string) {
  const id = actorId(s),
    p = s.players.find((p) => p.id === targetId);
  if (!p) throw new Error("Nie ma takiego zawodnika.");
  if (targetId === id) return spatialStay(s);
  if (s.world.carrierId === id && p.team === "home") {
    const pass = journeyStep(s).choices.find(
      (c) => c.intent === "pass" && c.targetId === targetId && c.delivery === "ground" && !c.timing,
    );
    if (pass) return pass;
  }
  if (s.world.carrierId === id && p.goalkeeper && p.team === "away") {
    const shot = journeyStep(s).choices.find((c) => c.intent === "shoot" && !c.timing);
    if (shot) return shot;
  }
  const at = s.world.positions[targetId];
  if (teamOf(s, s.world.carrierId) === "away" && p.team === "away" && !p.goalkeeper) {
    const press = targetId === s.world.carrierId;
    return journeyPointChoice(
      s,
      bound(at.x, at.y - direction("home") * (press ? 4 : 3)),
      press ? "press" : "mark",
    );
  }
  return spatialPointChoice(s, at);
}
export function changeSpatialChoice(
  s: JourneySession,
  c: JourneyChoice,
  timing: ActionTiming,
  style?: DribbleStyle,
  delivery?: BallDelivery,
) {
  if (style === "shield" && c.intent === "carry") {
    const shield = journeyStep(s).choices.find(
      (x) => x.style === "shield" && (x.timing ?? "now") === timing,
    );
    if (shield) return shield;
  }
  if (c.id.includes("free6:"))
    return journeyPointChoice(s, c.point, c.intent, style ?? c.style ?? "direct", timing);
  const next = journeyStep(s).choices.find(
    (x) =>
      x.intent === c.intent &&
      x.targetId === c.targetId &&
      (x.timing ?? "now") === timing &&
      (!delivery || x.delivery === delivery) &&
      (x.style ?? "") === (style ?? c.style ?? ""),
  );
  if (!next) throw new Error("Ten wariant nie pasuje do wybranego miejsca.");
  return next;
}
export function spatialChoiceTitle(s: JourneySession, c: JourneyChoice) {
  if (c.intent === "pass")
    return `Podanie do nr ${s.players.find((p) => p.id === c.targetId)!.number}`;
  if (c.intent === "shoot") return "Próba strzału";
  if (c.intent === "press") return "Doskok do piłki";
  if (c.intent === "mark") return "Krycie wskazanego rywala";
  if (["hold", "wait"].includes(c.intent ?? "")) return "Pozostanie w pozycji";
  if (c.style === "shield") return "Osłoń piłkę";
  if (c.intent === "carry") return "Prowadzenie we wskazane miejsce";
  return "Ruch we wskazane miejsce";
}
