/**
 * Chód i bieg proceduralny bez ślizgania stóp (czysta matematyka, bez Three.js).
 *
 * Układ nogi w płaszczyźnie strzałkowej: x – do przodu, y – w górę, początek w stawie biodrowym.
 * Faza kroku rośnie z PRZEBYTEJ DROGI (nie z czasu), a stopa podporowa przesuwa się względem bioder
 * dokładnie z prędkością biegu w tył – więc względem ziemi stoi.
 *
 * Parametry (kadencja, długość podporu, wysokość wymachu) to założenia wizualne, NIE zweryfikowany
 * model biomechaniczny.
 */
export const THIGH = 0.44; // biodro → kolano (m)
export const SHIN = 0.43; // kolano → staw skokowy (m)
export const ANKLE_H = 0.055; // wysokość stawu skokowego nad murawą, gdy stopa stoi płasko
export const HIP_H = THIGH + SHIN + ANKLE_H; // biodro przy wyprostowanych nogach
const REACH = (THIGH + SHIN) * 0.995;
/** Zasięg w podporze: kolano zawsze lekko ugięte (bez „zatrzaśnięcia” nogi na końcu odbicia). */
const STANCE_REACH = (THIGH + SHIN) * 0.965;

/** Kadencja (kroki/s) rosnąca z prędkością – założenie. */
export function cadence(v: number): number {
  return Math.min(3.5, Math.max(1.9, 1.9 + 0.27 * v));
}

export interface GaitParams {
  /** Długość pełnego cyklu (dwa kroki), m. */
  stride: number;
  /** Droga, jaką ciało pokonuje nad stopą podporową, m. */
  stance: number;
  /** Część cyklu, przez którą stopa stoi (0–1). */
  duty: number;
}

export function gaitParams(v: number): GaitParams {
  if (v < 0.05) return { stride: 0, stance: 0, duty: 0.6 };
  const stride = (2 * v) / cadence(v);
  const want = stride * Math.min(0.6, Math.max(0.32, 0.6 - 0.04 * v));
  const stance = Math.min(want, 0.8);
  return { stride, stance, duty: stance / stride };
}

/** Pozycja stawu skokowego względem rzutu bioder na ziemię: x do przodu, y – wysokość nad murawą. */
export function footPath(phase: number, g: GaitParams, lift: number): { x: number; y: number; planted: boolean } {
  const p = phase - Math.floor(phase);
  if (g.stance <= 0) return { x: 0, y: ANKLE_H, planted: true };
  if (p < g.duty) {
    const s = p / g.duty;
    return { x: g.stance / 2 - g.stance * s, y: ANKLE_H, planted: true };
  }
  const s = (p - g.duty) / (1 - g.duty);
  const e = s * s * (3 - 2 * s); // gładki start i lądowanie stopy
  return { x: -g.stance / 2 + g.stance * e, y: ANKLE_H + lift * Math.sin(Math.PI * s), planted: false };
}

/**
 * Dwuczłonowa kinematyka odwrotna: kąty uda i kolana, żeby staw skokowy trafił w (tx, ty) względem biodra.
 * thigh > 0 – udo do przodu; knee ≤ 0 – zgięcie (łydka do tyłu, kolano do przodu).
 */
export function solveLeg(tx: number, ty: number): { thigh: number; knee: number } {
  const d = Math.min(REACH, Math.max(Math.abs(THIGH - SHIN) + 1e-4, Math.hypot(tx, ty)));
  const a = Math.atan2(tx, -ty);
  const b = Math.acos(Math.min(1, (THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d)));
  const inner = Math.acos(Math.min(1, (THIGH * THIGH + SHIN * SHIN - d * d) / (2 * THIGH * SHIN)));
  return { thigh: a + b, knee: -(Math.PI - inner) };
}

