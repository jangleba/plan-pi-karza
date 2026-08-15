// Wspólna choreografia ruchu dla wszystkich scenariuszy BallWise IQ.
//
// Cel: jedna animacja = jedna zasada gry. Tor każdego zawodnika jest rozwijany
// z danych scenariusza (tor piłki, strefy decyzyjne, reakcje rywala) do 6 klatek
// kluczowych opisujących pięć faz akcji:
//
//   1) działanie posiadacza piłki,
//   2) reakcja pressingu na to działanie,
//   3) przesunięcie struktury obu zespołów za piłką,
//   4) ruch użytkownika (skan i korekta pozycji),
//   5) konsekwencja przestrzenna — kluczowy rywal zaczyna reagować.
//
// Nic tu nie jest dekoracyjne: każdy delta-ruch ma przyczynę w pozycji piłki,
// w odległości do posiadacza albo w reakcji zapisanej w scenariuszu.

import { actorAt } from "./engine";
import type { SimActor, SimScenario } from "./types";

/** Klatki kluczowe animacji obserwacji (t = 0..1). */
export const CHOREO_KEYFRAMES = [0, 0.18, 0.38, 0.6, 0.82, 1] as const;

/** Pełna długość fazy obserwacji — 8 s dla każdego scenariusza. */
export const OBSERVATION_MS = 8000;

type Pt = { x: number; y: number };

const clampX = (v: number) => Math.max(5, Math.min(95, v));
const clampY = (v: number) => Math.max(6, Math.min(134, v));

function dist(a: Pt, b: Pt) {
  return Math.hypot(a.x - b.x, a.y - b.y);
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

  // Kolega najbliższy użytkownikowi oferuje wsparcie w fazie 4.
  const support = selfStart
    ? [...scenario.actors]
        .filter((a) => a.kind === "mate" && a.id !== carrier?.id)
        .sort((p, q) => dist(actorAt(p.path, 0), selfStart) - dist(actorAt(q.path, 0), selfStart))[0]
    : undefined;

  return scenario.actors.map((actor) => {
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

      // Faza 4 — ruch użytkownika: skan i korekta pozycji prostopadle do piłki,
      // plus wsparcie kolegi otwierającego linię podania.
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
}
