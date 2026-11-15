import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  gymRecordKey,
  validGymRecordData,
  type GymRecord,
  type GymRecordData,
} from "./gymEvidence";
import {
  isRetryableWriteError,
  readPendingTrainingWrites,
  recoverTrainingQueue,
  withDurableTrainingWrite,
} from "./offlineTrainingQueue";

interface GymEvidenceContext {
  records: GymRecord[];
  available: boolean;
  loading: boolean;
  error: string | null;
  save: (data: GymRecordData) => Promise<GymRecord>;
}
const Context = createContext<GymEvidenceContext>({
  records: [],
  available: false,
  loading: true,
  error: null,
  save: async () => {
    throw new Error("Poczekaj na wczytanie zapisów treningu.");
  },
});
export const useGymEvidence = () => useContext(Context);
function validRow(v: unknown, owner: string): v is GymRecord {
  if (!v || typeof v !== "object") return false;
  const r = v as GymRecord;
  return (
    r.user_id === owner &&
    validGymRecordData(r.payload) &&
    r.record_key === gymRecordKey(r.payload) &&
    Number.isInteger(r.revision) &&
    r.revision >= 0 &&
    typeof r.updated_at === "string"
  );
}
const overlay = (rows: GymRecord[], next: GymRecord) => [
  next,
  ...rows.filter((r) => r.record_key !== next.record_key),
];
export function GymEvidenceProvider({
  ownerId,
  ready,
  children,
}: {
  ownerId?: string;
  ready: boolean;
  children: ReactNode;
}) {
  const [state, setState] = useState({
    owner: ownerId,
    records: [] as GymRecord[],
    available: false,
    loading: true,
    error: null as string | null,
  });
  const live = useRef(state);
  live.current = state;
  const owner = useRef(ownerId);
  owner.current = ownerId;
  const writing = useRef(new Set<string>());
  const mutation = useRef(0);
  const versions = useRef(new Map<string, number>());
  const mounted = useRef(false),
    purged = useRef(new Set<string>());
  useEffect(() => {
    if (!ownerId || !ready || purged.current.has(ownerId)) return;
    mounted.current = true;
    const user = ownerId,
      key = `ballwise:gym-evidence:v1:${user}`;
    let stopped = false,
      revision = 0;
    let cached: GymRecord[] = [];
    let cacheAvailable = false;
    try {
      const raw = JSON.parse(localStorage.getItem(key) ?? "null");
      if (raw?.version === 1 && Array.isArray(raw.records)) {
        cached = raw.records.filter((r: unknown) => validRow(r, user));
        cacheAvailable = true;
      }
    } catch {
      /* A cache is not a successful save. */
    }
    async function load() {
      const flight = ++revision;
      const lease = mutation.current;
      await recoverTrainingQueue(user);
      const [configuration, history] = await Promise.all([
        supabase
          .from("gym_records")
          .select("*")
          .eq("user_id", user)
          .in("payload->>kind", ["equipment", "band_setup", "band_selection"])
          .order("updated_at", { ascending: false })
          .limit(1000),
        supabase
          .from("gym_records")
          .select("*")
          .eq("user_id", user)
          .in("payload->>kind", ["response", "observation"])
          .gte("updated_at", new Date(Date.now() - 90 * 86400000).toISOString())
          .order("updated_at", { ascending: false })
          .limit(1000),
      ]);
      const result = {
        error: configuration.error ?? history.error,
        data: [...(configuration.data ?? []), ...(history.data ?? [])],
      };
      if (stopped || flight !== revision || owner.current !== user || lease !== mutation.current)
        return;
      for (const r of result.data)
        if (validRow(r, user))
          versions.current.set(
            `${user}:${r.record_key}`,
            Math.max(versions.current.get(`${user}:${r.record_key}`) ?? 0, r.revision),
          );
      let records = (result.error ? cached : (result.data ?? [])).filter((r: unknown) =>
        validRow(r, user),
      ) as GymRecord[];
      const queued = readPendingTrainingWrites(user).filter(
        (w) => w.kind === "gym_record" && !["failed", "conflict"].includes(w.status ?? ""),
      );
      for (const q of queued)
        if (q.kind === "gym_record" && validGymRecordData(q.payload.payload))
          records = overlay(records, {
            user_id: user,
            record_key: q.payload.record_key,
            payload: q.payload.payload as unknown as GymRecordData,
            revision: q.expectedVersion ?? 0,
            updated_at: new Date(q.queuedAt).toISOString(),
            last_operation_id: q.operationId ?? "",
            pending: true,
          });
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      const available = !result.error || (offline && cacheAvailable);
      if (!result.error) {
        cached = records.filter((r) => !r.pending);
        try {
          localStorage.setItem(key, JSON.stringify({ version: 1, records: cached }));
        } catch {
          /* Server remains authoritative. */
        }
      }
      setState({
        owner: user,
        records,
        available,
        loading: false,
        error:
          result.error && !offline
            ? "Dodatkowe zapisy treningu są chwilowo niedostępne. Możesz nadal wpisywać serie ręcznie."
            : null,
      });
    }
    const refresh = () =>
      void load().catch(() => {
        if (!stopped)
          setState((s) => ({
            ...s,
            loading: false,
            error: "Nie udało się odczytać dodatkowych zapisów treningu.",
          }));
      });
    const cleared = (event: Event) => {
      if ((event as CustomEvent<{ userId: string }>).detail?.userId !== user) return;
      stopped = true;
      revision++;
      purged.current.add(user);
      owner.current = undefined;
      writing.current.clear();
      versions.current.clear();
      setState({ owner: user, records: [], available: false, loading: false, error: null });
    };
    refresh();
    window.addEventListener("ballwise:clear-user-data", cleared);
    window.addEventListener("ballwise:training-synced", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      stopped = true;
      mounted.current = false;
      window.removeEventListener("ballwise:training-synced", refresh);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("ballwise:clear-user-data", cleared);
    };
  }, [ownerId, ready]);
  async function save(data: GymRecordData): Promise<GymRecord> {
    const user = ownerId;
    if (
      !user ||
      !ready ||
      !mounted.current ||
      purged.current.has(user) ||
      !live.current.available ||
      live.current.owner !== user
    )
      throw new Error("Poczekaj na wczytanie zapisów treningu.");
    if (!validGymRecordData(data)) throw new Error("Sprawdź wpisane wartości.");
    const key = gymRecordKey(data);
    if (writing.current.has(key)) throw new Error("Trwa zapisywanie tego wpisu.");
    writing.current.add(key);
    mutation.current++;
    try {
      const previous = live.current.records.find((r) => r.record_key === key);
      const expectedVersion = Math.max(
          previous?.revision ?? 0,
          versions.current.get(`${user}:${key}`) ?? 0,
        ),
        operationId = crypto.randomUUID();
      const payload = { user_id: user, record_key: key, payload: data as unknown as Json };
      const result = await withDurableTrainingWrite<{ error: unknown; data?: unknown }>(
        user,
        {
          kind: "gym_record",
          dedupeKey: `gym:${key}`,
          payload,
          expectedVersion,
          operationId,
        },
        async (entry) => {
          if (
            (data.kind === "response" || data.kind === "observation") &&
            readPendingTrainingWrites(user).some(
              (w) =>
                w.kind === "session_log" &&
                w.payload.session_id === data.sessionId &&
                !["failed", "conflict"].includes(w.status ?? ""),
            )
          )
            return Promise.resolve({
              data: null,
              error: { status: 425, message: "Waiting for session sync" },
            });
          const result = await supabase.rpc("save_gym_record", {
            p_operation_id: operationId,
            p_expected_version: expectedVersion,
            p_payload: {
              ...payload,
              _predecessor_operation_ids: entry.predecessors ?? [],
            } as unknown as Json,
          });
          if (!result.error && !validRow(result.data, user))
            return {
              data: null,
              error: { code: "P0002", message: "Serwer nie potwierdził zapisu treningu." },
            };
          return result;
        },
      );
      if (result.error && !isRetryableWriteError(result.error))
        throw new Error("Nie zapisano zmiany. Odśwież dane; zachowano kopię wpisu.");
      let row: GymRecord = {
        user_id: user,
        record_key: key,
        payload: data,
        revision: expectedVersion,
        updated_at: new Date().toISOString(),
        last_operation_id: operationId,
        pending: true,
      };
      if (!result.error && validRow(result.data, user)) row = { ...result.data, pending: false };
      if (!row.pending) versions.current.set(`${user}:${key}`, row.revision);
      mutation.current++;
      if (mounted.current && owner.current === user && !purged.current.has(user))
        setState((s) => {
          const records = overlay(s.records, row);
          try {
            localStorage.setItem(
              `ballwise:gym-evidence:v1:${user}`,
              JSON.stringify({ version: 1, records: records.filter((r) => !r.pending) }),
            );
          } catch {
            /* Durable queue still preserves pending writes. */
          }
          return { ...s, records };
        });
      return row;
    } finally {
      writing.current.delete(key);
    }
  }
  return (
    <Context.Provider
      value={{
        ...state,
        available: ready && state.owner === ownerId && state.available,
        records: state.owner === ownerId ? state.records : [],
        save,
      }}
    >
      {children}
    </Context.Provider>
  );
}
