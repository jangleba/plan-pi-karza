import type { Profile } from "../engine";
import { assessAge, type AgeAssessment } from "./age";
import { loadPrivate, savePrivate, type PrivateProfile } from "./private";
import { scoped } from "./store";
import { REMOTE_PROFILE_FIELDS } from "./sync-map";

/**
 * Bramka wieku wokół zapisanego profilu: wspólna dla odczytu, zapisu i zmiany danych.
 *  – profil z pamięci jest oczyszczany (tylko znane pola; dawne birthDate/birthYear przenoszone do lokalnego magazynu prywatnego),
 *  – wiek wyliczany jest z daty urodzenia (jeśli jest) albo „starzeje się” z deklaracji, a sprzeczności są naprawiane na korzyść daty,
 *  – osoba poniżej progu lub z niejednoznacznym samym rocznikiem nie wchodzi do aplikacji (stan blocked).
 */
export type GuardResult =
  | { kind: "none" }
  | { kind: "ok"; profile: Profile; birth: PrivateProfile; assessment: AgeAssessment }
  | { kind: "blocked"; reason: "under_min" | "needs_birth_date" | "unknown"; profile: Profile | null; birth: PrivateProfile; assessment: AgeAssessment };

const PROFILE_KEY = "profile";
const isoToday = (): string => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/** Tylko pola kontraktu profilu; reszta (w tym dawne pola daty urodzenia) jest odrzucana, a daty zwracane osobno. */
export function sanitizeStoredProfile(raw: unknown): { profile: Profile | null; legacyBirth: PrivateProfile } {
  if (!raw || typeof raw !== "object") return { profile: null, legacyBirth: {} };
  const r = raw as Record<string, unknown>;
  const legacyBirth: PrivateProfile = {};
  if (typeof r.birthDate === "string") legacyBirth.birthDate = r.birthDate;
  else if (typeof r.birthYear === "number") legacyBirth.birthYear = r.birthYear;
  if (typeof r.age !== "number" || typeof r.weightKg !== "number" || !Array.isArray(r.matchWeekdays)) return { profile: null, legacyBirth };
  const out: Record<string, unknown> = {};
  for (const k of REMOTE_PROFILE_FIELDS) if (r[k] !== undefined) out[k] = r[k];
  return { profile: out as unknown as Profile, legacyBirth };
}

export function saveProfile(p: Profile): void {
  const { profile } = sanitizeStoredProfile(p);
  if (profile) scoped.setItem(PROFILE_KEY, JSON.stringify(profile));
}

/** Ocena wieku dla profilu i lokalnych danych urodzenia. Data odniesienia deklaracji: ageAsOf, a dla starych profili – startDate. */
export function evaluate(profile: Profile, birth: PrivateProfile, today: string): AgeAssessment {
  return assessAge({ birthDate: birth.birthDate, birthYear: birth.birthYear, declaredAge: profile.age, declaredOn: profile.ageAsOf ?? profile.startDate ?? today }, today);
}

function decide(profile: Profile, birth: PrivateProfile, today: string): GuardResult {
  const a = evaluate(profile, birth, today);
  if (a.status !== "ok") return { kind: "blocked", reason: a.status, profile, birth, assessment: a };
  // wiek w profilu = dolne ograniczenie na dziś; z upływem czasu rośnie, a sprzeczność z datą urodzenia jest naprawiana
  if (a.currentAge !== null && (profile.age !== a.currentAge || profile.ageAsOf !== today)) {
    const fixed: Profile = { ...profile, age: a.currentAge, ageAsOf: today };
    saveProfile(fixed);
    return { kind: "ok", profile: fixed, birth, assessment: a };
  }
  return { kind: "ok", profile, birth, assessment: a };
}

export function loadGuardedProfile(today: string = isoToday()): GuardResult {
  let rawProfile: unknown = null;
  try { rawProfile = JSON.parse(scoped.getItem(PROFILE_KEY) ?? "null"); } catch { /* uszkodzony zapis */ }
  const { profile, legacyBirth } = sanitizeStoredProfile(rawProfile);
  if (!profile) return { kind: "none" };
  let birth = loadPrivate();
  if (!birth.birthDate && !birth.birthYear && (legacyBirth.birthDate || legacyBirth.birthYear)) { savePrivate(legacyBirth); birth = loadPrivate(); }
  if (rawProfile && typeof rawProfile === "object" && ("birthDate" in rawProfile || "birthYear" in rawProfile)) saveProfile(profile); // usuń dawne pola z zapisu profilu
  return decide(profile, birth, today);
}

/** Nowy profil z onboardingu: wiek jest deklaracją na dziś; wynik przechodzi tę samą bramkę. */
export function finalizeNewProfile(raw: Profile, today: string = isoToday()): GuardResult {
  const profile: Profile = { ...raw, ageAsOf: today, startDate: raw.startDate ?? today };
  const birth = loadPrivate();
  const r = decide(profile, birth, today);
  if (r.kind === "ok") saveProfile(r.profile);
  return r;
}

/** Zmiana daty urodzenia/rocznika: zapis lokalny i natychmiastowa ponowna ocena (poniżej progu = blokada, także po zmianie daty). */
export function changeBirth(next: PrivateProfile, profile: Profile, today: string = isoToday()): GuardResult {
  savePrivate(next);
  return decide(profile, loadPrivate(), today);
}
