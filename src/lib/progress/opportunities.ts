import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/loadwise/auth";

/**
 * SZANSE — wyłącznie zweryfikowane, publiczne ogłoszenia.
 *
 * ZASADA TWARDA: nie generujemy ofert, klubów, terminów ani kontaktów.
 * Rejestr poniżej może zawierać wyłącznie wpisy przepisane 1:1 z oficjalnego,
 * publicznego źródła, z datą weryfikacji. Dopóki źródło danych nie jest
 * podłączone, lista pozostaje pusta i UI pokazuje uczciwy empty state.
 */
export interface Opportunity {
  id: string;
  kind: "club_trial" | "recruitment" | "training_session" | "camp" | "open_signup";
  club: string;
  title: string;
  dateIso: string; // termin wydarzenia / zakończenia zgłoszeń
  city: string;
  region: string;
  requirements: string;
  ageMin: number;
  ageMax: number;
  gender: "male" | "female" | "any";
  positions: string[]; // puste = wszystkie pozycje
  phone: string | null;
  email: string | null;
  formUrl: string | null;
  sourceUrl: string;
  verifiedAtIso: string;
}

/** Pusty do czasu podłączenia zweryfikowanego źródła ogłoszeń. */
export const VERIFIED_OPPORTUNITIES: Opportunity[] = [];

export interface OpportunityFilters {
  city: string;
  radiusKm: number;
  age: number | null;
  position: string | null;
  gender: "male" | "female" | "any";
}

export function matchOpportunities(
  all: Opportunity[],
  f: OpportunityFilters,
  todayIso: string,
): Opportunity[] {
  return all
    .filter((o) => o.dateIso >= todayIso) // ukryj wygasłe
    .filter((o) => (f.age == null ? true : f.age >= o.ageMin && f.age <= o.ageMax))
    .filter((o) => o.gender === "any" || f.gender === "any" || o.gender === f.gender)
    .filter((o) =>
      !f.position || o.positions.length === 0 ? true : o.positions.includes(f.position),
    )
    .filter((o) =>
      f.city.trim()
        ? `${o.city} ${o.region}`.toLowerCase().includes(f.city.trim().toLowerCase())
        : true,
    )
    .sort((a, b) => (a.dateIso < b.dateIso ? -1 : 1));
}

// ---------------- Zapisane szanse + tracker zgłoszeń ----------------

export const TRACKER_STAGES = [
  "saved",
  "contacted",
  "applied",
  "scheduled",
  "done",
] as const;
export type TrackerStage = (typeof TRACKER_STAGES)[number];

export const TRACKER_LABELS: Record<TrackerStage, string> = {
  saved: "Zapisane",
  contacted: "Kontakt wykonany",
  applied: "Zgłoszenie wysłane",
  scheduled: "Test umówiony",
  done: "Zakończone",
};

export interface SavedOpportunity {
  id: string;
  club: string;
  title: string;
  dateIso: string;
  city: string;
  sourceUrl: string | null;
  stage: TrackerStage;
  note: string;
  followUpIso: string | null;
  addedToPlan: boolean;
  createdAt: string;
}

export interface NotificationPrefs {
  enabled: boolean;
  newMatches: boolean;
  deadlineEnding: boolean;
  reminder48h: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = {
  enabled: false,
  newMatches: false,
  deadlineEnding: false,
  reminder48h: false,
};

interface Store {
  saved: SavedOpportunity[];
  prefs: NotificationPrefs;
  filters: OpportunityFilters;
}

function storageKey(userId: string) {
  return `ballwise:opportunities:v1:${userId}`;
}

function readStore(userId: string, fallbackFilters: OpportunityFilters): Store {
  const empty: Store = { saved: [], prefs: DEFAULT_PREFS, filters: fallbackFilters };
  if (typeof window === "undefined") return empty;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<Store>;
    return {
      saved: Array.isArray(parsed.saved) ? parsed.saved : [],
      prefs: { ...DEFAULT_PREFS, ...(parsed.prefs ?? {}) },
      filters: { ...fallbackFilters, ...(parsed.filters ?? {}) },
    };
  } catch {
    return empty;
  }
}

