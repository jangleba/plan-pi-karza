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
export function jumpErrorCm(distanceCm: number, cal: Calibration, tapPx = 4): number {
  const abs = Math.SQRT2 * tapPx * cal.cmPerPx;
  const rel = distanceCm * Math.hypot((Math.SQRT2 * tapPx) / cal.heightPx, 0.015);
  return Math.hypot(abs, rel);
}
