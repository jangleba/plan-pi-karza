import { supabase } from "@/integrations/supabase/client";
import { isRetryableWriteError } from "./offlineTrainingQueue";
import { readAllPages } from "./pagination";
import { LEGAL_VERSION } from "./legal";
import type { Profile } from "./types";

export interface ConsentRow {
  id: string;
  consent_type: string;
  accepted: boolean;
  version: string;
  accepted_at: string;
}

const TTL_MS = 5 * 60_000;
const OFFLINE_TTL_MS = 7 * 24 * 60 * 60_000;
const STORAGE_PREFIX = "ballwise:legal-status:v1:";
type Snapshot = { rows: ConsentRow[]; version: string; checkedAt: number };
const snapshots = new Map<string, Snapshot>();
const requests = new Map<string, Promise<ConsentRow[]>>();
let revision = 0;

export function cachedConsentRows(userId: string, offline = false): ConsentRow[] | null {
  if (typeof window === "undefined") return null;
  let snapshot = snapshots.get(userId);
  if (!snapshot) {
    try {
      const raw = (offline ? window.localStorage : window.sessionStorage).getItem(
        STORAGE_PREFIX + userId,
      );
      if (raw) snapshot = JSON.parse(raw) as Snapshot;
    } catch {
      /* A blocked cache cannot prevent verification. */
    }
  }
  if (
    !snapshot ||
    snapshot.version !== LEGAL_VERSION ||
    !Number.isFinite(snapshot.checkedAt) ||
    snapshot.checkedAt > Date.now() ||
    Date.now() - snapshot.checkedAt >= (offline ? OFFLINE_TTL_MS : TTL_MS) ||
    !Array.isArray(snapshot.rows) ||
    !snapshot.rows.every(
      (row) =>
        row &&
        typeof row.consent_type === "string" &&
        typeof row.version === "string" &&
        typeof row.accepted === "boolean",
    )
  )
    return null;
  if (offline) {
    const needs = consentNeeds(snapshot.rows, {} as Profile);
    if (!needs.termsCurrent || !needs.privacyCurrent) return null;
  }
  snapshots.set(userId, snapshot);
  return snapshot.rows;
}

export function consentNeeds(rows: ConsentRow[], profile: Profile) {
  const latest = new Map<string, ConsentRow>();
  for (const row of rows) if (!latest.has(row.consent_type)) latest.set(row.consent_type, row);
  const accepted = (type: string) => {
    const row = latest.get(type);
    return row?.accepted === true && row.version === LEGAL_VERSION;
  };
  const termsCurrent = accepted("terms");
  const privacyCurrent = accepted("privacy");
  const healthRenewal = profile.healthPersonalizationEnabled === true && !accepted("health_data");
  // Precision is dormant: do not request new body-mass consent for an unavailable feature.
  // Legacy data stays exportable and the existing consent can still be withdrawn.
  const fuelRenewal = false;
  return {
    termsCurrent,
    privacyCurrent,
    healthRenewal,
    fuelRenewal,
    required: !termsCurrent || !privacyCurrent || healthRenewal || fuelRenewal,
  };
}

export function clearConsentStatusCache(): void {
  revision += 1;
  snapshots.clear();
  requests.clear();
  if (typeof window === "undefined") return;
  try {
    for (const storage of [window.sessionStorage, window.localStorage]) {
      const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i));
      for (const key of keys) if (key?.startsWith(STORAGE_PREFIX)) storage.removeItem(key);
    }
  } catch {
    /* No cache is required for correctness. */
  }
}

export function loadConsentRows(userId: string, force = false): Promise<ConsentRow[]> {
  const cached = force ? null : cachedConsentRows(userId);
  if (cached) return Promise.resolve(cached);
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    const previous = cachedConsentRows(userId, true);
    if (previous) return Promise.resolve(previous);
    return Promise.reject(
      new Error(
        "Połącz się z internetem, aby zaakceptować aktualne dokumenty. Kopię swoich wyników możesz pobrać w Moje dane i prawa.",
      ),
    );
  }
  const existing = requests.get(userId);
  if (existing) return existing;
  const startedRevision = revision;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  const request = (async () => {
    const { data, error } = await readAllPages(
      (from, to) =>
        supabase
          .from("consent_logs")
          .select("id, consent_type, accepted, version, accepted_at")
          .eq("user_id", userId)
          .in("consent_type", ["terms", "privacy", "health_data", "fuel_precision"])
          .order("accepted_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to)
          .abortSignal(controller.signal),
      controller.signal,
    );
    if (error) {
      const offlineRows = isRetryableWriteError(error) ? cachedConsentRows(userId, true) : null;
      if (offlineRows && startedRevision === revision) return offlineRows;
      throw new Error("Nie udało się sprawdzić aktualności dokumentów. Spróbuj ponownie.");
    }
    const latest = new Map<string, ConsentRow>();
    for (const row of (data ?? []) as ConsentRow[])
      if (!latest.has(row.consent_type)) latest.set(row.consent_type, row);
    const rows = [...latest.values()];
    if (startedRevision === revision) {
      const snapshot = { rows, version: LEGAL_VERSION, checkedAt: Date.now() };
      snapshots.set(userId, snapshot);
      try {
        window.sessionStorage.setItem(STORAGE_PREFIX + userId, JSON.stringify(snapshot));
        window.localStorage.setItem(STORAGE_PREFIX + userId, JSON.stringify(snapshot));
      } catch {
        /* The verified result remains available in memory. */
      }
    }
    return rows;
  })()
    .catch((error) => {
      const fallback = isRetryableWriteError(error) ? cachedConsentRows(userId, true) : null;
      if (fallback && startedRevision === revision) return fallback;
      throw error;
    })
    .finally(() => {
      clearTimeout(timeout);
      if (requests.get(userId) === request) requests.delete(userId);
    });
  requests.set(userId, request);
  return request;
}

/** Start in parallel with hydration, not after the first screen is already visible. */
export function primeConsentRows(userId: string): void {
  if (typeof window !== "undefined") void loadConsentRows(userId).catch(() => undefined);
}
