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
}

const KEY = "private";

export function loadPrivate(): PrivateProfile {
  try {
    const v = JSON.parse(scoped.getItem(KEY) ?? "{}") as Partial<PrivateProfile>;
    const out: PrivateProfile = {};
    if (typeof v.birthDate === "string") out.birthDate = v.birthDate;
    if (typeof v.birthYear === "number") out.birthYear = v.birthYear;
    return out;
  } catch {
    return {};
  }
}

export function savePrivate(p: PrivateProfile): void {
  const clean: PrivateProfile = {};
  if (p.birthDate) clean.birthDate = p.birthDate;
  else if (p.birthYear) clean.birthYear = p.birthYear;
  scoped.setItem(KEY, JSON.stringify(clean));
}
