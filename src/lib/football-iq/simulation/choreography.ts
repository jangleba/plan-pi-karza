// Wspólna choreografia ruchu dla wszystkich scenariuszy BallWise IQ.
//
// Cel: jedna animacja = jedna zasada gry. Tor każdego zawodnika jest rozwijany
// z danych scenariusza (tor piłki, strefy decyzyjne, reakcje rywala) do 6 klatek
// kluczowych opisujących pięć faz akcji:
//
//   1) działanie posiadacza piłki,
//   2) reakcja pressingu na to działanie,
//   3) przesunięcie struktury obu zespołów za piłką,
//   4) rotacja użytkownika i wsparcia (kolejna linia podania),
//   5) konsekwencja przestrzenna — kluczowy rywal zaczyna reagować.
//
// Nic tu nie jest dekoracyjne: każdy delta-ruch ma przyczynę w pozycji piłki,
// w odległości do posiadacza albo w reakcji zapisanej w scenariuszu.

import { actorAt } from "./engine";
import type { SimActor, SimScenario } from "./types";

/** Klatki kluczowe pełnej sekwencji taktycznej (t = 0..1). */
export const CHOREO_KEYFRAMES = [0, 0.18, 0.38, 0.6, 0.82, 1] as const;

/** Domyślna długość pełnej, pięciofazowej sekwencji taktycznej. */
export const OBSERVATION_MS = 11_000;

type Pt = { x: number; y: number };

const clampX = (v: number) => Math.max(5, Math.min(95, v));
const clampY = (v: number) => Math.max(6, Math.min(134, v));

function dist(a: Pt, b: Pt) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

const OWN_STRUCTURE: Pt[] = [
  { x: 50, y: 132 },
  { x: 14, y: 111 },
  { x: 36, y: 119 },
  { x: 64, y: 119 },
  { x: 86, y: 109 },
  { x: 35, y: 91 },
  { x: 63, y: 88 },
  { x: 18, y: 70 },
  { x: 50, y: 69 },
  { x: 82, y: 68 },
  { x: 50, y: 43 },
];

const OPPONENT_STRUCTURE: Pt[] = [
  { x: 50, y: 8 },
  { x: 14, y: 31 },
  { x: 36, y: 28 },
  { x: 64, y: 28 },
  { x: 86, y: 33 },
  { x: 35, y: 54 },
  { x: 63, y: 56 },
  { x: 18, y: 76 },
  { x: 50, y: 73 },
  { x: 82, y: 77 },
  { x: 50, y: 97 },
];

/**
 * Scenariusze przechowują wyłącznie aktorów decyzyjnych. Renderer potrzebuje
 * jednak pełnego kontekstu meczu. Brakujące miejsca formacji są uzupełniane
 * neutralnymi zawodnikami struktury. Nie są selekowalni przez silnik i nie
 * zmieniają stref, reakcji ani wyniku decyzji.
 */
function completeMatchStructure(actors: SimActor[], ballDx: number, ballDy: number) {
  const additions: SimActor[] = [];
  const occupied = actors
    .filter((actor) => actor.kind !== "ball")
    .map((actor) => actorAt(actor.path, 0));

  const addSide = (kind: "mate" | "opponent", anchors: Pt[], target: number) => {
    const current = actors.filter((actor) =>
      kind === "mate"
        ? actor.kind === "mate" || actor.kind === "self"
        : actor.kind === "opponent",
    ).length;
    let missing = Math.max(0, target - current);
    for (let index = 0; index < anchors.length && missing > 0; index += 1) {
      const anchor = anchors[index];
      if (occupied.some((point) => dist(point, anchor) < 7.5)) continue;
      const path = CHOREO_KEYFRAMES.map((t) => {
        const phase = Math.min(1, Math.max(0, (t - 0.18) / 0.82));
        const direction = kind === "mate" ? 1 : 0.72;
        const lateral = Math.sin((t + index * 0.17) * Math.PI) * 0.7;
        return {
          t,
          x: clampX(anchor.x + ballDx * 0.12 * phase * direction + lateral),
          y: clampY(anchor.y + ballDy * 0.08 * phase * direction),
        };
      });
      additions.push({
        id: `structure-${kind}-${index}`,
        kind,
        label: kind === "mate" ? "Partner" : "Rywal",
        path,
      });
      occupied.push(anchor);
      missing -= 1;
    }
  };

  addSide("mate", OWN_STRUCTURE, 11);
  addSide("opponent", OPPONENT_STRUCTURE, 11);
  return [...actors, ...additions];
}

/** Zawodnik najbliższy piłce na starcie — posiadacz. */
function findCarrier(scenario: SimScenario, ballStart: Pt | null) {
  if (!ballStart) return undefined;
  let best: SimActor | undefined;
  let bestD = Infinity;
  for (const a of scenario.actors) {
    if (a.kind === "ball") continue;
    const d = dist(actorAt(a.path, 0), ballStart);
    if (d < bestD) {
      bestD = d;
      best = a;
    }
  }
  return best;
}

/**
 * Rozwija tory scenariusza do skoordynowanej animacji.
 * Punkty startowe i końcowe torów źródłowych pozostają nienaruszone,
 * więc ocena decyzji (strefy, reakcje) nie zmienia się.
 */
