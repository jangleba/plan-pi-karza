/**
 * Trwałe przechowywanie profili kalibracji (localStorage, per urządzenie).
 *
 * Profile są lokalne dla urządzenia — kalibracja kamery telefonu nie ma sensu
 * na innym sprzęcie. Klucz profilu = urządzenie|obiektyw|orientacja|FPS|zoom,
 * dzięki czemu każda kombinacja ma osobny wpis.
 */

import type {
  CalibrationProfile,
  CalibrationKeyParts,
  LensType,
  CaptureOrientation,
} from "@/features/vision-analysis/calibrationProfiles";
import {
  calibrationKey,
  matchCalibrationProfile,
  type CalibrationMatch,
} from "@/features/vision-analysis/calibrationProfiles";

const STORAGE_KEY = "theballlab.calibrationProfiles.v1";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/** Wczytuje wszystkie profile zapisane na tym urządzeniu. */
export function loadCalibrationProfiles(): CalibrationProfile[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CalibrationProfile[]) : [];
  } catch {
    return [];
  }
}

function persist(profiles: CalibrationProfile[]): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
  } catch {
    /* przepełniony/wyłączony storage — ignorujemy cicho */
  }
}

/** Zapisuje profil, nadpisując istniejący o tym samym kluczu. */
export function saveCalibrationProfile(profile: CalibrationProfile): CalibrationProfile[] {
  const profiles = loadCalibrationProfiles().filter((p) => p.key !== profile.key);
  profiles.unshift(profile);
  persist(profiles);
  return profiles;
}

/** Usuwa profil po kluczu. */
export function deleteCalibrationProfile(key: string): CalibrationProfile[] {
  const profiles = loadCalibrationProfiles().filter((p) => p.key !== key);
  persist(profiles);
  return profiles;
}

/** Zwraca profil pasujący dokładnie do kombinacji warunków, lub null. */
export function findCalibrationProfile(parts: CalibrationKeyParts): CalibrationProfile | null {
  const key = calibrationKey(parts);
  return loadCalibrationProfiles().find((p) => p.key === key) ?? null;
}

/** Stabilny identyfikator/etykieta urządzenia z danych przeglądarki. */
export function detectDevice(): { deviceId: string; label: string } {
  if (!isBrowser()) return { deviceId: "unknown-device", label: "Nieznane urządzenie" };
  const ua = window.navigator.userAgent || "";
  const platform = (window.navigator as Navigator).platform || "";
  // Prosty, deterministyczny label — model dokładny podaje użytkownik.
  let label = "Urządzenie";
  if (/iPhone/i.test(ua)) label = "iPhone";
  else if (/iPad/i.test(ua)) label = "iPad";
  else if (/Android/i.test(ua)) {
    const m = ua.match(/Android[^;]*;\s*([^;)]+)/i);
    label = m ? m[1].trim() : "Android";
  } else if (/Macintosh/i.test(ua)) label = "Mac";
  else if (/Windows/i.test(ua)) label = "Windows PC";
  const deviceId = `${label}-${platform}`.replace(/\s+/g, "-");
  return { deviceId, label };
}

export type { LensType, CaptureOrientation };
