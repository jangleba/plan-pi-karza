/**
 * Skok w dal z nagrania: skala z wzrostu zawodnika, więc odległość telefonu od zawodnika
 * nie ma znaczenia (wzrost w pikselach i odcinek skoku leżą w tej samej płaszczyźnie).
 * Zakładamy telefon nieruchomy i ustawiony prostopadle do kierunku skoku.
 */
export const HEIGHT_RANGE_CM: [number, number] = [120, 220];
/** Najmniejszy sensowny wzrost zawodnika w kadrze (px); niżej zaznaczenia są zbyt niedokładne. */
export const MIN_HEIGHT_PX = 120;

export interface Calibration { cmPerPx: number; heightPx: number }

/** Skala (cm na piksel) z wzrostu zawodnika i pionowego odcinka głowa–podłoże w kadrze. */
export function calibrate(heightCm: number, headY: number, floorY: number): Calibration {
  if (!(heightCm >= HEIGHT_RANGE_CM[0] && heightCm <= HEIGHT_RANGE_CM[1])) throw new RangeError(`Wzrost: ${HEIGHT_RANGE_CM[0]}–${HEIGHT_RANGE_CM[1]} cm`);
  const heightPx = floorY - headY;
  if (!(heightPx >= MIN_HEIGHT_PX)) throw new RangeError("Zaznacz czubek głowy nad podłożem; zawodnik musi być większy w kadrze.");
  return { cmPerPx: heightCm / heightPx, heightPx };
}

/** Odległość skoku (cm): od linii palców przed skokiem do tyłu pięty po lądowaniu (wzdłuż osi poziomej kadru). */
export function jumpDistanceCm(toeX: number, heelX: number, cal: Calibration): number {
  return Math.abs(heelX - toeX) * cal.cmPerPx;
}

/**
 * Szacunek błędu (cm): dwa zaznaczenia po ok. 4 px oraz błąd skali (zaznaczenie głowy i podłoża
 * oraz postawa przy pomiarze wzrostu, ok. 1,5%). To nie jest walidowana niepewność.
 */
export function jumpErrorCm(distanceCm: number, cal: Calibration, tapPx = 4, auto = false): number {
  const abs = Math.SQRT2 * tapPx * cal.cmPerPx;
  // automatyczna skala opiera się na proporcjach ciała (oczy, pięta), więc błąd względny jest większy
  const rel = distanceCm * Math.hypot((Math.SQRT2 * tapPx) / cal.heightPx, auto ? 0.035 : 0.015);
  return Math.hypot(abs, rel);
}

/** Klatka z wykrytą sylwetką, w pikselach filmu. */
export interface PoseFrame {
  /** Średnia wysokość oczu (y). */
  eyeY: number;
  /** Najniższa pięta (y). */
  heelY: number;
  /** Średnia y pięt i czubków stóp (do wykrycia lotu). */
  footY: number;
  heelXs: number[];
  toeXs: number[];
}

export interface JumpAnalysis {
  distanceCm: number;
  cal: Calibration;
  /** Linia palców, tył pięty, głowa i podłoże w pikselach filmu (do podglądu i ręcznej korekty). */
  toeX: number; heelX: number; headY: number; floorY: number;
  /** Czas (s) klatki ze staniem, odbicia i lądowania. */
  standS: number; takeoffS: number; landingS: number;
  /** 0–1: ile klatek miało komplet punktów. */
  confidence: number;
}

// proporcje ciała: oczy ok. 93,6% wzrostu nad podłożem, środek pięty ok. 2,5% wzrostu nad podłożem
const EYE = 0.936;
const HEEL = 0.025;
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; };

/**
 * Automatyczny pomiar skoku w dal z punktów sylwetki (bez ręcznego zaznaczania):
 * lot = stopy wyraźnie nad podłożem, skala = wzrost / wysokość sylwetki w kadrze,
 * linia palców = czubki stóp przed odbiciem, wynik = tył bliższej pięty po lądowaniu.
 * Zwraca null, gdy nie widać skoku, kierunku albo kompletu punktów.
 */
export function analyzeJump(frames: Array<PoseFrame | null>, fps: number, heightCm: number): JumpAnalysis | null {
  if (!(heightCm >= HEIGHT_RANGE_CM[0] && heightCm <= HEIGHT_RANGE_CM[1]) || !(fps > 0)) return null;
  const idx = frames.map((f, i) => (f ? i : -1)).filter((i) => i >= 0);
  if (idx.length < fps) return null;
  const F = (i: number) => frames[i]!;
  // podłoże: typowa pozycja stóp, gdy stoją (największe y)
  const feet = idx.map((i) => F(i).footY).sort((a, b) => a - b);
  const ground = median(feet.slice(Math.floor(feet.length * 0.7)));
  const stature0 = median(idx.map((i) => (F(i).heelY - F(i).eyeY) / (EYE - HEEL)));
  if (!(stature0 >= MIN_HEIGHT_PX)) return null;
  const up = (i: number) => ground - F(i).footY;
  // najdłuższy ciąg klatek lotu (luki do 2 klatek wybaczamy)
  const air = (i: number) => frames[i] !== null && up(i) > 0.04 * stature0;
  let best: [number, number] | null = null;
  let start = -1, last = -1;
  for (let i = 0; i < frames.length; i++) {
    if (air(i)) { if (start < 0 || i - last > 3) start = i; last = i; if (!best || last - start > best[1] - best[0]) best = [start, last]; }
  }
  if (!best) return null;
  const dur = (best[1] - best[0] + 1) / fps;
  if (dur < 0.2 || dur > 1.2) return null;
  const a = best[0], b = best[1] + 1;
  const near = (from: number, to: number) => idx.filter((i) => i >= Math.floor(from) && i <= Math.floor(to));
  const stand = near(a - 0.5 * fps, a - 0.15 * fps);
  const settled = near(b + 0.3 * fps, b + 1.2 * fps);
  if (stand.length < 3 || settled.length < 3) return null;
  const meanX = (ids: number[]) => median(ids.flatMap((i) => [...F(i).toeXs, ...F(i).heelXs]));
  const shift = meanX(settled) - meanX(stand);
  const stature = median(stand.map((i) => (F(i).heelY - F(i).eyeY) / (EYE - HEEL)));
  if (!(stature >= MIN_HEIGHT_PX) || Math.abs(shift) < 0.3 * stature) return null;
  const dir = shift > 0 ? 1 : -1;
  const toeCandidates = stand.filter((i) => F(i).toeXs.length).map((i) => (dir > 0 ? Math.max(...F(i).toeXs) : Math.min(...F(i).toeXs)));
  const heelCandidates = settled.filter((i) => F(i).heelXs.length).map((i) => (dir > 0 ? Math.min(...F(i).heelXs) : Math.max(...F(i).heelXs)));
  if (toeCandidates.length < 3 || heelCandidates.length < 3) return null;
  const toeX = median(toeCandidates), heelX = median(heelCandidates);
  const floorY = median(stand.map((i) => F(i).heelY)) + HEEL * stature;
  const cal: Calibration = { cmPerPx: heightCm / stature, heightPx: stature };
  const distanceCm = jumpDistanceCm(toeX, heelX, cal);
  const used = stand.length + settled.length;
  return {
    distanceCm, cal, toeX, heelX, floorY, headY: floorY - stature,
    standS: stand[Math.floor(stand.length / 2)]! / fps, takeoffS: a / fps, landingS: b / fps,
    confidence: Math.min(1, used / (0.35 * fps + 0.9 * fps)),
  };
}
