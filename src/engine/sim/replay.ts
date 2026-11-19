import type { Team, World } from "./types";

/** Nagranie przebiegu akcji do powtórki z góry: pozycje wszystkich zawodników i piłki co ok. 0,1 s oraz migawki świata co ok. 0,25 s. */
export interface Frame { t: number; /** x, y kolejnych zawodników (kolejność jak w `ids`). */ a: number[]; b: [number, number]; o: string | null }
export interface Recording {
  ids: string[];
  teams: Team[];
  numbers: number[];
  frames: Frame[];
  snaps: Array<{ t: number; w: World }>;
}

export const FRAME_DT = 0.1;
export const SNAP_DT = 0.25;

export function startRecording(w: World): Recording {
  return { ids: w.agents.map((a) => a.id), teams: w.agents.map((a) => a.team), numbers: w.agents.map((a) => a.number), frames: [], snaps: [] };
}

/** Klon świata bez dziennika zdarzeń (do „co by było, gdyby”). */
export function cloneWorld(w: World): World {
  return structuredClone({ ...w, events: [] }) as World;
}

/** Dopisuje klatkę/migawkę, gdy minęło dość czasu od poprzedniej; wywołuj po każdym kroku symulacji. */
export function record(rec: Recording, w: World): void {
  const last = rec.frames[rec.frames.length - 1];
  if (!last || w.t - last.t >= FRAME_DT - 1e-9) {
    const a: number[] = [];
    for (const ag of w.agents) a.push(+ag.pos.x.toFixed(2), +ag.pos.y.toFixed(2));
    rec.frames.push({ t: +w.t.toFixed(3), a, b: [+w.ball.pos.x.toFixed(2), +w.ball.pos.y.toFixed(2)], o: w.ball.owner });
  }
  const ls = rec.snaps[rec.snaps.length - 1];
  if (!ls || w.t - ls.t >= SNAP_DT - 1e-9) rec.snaps.push({ t: w.t, w: cloneWorld(w) });
}

export const duration = (rec: Recording): number => rec.frames[rec.frames.length - 1]?.t ?? 0;

export interface Shown { agents: Array<{ id: string; team: Team; number: number; x: number; y: number }>; ball: { x: number; y: number }; owner: string | null }

/** Stan w chwili t (interpolacja liniowa między klatkami). */
export function frameAt(rec: Recording, t: number): Shown | null {
  const f = rec.frames;
  if (!f.length) return null;
  const tt = Math.max(f[0]!.t, Math.min(f[f.length - 1]!.t, t));
  let i = 0;
  while (i < f.length - 2 && f[i + 1]!.t <= tt) i++;
  const a = f[i]!, b = f[Math.min(i + 1, f.length - 1)]!;
  const k = b.t === a.t ? 0 : (tt - a.t) / (b.t - a.t);
  const lerp = (x: number, y: number) => x + (y - x) * k;
  return {
    agents: rec.ids.map((id, n) => ({ id, team: rec.teams[n]!, number: rec.numbers[n]!, x: lerp(a.a[n * 2]!, b.a[n * 2]!), y: lerp(a.a[n * 2 + 1]!, b.a[n * 2 + 1]!) })),
    ball: { x: lerp(a.b[0], b.b[0]), y: lerp(a.b[1], b.b[1]) },
    owner: k < 0.5 ? a.o : b.o,
  };
}

/** Ostatnia migawka świata nie późniejsza niż t (albo pierwsza, gdy t jest przed nagraniem). */
export function snapshotAtOrBefore(rec: Recording, t: number): World | null {
  let best: { t: number; w: World } | null = null;
  for (const s of rec.snaps) if (s.t <= t + 1e-9) best = s;
  return (best ?? rec.snaps[0])?.w ?? null;
}