export function useOpportunityStore(defaults: OpportunityFilters) {
  const { user } = useAuth();
  const [store, setStore] = useState<Store>(() => ({
    saved: [],
    prefs: DEFAULT_PREFS,
    filters: defaults,
  }));

  useEffect(() => {
    if (!user) return;
    setStore(readStore(user.id, defaults));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const persist = useCallback(
    (next: Store) => {
      setStore(next);
      if (!user) return;
      try {
        window.localStorage.setItem(storageKey(user.id), JSON.stringify(next));
      } catch {
        /* ignore */
      }
    },
    [user],
  );

  const save = useCallback(
    (o: Omit<SavedOpportunity, "stage" | "note" | "followUpIso" | "addedToPlan" | "createdAt">) => {
      if (store.saved.some((s) => s.id === o.id)) return;
      persist({
        ...store,
        saved: [
          {
            ...o,
            stage: "saved",
            note: "",
            followUpIso: null,
            addedToPlan: false,
            createdAt: new Date().toISOString(),
          },
          ...store.saved,
        ],
      });
    },
    [persist, store],
  );

  const update = useCallback(
    (id: string, patch: Partial<SavedOpportunity>) => {
      persist({
        ...store,
        saved: store.saved.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      });
    },
    [persist, store],
  );

  const remove = useCallback(
    (id: string) => persist({ ...store, saved: store.saved.filter((s) => s.id !== id) }),
    [persist, store],
  );

  const setPrefs = useCallback(
    (patch: Partial<NotificationPrefs>) =>
      persist({ ...store, prefs: { ...store.prefs, ...patch } }),
    [persist, store],
  );

  const setFilters = useCallback(
    (patch: Partial<OpportunityFilters>) =>
      persist({ ...store, filters: { ...store.filters, ...patch } }),
    [persist, store],
  );

  return useMemo(
    () => ({
      saved: store.saved,
      prefs: store.prefs,
      filters: store.filters,
      save,
      update,
      remove,
      setPrefs,
      setFilters,
    }),
    [store, save, update, remove, setPrefs, setFilters],
  );
}

export function countdownDays(dateIso: string, todayIso: string): number {
  return Math.round(
    (Date.parse(`${dateIso}T00:00:00Z`) - Date.parse(`${todayIso}T00:00:00Z`)) / 86400000,
  );
}

// ---------------- Profil zawodnika dla klubu ----------------

export interface ClubProfilePrefs {
  shareAge: boolean;
  sharePosition: boolean;
  shareFoot: boolean;
  shareLocation: boolean;
  shareTests: boolean;
  shareAchievements: boolean;
  videoUrl: string;
  dominantFoot: string;
  city: string;
  achievements: string;
}

export const DEFAULT_CLUB_PROFILE: ClubProfilePrefs = {
  shareAge: true,
  sharePosition: true,
  shareFoot: false,
  shareLocation: false,
  shareTests: false,
  shareAchievements: false,
  videoUrl: "",
  dominantFoot: "",
  city: "",
  achievements: "",
};

export function useClubProfile() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<ClubProfilePrefs>(DEFAULT_CLUB_PROFILE);

  useEffect(() => {
    if (!user || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(`ballwise:clubprofile:v1:${user.id}`);
      if (raw) setPrefs({ ...DEFAULT_CLUB_PROFILE, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
  }, [user]);

  const update = useCallback(
    (patch: Partial<ClubProfilePrefs>) => {
      setPrefs((prev) => {
        const next = { ...prev, ...patch };
        if (user) {
          try {
            window.localStorage.setItem(
              `ballwise:clubprofile:v1:${user.id}`,
              JSON.stringify(next),
            );
          } catch {
            /* ignore */
          }
        }
        return next;
      });
    },
    [user],
  );

  return { prefs, update };
}
