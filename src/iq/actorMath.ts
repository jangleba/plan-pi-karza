/**
 * Czysta matematyka aktorów (bez Three.js, testowalna):
 * mieszanie klipów wg prędkości i podział ciała na części stroju.
 */

/** Natywne prędkości klipów Mixamo (m/s), zmierzone na stopie w podporze względem bioder (src/iq/actors.test.ts). */
export const NATIVE = { run: 5.63, walk: 1.75 } as const;
/** Chwila kontaktu stopy z piłką w klipie podania (s) i położenie piłki w układzie modelu (cm). */
export const PASS = { contact: 0.43, duration: 1.6, spotCm: { x: -3.7, y: 11.5, z: 22.7 } } as const;

const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export interface Locomotion { idle: number; walk: number; run: number; walkScale: number; runScale: number }

/**
 * Wagi klipów i tempo odtwarzania dla prędkości v (m/s).
 * Tempo = v / prędkość natywna, żeby stopa w podporze stała względem murawy (z ograniczeniem, by nie zwalniać do „slow-motion”).
 */
export function locomotion(v: number): Locomotion {
  const run = sstep(2.4, 3.6, v);
  const walk = (1 - run) * sstep(0.12, 0.6, v);
  const idle = Math.max(0, 1 - walk - run);
  return {
    idle, walk, run,
    walkScale: Math.min(1.9, Math.max(0.55, v / NATIVE.walk)),
    runScale: Math.min(1.4, Math.max(0.75, v / NATIVE.run)),
  };
}

/**
 * Cykl kroku klipów (zmierzone na modelu, src/iq/actors.test.ts): czas trwania cyklu (s) oraz faza (0–1), w której lewa stopa jest
 * najdalej z przodu względem bioder. Obie fazy są niemal równe, więc klipy chodu i biegu można prowadzić jedną wspólną fazą kroku.
 */
export const CYCLE = {
  walk: { dur: 1.0333, front: 0.225 },
  run: { dur: 0.6333, front: 0.21 },
} as const;
/** Długość podwójnego kroku (m) klipu: prędkość natywna × czas cyklu. */
export const STRIDE = { walk: NATIVE.walk * CYCLE.walk.dur, run: NATIVE.run * CYCLE.run.dur } as const;

/**
 * Wspólna faza kroku: zamiast dwóch niezależnych zegarów (chód i bieg rozjeżdżały się w fazie podczas mieszania, stopa ślizgała się)
 * jeden zegar φ (cykle) napędza oba klipy. Tempo = prędkość / uśredniona długość kroku, więc przy każdym miksie stopa w podporze
 * stoi względem murawy (suma wag × długość kroku × tempo = prędkość).
 */
export function cycleRate(v: number, L: Pick<Locomotion, "walk" | "run">): number {
  const w = L.walk + L.run;
  const r = w > 1e-6 ? L.run / w : 0;
  return v / (STRIDE.walk * (1 - r) + STRIDE.run * r);
}
/** Czas w klipie (s) dla fazy φ (cykle, dowolna liczba). */
export function clipTime(kind: "walk" | "run", phase: number): number {
  const c = CYCLE[kind];
  const f = (((phase + c.front) % 1) + 1) % 1;
  return f * c.dur;
}

export type Part = "skin" | "jersey" | "shorts" | "socks" | "boots" | "gloves";

/**
 * Do jakiej części stroju należy wierzchołek: po dominującej kości i wysokości w pozie bazowej (cm).
 * refs: wysokości stawów w pozie bazowej – biodro (hip) i kolano (knee).
 */
export function partOf(bone: string, y: number, refs: { hip: number; knee: number }, keeper = false): Part {
  const n = bone.replace(/^mixamorig/, "").replace(/_1$/, "");
  if (/^(Head|HeadTop_End|Neck)/.test(n)) return "skin";
  if (/Hand/.test(n)) return keeper ? "gloves" : "skin";
  if (/ForeArm/.test(n)) return keeper ? "jersey" : "skin";
  if (/Arm$|Shoulder$|^Spine/.test(n)) return "jersey";
  if (/^Hips$/.test(n)) return "shorts";
  if (/UpLeg$/.test(n)) return y > refs.hip - 0.5 * (refs.hip - refs.knee) ? "shorts" : "skin";
  if (/Leg$/.test(n)) return y < refs.knee - 6 ? "socks" : "skin";
  if (/Foot$|Toe/.test(n)) return "boots";
  return "skin";
}
