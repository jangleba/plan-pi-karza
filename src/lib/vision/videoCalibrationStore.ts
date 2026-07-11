/**
 * Trwałe przechowywanie kalibracji sceny per FILM (localStorage).
 *
 * Kluczem jest videoHash — kalibracja jest powiązana z konkretnym nagraniem,
 * bo homografia zależy od dokładnego położenia i kąta telefonu względem podłoża.
 * Ponowne otwarcie tego samego filmu odtwarza tę samą kalibrację.
 */

import type { CalibrationRecord } from "@/features/vision-analysis/videoCalibration";

const STORAGE_KEY = "theballlab.videoCalibrations.v1";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readAll(): Record<string, CalibrationRecord> {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, CalibrationRecord>) : {};
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, CalibrationRecord>): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* storage pełny/wyłączony — ignorujemy */
  }
}

/** Zapisuje/nadpisuje kalibrację dla danego filmu (po videoHash). */
export function saveVideoCalibration(record: CalibrationRecord): CalibrationRecord {
  const map = readAll();
  map[record.videoHash] = record;
  writeAll(map);
  return record;
}

/** Zwraca kalibrację przypisaną do filmu lub null. */
export function findVideoCalibration(videoHash: string): CalibrationRecord | null {
  if (!videoHash) return null;
  return readAll()[videoHash] ?? null;
}

/** Usuwa kalibrację filmu. */
export function deleteVideoCalibration(videoHash: string): void {
  const map = readAll();
  delete map[videoHash];
  writeAll(map);
}

/** Wszystkie zapisane kalibracje filmów. */
export function listVideoCalibrations(): CalibrationRecord[] {
  return Object.values(readAll());
}
