import type { FuelEntry, QuickSignals } from "../engine/fuelEngine";
import type { FuelPersistenceAdapter, NewFuelEntry } from "./FuelPersistenceAdapter";

interface SupabaseQueryResult<T> {
  data: T | null;
  error: { message: string } | null;
}

interface SupabaseChain<T = unknown> {
  select(columns?: string): SupabaseChain<T>;
  insert(values: Record<string, unknown> | Record<string, unknown>[]): SupabaseChain<T>;
  upsert(values: Record<string, unknown>, options?: Record<string, unknown>): SupabaseChain<T>;
  eq(column: string, value: unknown): SupabaseChain<T>;
  gte(column: string, value: unknown): SupabaseChain<T>;
  lte(column: string, value: unknown): SupabaseChain<T>;
  order(column: string, options?: Record<string, unknown>): SupabaseChain<T>;
  single(): Promise<SupabaseQueryResult<T>>;
  then<TResult1 = SupabaseQueryResult<T>>(
    onfulfilled?: ((value: SupabaseQueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null
  ): Promise<TResult1>;
}

interface SupabaseClientLike {
  from<T = unknown>(table: string): SupabaseChain<T>;
}

interface SupabaseFuelAdapterOptions {
  ownerUserId: string;
  entriesTable?: string;
  preferencesTable?: string;
}

interface FuelEntryRow {
  id: string;
  athlete_id: string;
  session_id: string | null;
  logged_at: string;
  kind: FuelEntry["kind"];
  label: string;
}

const toFuelEntry = (row: FuelEntryRow): FuelEntry => ({
  id: row.id,
  loggedAt: row.logged_at,
  kind: row.kind,
  label: row.label,
  sessionId: row.session_id ?? undefined
});

/**
 * Adapter intentionally receives an authenticated browser client.
 * Never pass a service-role/secret client into frontend code.
 */
export function createSupabaseFuelAdapter(
  client: SupabaseClientLike,
  options: SupabaseFuelAdapterOptions
): FuelPersistenceAdapter {
  const entriesTable = options.entriesTable ?? "fuel_entries";
  const preferencesTable = options.preferencesTable ?? "fuel_preferences";

  return {
    async listEntries(athleteId, fromIso, toIso) {
      const { data, error } = await client
        .from<FuelEntryRow[]>(entriesTable)
        .select("id, athlete_id, session_id, logged_at, kind, label")
        .eq("user_id", options.ownerUserId)
        .eq("athlete_id", athleteId)
        .gte("logged_at", fromIso)
        .lte("logged_at", toIso)
        .order("logged_at", { ascending: true });

      if (error) throw new Error(`Fuel entries query failed: ${error.message}`);
      return (data ?? []).map(toFuelEntry);
    },

    async addEntry(entry: NewFuelEntry) {
      const { data, error } = await client
        .from<FuelEntryRow>(entriesTable)
        .insert({
          user_id: options.ownerUserId,
          athlete_id: entry.athleteId,
          session_id: entry.sessionId ?? null,
          logged_at: entry.loggedAt,
          kind: entry.kind,
          label: entry.label,
          input_method: entry.inputMethod,
          payload: entry.payload ?? {}
        })
        .select("id, athlete_id, session_id, logged_at, kind, label")
        .single();

      if (error || !data) throw new Error(`Fuel entry insert failed: ${error?.message ?? "no data"}`);
      return toFuelEntry(data);
    },

    async saveQuickSignals(athleteId: string, signals: QuickSignals) {
      const { error } = await client
        .from(preferencesTable)
        .upsert(
          {
            user_id: options.ownerUserId,
            athlete_id: athleteId,
            quick_signals: signals,
            updated_at: new Date().toISOString()
          },
          { onConflict: "user_id,athlete_id" }
        );

      if (error) throw new Error(`Fuel preferences upsert failed: ${error.message}`);
    }
  };
}

