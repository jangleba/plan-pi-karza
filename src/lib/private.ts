import { scoped } from "./store";

/**
 * Dane wrażliwe, które zostają WYŁĄCZNIE na urządzeniu (w przestrzeni bieżącego konta/gościa).
 * Nie należą do obiektu Profile, więc nie mogą trafić do synchronizacji przez przypadek.
 * Do backendu idzie tylko jawnie wybrany, minimalny zakres (patrz sync-map.ts).
 */
export interface PrivateProfile {
  /** Pełna data urodzenia (YYYY-MM-DD). */
  birthDate?: string;
  /** Tylko rok – gdy użytkownik nie podał pełnej daty. */
  birthYear?: number;
  /** Wzrost (cm): tylko do skali pomiaru skoku w dal z nagrania. Opcjonalny, nie należy do profilu i nie jest synchronizowany. */
  heightCm?: number;
}

export const HEIGHT_MIN = 120;
export const HEIGHT_MAX = 220;
const validHeight = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= HEIGHT_MIN && v <= HEIGHT_MAX;

const KEY = "private";

export function loadPrivate(): PrivateProfile {
  try {
    const v = JSON.parse(scoped.getItem(KEY) ?? "{}") as Partial<PrivateProfile>;
    const out: PrivateProfile = {};
    if (typeof v.birthDate === "string") out.birthDate = v.birthDate;
    if (typeof v.birthYear === "number") out.birthYear = v.birthYear;
    if (validHeight(v.heightCm)) out.heightCm = Math.round(v.heightCm);
    return out;
  } catch {
    return {};
  }
}

export function savePrivate(p: PrivateProfile): void {
  const clean: PrivateProfile = {};
  if (p.birthDate) clean.birthDate = p.birthDate;
  else if (p.birthYear) clean.birthYear = p.birthYear;
  // zmiana daty urodzenia nie może wyzerować wzrostu (i odwrotnie)
  const height = "heightCm" in p ? p.heightCm : loadPrivate().heightCm;
  if (validHeight(height)) clean.heightCm = Math.round(height);
  scoped.setItem(KEY, JSON.stringify(clean));
}

/** Zapis lub usunięcie (undefined) samego wzrostu; data urodzenia zostaje bez zmian. */
export function saveHeight(cm: number | undefined): void {
  savePrivate({ ...loadPrivate(), heightCm: cm });
}
