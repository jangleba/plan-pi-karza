import type { Arrow, Drill, Point } from "../drill";

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const ballAction = (a: Arrow) => a.style !== "run";
const movesActor = (a: Arrow) => a.style === "run" || a.style === "dribble" || a.style === "touch";

/** Walidacja treści przed doborem: współrzędne, zasoby sceny i brak teleportacji w kolejnych krokach. */
export function validateTechnicalScene(d: Drill): string[] {
  const errors: string[] = [];
  const { width: w, height: h } = d.field;
  if (!(Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0 && w <= 68 && h <= 52.5)) return ["Nieprawidłowe wymiary pola."];
  const inside = (p: Point) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.y >= 0 && p.x <= w && p.y <= h;
  const points = [...d.cones, ...(d.actors ?? []), ...(d.stations ?? []), ...(d.targets ?? []), ...(d.goals ?? []), ...(d.ballStart ? [d.ballStart] : [])];
  if (points.some((p) => !inside(p))) errors.push("Obiekt poza polem lub nieskończona współrzędna.");
  for (const t of d.targets ?? []) if (!(t.width > 0 && t.height > 0) || t.x - t.width / 2 < 0 || t.x + t.width / 2 > w || t.y - t.height / 2 < 0 || t.y + t.height / 2 > h) errors.push("Strefa celu nie mieści się na polu.");
  const ids = [...(d.actors ?? []), ...(d.stations ?? [])].map((a) => a.id);
  if (new Set(ids).size !== ids.length) errors.push("Powtórzony identyfikator wykonawcy.");
  if (!d.actors?.some((a) => a.id === "me") || !d.ballStart) errors.push("Brak pozycji startowej zawodnika lub piłki.");
  const valid = d.arrows.every((a) => a.points.length >= 2 && a.points.every(inside) && typeof a.step === "number" && Number.isSafeInteger(a.step) && a.step >= 1);
  if (!valid || !d.arrows.length) return [...errors, "Nieprawidłowa ścieżka lub numer kroku."];
  const phases = [...new Set(d.arrows.map((a) => a.step!))].sort((a, b) => a - b);
  if (phases.some((n, i) => n !== i + 1)) errors.push("Brak kolejnego etapu.");
  const actors = new Map<string, Point>((d.actors ?? []).map((a) => [a.id, a]));
  const stations = new Map<string, Point>((d.stations ?? []).map((a) => [a.id, a]));
  let ball = d.ballStart;
  for (const step of phases) {
    const current = d.arrows.filter((a) => a.step === step);
    if (current.filter(ballAction).length > 1) errors.push(`Dwie akcje tą samą piłką w etapie ${step}.`);
    const moving = new Set<string>();
    for (const a of current) {
      const id = a.actorId ?? "me", actor = actors.get(id), station = stations.get(id);
      if (!actor && !station) { errors.push(`Nieznany wykonawca ${id}.`); continue; }
      if (!a.note?.trim()) errors.push(`Brak instrukcji etapu ${step}.`);
      if (a.points.every((p) => dist(p, a.points[0]!) < 0.001)) errors.push(`Ścieżka o zerowej długości: ${step}.`);
      if (dist((actor ?? station)!, a.points[0]!) > 0.05) errors.push(`Teleportacja wykonawcy ${id} w etapie ${step}.`);
      if (movesActor(a)) {
        if (!actor || moving.has(id)) errors.push(`Nieprawidłowy równoczesny ruch ${id}.`);
        moving.add(id);
      }
      if (ballAction(a) && ball && dist(ball, a.points[0]!) > 0.05) errors.push(`Teleportacja piłki w etapie ${step}.`);
      if (a.style === "shot" && !d.goals?.some((g) => Math.abs(a.points.at(-1)!.x - g.x) <= g.width / 2 && Math.abs(a.points.at(-1)!.y - g.y) <= 1)) errors.push("Strzał bez właściwej bramki docelowej.");
    }
    // Aktualizacja dopiero po sprawdzeniu wszystkich równoczesnych działań.
    for (const a of current) {
      if (movesActor(a)) actors.set(a.actorId ?? "me", a.points.at(-1)!);
      if (ballAction(a)) ball = a.points.at(-1)!;
    }
  }
  return errors;
}
