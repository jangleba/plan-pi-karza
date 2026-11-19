/**
 * Radar „Piłkarskie szanse” – wspólne typy. Ten katalog jest używany przez aplikację (Vite)
 * i funkcje Supabase Edge (Deno), więc: tylko czysty TypeScript, importy z rozszerzeniem .ts,
 * bez API Node/DOM/Deno.
 */

export type Position = "bramkarz" | "obronca" | "pomocnik" | "skrzydlowy" | "napastnik";
export const POSITIONS: Position[] = ["bramkarz", "obronca", "pomocnik", "skrzydlowy", "napastnik"];

export type ListingKind = "nabor" | "testy" | "trening_otwarty" | "testy_bramkarskie" | "inne";
export const LISTING_KINDS: Array<[ListingKind, string]> = [
  ["nabor", "Nabór"], ["testy", "Testy"], ["trening_otwarty", "Trening otwarty"], ["testy_bramkarskie", "Testy bramkarskie"], ["inne", "Inne"],
];

/** Reguła rocznika (rok urodzenia). Lista reguł w `Eligibility.birthYears` łączy się przez LUB. */
export type BirthYearRule =
  | { op: "in"; years: number[] } // „2010 i 2012” = 2010 LUB 2012 (nie 2011)
  | { op: "range"; from: number; to: number } // „2012–2013”, włącznie
  | { op: "gte"; year: number } // „2010 i młodsi”: rok urodzenia >= 2010
  | { op: "lte"; year: number }; // „2010 i starsi”: rok urodzenia <= 2010

/** Na jaki dzień liczony jest wiek – tylko to, co wskazał organizator. */
export type AgeRef = { type: "date"; date: string } | { type: "session_start" } | { type: "unspecified" };

/** Limit wieku w ukończonych latach, np. „do 17 lat włącznie na 31.12.2026” = { op: "lte", age: 17, ref: date }. */
export interface AgeLimit { op: "lt" | "lte" | "gt" | "gte" | "eq"; age: number; ref: AgeRef }

export interface Eligibility {
  /** Roczniki (alternatywa) – razem z `ageLimits` muszą być spełnione oba warunki. */
  birthYears?: BirthYearRule[];
  ageLimits?: AgeLimit[];
  /** Sama etykieta („U17”, „junior”) nie wystarcza bez potwierdzonych zasad. */
  categoryLabel?: string;
  /** Wyjątek wymagający zgody (np. „młodsi za zgodą trenera”) – nigdy nie jest spełniony automatycznie. */
  consentException?: string;
  /** Niejednoznaczność wykryta przy odczycie – blokuje rekomendację. */
  ambiguous?: string;
}

export type PositionRule = { scope: "all" } | { scope: "only"; positions: Position[] } | { scope: "unknown" };
export type SignupMode = "individual" | "team_only" | "unknown";
export type SignupStatus = "open" | "closed" | "cancelled" | "full" | "unknown";
export type CostState = "free" | "paid" | "unknown";
export type ListingStatus = "pending_review" | "published" | "withdrawn" | "expired" | "duplicate";
export type SessionStatus = "active" | "cancelled";

/** Jedna sesja (konkretny dzień/termin) ogłoszenia. Zasady wieku są PER SESJA. */
export interface RadarSession {
  id: string;
  /** Data lokalna (Europe/Warsaw), YYYY-MM-DD. */
  date: string;
  /** Godzina rozpoczęcia HH:MM, tylko jeśli podana w źródle. */
  startTime?: string | null;
  /** Dokładny moment rozpoczęcia (ISO UTC), tylko gdy znana godzina. */
  startsAt?: string | null;
  city?: string | null;
  venue?: string | null;
  /** Współrzędne miejsca sesji, gdy różni się od ogłoszenia (rozpoznane po nazwie miejscowości). */
  lat?: number | null;
  lon?: number | null;
  eligibility?: Eligibility | null;
  status: SessionStatus;
}

export interface RadarListing {
  id: string;
  url: string;
  kind: ListingKind;
  organizer: string;
  title?: string | null;
  /** Krótki własny opis faktów. */
  summary: string;
  city?: string | null;
  venue?: string | null;
  lat?: number | null;
  lon?: number | null;
  positions: PositionRule;
  signupMode: SignupMode;
  signupStatus: SignupStatus;
  costState: CostState;
  costPln?: number | null;
  requirementsText?: string | null;
  /** Domyślne zasady wieku (dla ofert bez osobnych sesji, także bezterminowych). */
  eligibility?: Eligibility | null;
  sessions: RadarSession[];
  indefinite: boolean;
  /** Koniec przyjmowania zgłoszeń – moment WYKLUCZAJĄCY (np. początek następnego dnia lokalnego przy samej dacie). */
  signupClosesAt?: string | null;
  publishedAt?: string | null;
  status: ListingStatus;
  sourceCheckedAt?: string | null;
  organizerConfirmedAt?: string | null;
}

/** Dane zawodnika do dopasowania; nigdy nie opuszczają urządzenia. */
export interface PlayerFacts {
  /** Pełna data urodzenia (YYYY-MM-DD) albo tylko rok. */
  birthDate?: string | null;
  birthYear?: number | null;
  position?: Position | null;
  place?: { name: string; lat: number; lon: number } | null;
  /** null = cała Polska. */
  radiusKm: number | null;
  /** Wybrane rodzaje ofert; puste = wszystkie. */
  kinds: ListingKind[];
}

export type Qualification = "MATCH" | "NO_MATCH" | "NEEDS_INFORMATION";

export type ReasonCode =
  | "birth_year_missing" | "birth_year_out" | "age_out" | "age_ref_unspecified" | "needs_birthday"
  | "category_only" | "age_unknown" | "ambiguous" | "consent_exception"
  | "position_out" | "position_missing" | "listing_position_unknown"
  | "team_only" | "signup_mode_unknown"
  | "distance_out" | "distance_unknown" | "place_missing" | "kind_not_selected";

export interface QualResult {
  result: Qualification;
  reasons: ReasonCode[];
  /** Odległość w km (przybliżona, ze środków miejscowości) albo null, gdy nieznana. */
  distanceKm: number | null;
}