/** Kinematyka prosta: gdzie jest staw skokowy przy danych kątach (do testów). */
export function ankleOf(thigh: number, knee: number): { x: number; y: number } {
  return {
    x: THIGH * Math.sin(thigh) + SHIN * Math.sin(thigh + knee),
    y: -THIGH * Math.cos(thigh) - SHIN * Math.cos(thigh + knee),
  };
}

/**
 * Wysokość bioder: niżej w biegu i w postawie, dwa najniższe punkty na cykl (w połowie podporu każdej nogi),
 * zawsze tak, żeby stopa podporowa sięgała ziemi na końcach podporu.
 */
export function pelvisHeight(phase: number, g: GaitParams, run: number, k: number, crouch: number): number {
  const bounce = 0.025 * k * run * Math.cos(4 * Math.PI * (phase - g.duty / 2));
  const y = HIP_H - (0.02 + 0.04 * k) * run - crouch * (1 - run) - bounce;
  const half = g.stance / 2;
  const maxY = ANKLE_H + Math.sqrt(Math.max(0, STANCE_REACH * STANCE_REACH - half * half));
  return Math.min(y, maxY);
}

export interface GaitState {
  /** Wygładzona prędkość (m/s). */
  v: number;
  /** Udział pozy biegu 0–1 (płynne przejście bieg ↔ postawa). */
  run: number;
  /** Faza cyklu lewej nogi (prawa = +0.5). */
  phase: number;
}

export interface LegAngles { thigh: number; knee: number; ankle: number }

export interface GaitPose {
  pelvisY: number;
  legs: [LegAngles, LegAngles];
  arms: [number, number];
  elbow: number;
  lean: number;
  feet: [{ x: number; y: number; planted: boolean }, { x: number; y: number; planted: boolean }];
}

/**
 * Jeden krok animacji: wygładza prędkość, przesuwa fazę o przebytą drogę, liczy pozę.
 * measuredSpeed – prędkość z ruchu postaci w tej klatce; crouch – ugięcie w postawie (obrońca, bramkarz).
 */
export function stepGait(s: GaitState, measuredSpeed: number, dt: number, crouch: number): GaitPose {
  // wygładzenie prędkości (stała czasowa ok. 0,12 s) i przejścia bieg ↔ postawa (ok. 0,2 s)
  s.v += (measuredSpeed - s.v) * Math.min(1, dt / 0.12);
  const target = Math.min(1, s.v / 1.2);
  s.run += (target - s.run) * Math.min(1, dt / 0.2);
  const k = Math.min(1, s.v / 7);
  const g0 = gaitParams(Math.max(s.v, 0));
  // w postawie skracamy podpór i wymach – stopy wracają pod biodra
  const g: GaitParams = { stride: g0.stride, stance: g0.stance * s.run, duty: g0.duty };
  if (g0.stride > 0) s.phase += (s.v * dt) / g0.stride;
  const lift = (0.07 + 0.28 * k) * s.run;
  const feet = [footPath(s.phase, g, lift), footPath(s.phase + 0.5, g, lift)] as GaitPose["feet"];
  const pelvisY = pelvisHeight(s.phase, g, s.run, k, crouch);
  const legs = feet.map((f) => {
    const a = solveLeg(f.x, f.y - pelvisY);
    // stopa płasko na ziemi w podporze; w wymachu lekko opuszczone palce
    const flat = -(a.thigh + a.knee);
    return { thigh: a.thigh, knee: a.knee, ankle: f.planted ? flat : flat - 0.35 * s.run * Math.sin(Math.PI * 0.5) };
  }) as GaitPose["legs"];
  const half = Math.max(1e-3, g.stance / 2);
  const armAmp = (0.15 + 0.55 * k) * s.run;
  // ręka pracuje przeciwnie do nogi po tej samej stronie
  const arms: [number, number] = [armAmp * Math.max(-1, Math.min(1, feet[1].x / half)), armAmp * Math.max(-1, Math.min(1, feet[0].x / half))];
  return { pelvisY, legs, arms, elbow: 0.35 + (0.5 + 0.6 * k) * s.run, lean: (0.04 + 0.12 * k) * s.run, feet };
}