export function choreograph(scenario: SimScenario): SimActor[] {
  const ballActor = scenario.actors.find((a) => a.kind === "ball");
  const ballStart = ballActor ? actorAt(ballActor.path, 0) : null;
  const ballEnd = ballActor ? actorAt(ballActor.path, 1) : null;
  const carrier = findCarrier(scenario, ballStart);
  const self = scenario.actors.find((a) => a.kind === "self");
  const selfStart = self ? actorAt(self.path, 0) : null;

  // Przesunięcie piłki napędza przesunięcie całej struktury.
  const ballDx = ballStart && ballEnd ? ballEnd.x - ballStart.x : 0;
  const ballDy = ballStart && ballEnd ? ballEnd.y - ballStart.y : 0;

  const opponents = scenario.actors.filter((a) => a.kind === "opponent");
  const pressing = new Set(
    [...opponents]
      .sort((p, q) => {
        const ref = ballStart ?? { x: 50, y: 70 };
        return dist(actorAt(p.path, 0), ref) - dist(actorAt(q.path, 0), ref);
      })
      .slice(0, 2)
      .map((o) => o.id),
  );

  // Strefa o najwyższej jakości wyznacza przestrzeń, która ma się otworzyć.
  const bestZone = [...scenario.zones].sort((z1, z2) => z2.quality - z1.quality)[0];
  const keyReaction =
    scenario.reactions.find((r) => r.id === (bestZone?.reaction ?? scenario.defaultReaction)) ??
    scenario.reactions[0];
  const keyMove = keyReaction?.moves[0];

  // Dwie kolejne opcje wsparcia tworzą zależność „podający — wsparcie — trzeci”.
  const supportOptions = selfStart
    ? [...scenario.actors]
        .filter((a) => a.kind === "mate" && a.id !== carrier?.id)
        .sort(
          (p, q) => dist(actorAt(p.path, 0), selfStart) - dist(actorAt(q.path, 0), selfStart),
        )
    : [];
  const support = supportOptions[0];
  const thirdPlayer = supportOptions[1];
  const widthPlayer = [...scenario.actors]
    .filter(
      (a) =>
        a.kind === "mate" &&
        a.id !== carrier?.id &&
        a.id !== support?.id &&
        a.id !== thirdPlayer?.id,
    )
    .sort(
      (a, b) =>
        Math.abs(actorAt(b.path, 0).x - 50) - Math.abs(actorAt(a.path, 0).x - 50),
    )[0];

  const coreActors = scenario.actors.map((actor) => {
    const path = CHOREO_KEYFRAMES.map((t) => {
      const base = actorAt(actor.path, t);
      let { x, y } = base;

      const isCarrier = actor.id === carrier?.id;
      const isBall = actor.kind === "ball";
      const isSelf = actor.kind === "self";

      // Faza 2 — pressing reaguje na działanie posiadacza: doskok do piłki.
      if (actor.kind === "opponent" && pressing.has(actor.id) && ballStart) {
        const ballNow = ballActor ? actorAt(ballActor.path, t) : ballStart;
        const k = t <= 0.18 ? 0 : Math.min(1, (t - 0.18) / 0.2) * 0.22;
        x += (ballNow.x - base.x) * k;
        y += (ballNow.y - base.y) * k;
      }

      // Faza 3 — przesunięcie struktury za piłką (zwartość bloku rywala,
      // szerokość zespołu w posiadaniu).
      if (t >= 0.38) {
        const k = Math.min(1, (t - 0.38) / 0.22);
        if (actor.kind === "opponent" && !pressing.has(actor.id)) {
          x += ballDx * 0.45 * k;
          y += ballDy * 0.18 * k;
        } else if (actor.kind === "mate" && !isCarrier) {
          x += ballDx * 0.18 * k;
          y -= 1.8 * k;
        }
      }

      // Faza 4 — rotacja: użytkownik koryguje pozycję, najbliższy partner daje
      // wsparcie, trzeci zawodnik ustawia kolejną linię, a dalszy utrzymuje szerokość.
      if (t >= 0.6) {
        const k = Math.min(1, (t - 0.6) / 0.22);
        const fade = t >= 0.82 ? Math.max(0, 1 - (t - 0.82) / 0.18) : 1;
        if (isSelf && ballStart) {
          const dx = base.x - ballStart.x;
          const dy = base.y - ballStart.y;
          const len = Math.hypot(dx, dy) || 1;
          x += (-dy / len) * 2.6 * k * fade;
          y += (dx / len) * 2.6 * k * fade;
        }
        if (support && actor.id === support.id && bestZone) {
          x += (bestZone.x - base.x) * 0.12 * k;
          y += (bestZone.y - base.y) * 0.12 * k;
        }
        if (thirdPlayer && actor.id === thirdPlayer.id && bestZone) {
          x += (bestZone.x - base.x) * 0.08 * k;
          y -= 3.4 * k;
        }
        if (widthPlayer && actor.id === widthPlayer.id) {
          const side = base.x < 50 ? -1 : 1;
          x += side * 3.2 * k;
          y -= 1.4 * k;
        }
      }

      // Faza 5 — konsekwencja przestrzenna: kluczowy rywal zaczyna korygować
      // pozycję w stronę reakcji zapisanej w scenariuszu.
      if (t >= 0.82 && keyMove && actor.id === keyMove.actorId) {
        const k = Math.min(1, (t - 0.82) / 0.18) * 0.3;
        x += (keyMove.x - base.x) * k;
        y += (keyMove.y - base.y) * k;
      }

      // Piłka i posiadacz trzymają się dokładnie toru ze scenariusza.
      if (isBall || isCarrier) {
        x = base.x;
        y = base.y;
      }

      return { t, x: clampX(x), y: clampY(y) };
    });

    return { ...actor, path };
  });

  return completeMatchStructure(coreActors, ballDx, ballDy);
}
