import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Snapshot<T> = { key: string; value: T | undefined; available: boolean };
const EVENT = "ballwise-training-detail-change";

function read<T>(key: string, parse: (value: unknown) => T | undefined): Snapshot<T> {
  if (typeof window === "undefined") return { key, value: undefined, available: false };
  try {
    const raw = window.localStorage.getItem(key);
    return { key, value: raw === null ? undefined : parse(JSON.parse(raw)), available: true };
  } catch {
    // Corrupt entries and blocked storage must not prevent training.
    return { key, value: undefined, available: false };
  }
}

/** Local UI drafts and notes; authoritative workout results keep their existing save path. */
export function useTrainingLocalState<T>(
  key: string,
  fallback: T,
  parse: (value: unknown) => T | undefined,
) {
  const initial = useMemo(() => read(key, parse), [key, parse]);
  const [snapshot, setSnapshot] = useState(initial);
  const selected = snapshot.key === key ? snapshot : initial;
  const live = useRef(selected);
  live.current = selected;

  useEffect(() => {
    function refresh(event: Event) {
      const changedKey =
        event instanceof StorageEvent ? event.key : (event as CustomEvent<string>).detail;
      if (changedKey === key || changedKey === null) setSnapshot(read(key, parse));
    }
    window.addEventListener("storage", refresh);
    window.addEventListener(EVENT, refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener(EVENT, refresh);
    };
  }, [key, parse]);

  const setValue = useCallback(
    (update: T | ((value: T) => T)) => {
      const current = live.current.key === key ? live.current : read(key, parse);
      const value =
        typeof update === "function"
          ? (update as (value: T) => T)(current.value ?? fallback)
          : update;
      let available = false;
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
        available = true;
      } catch {
        /* Keep the user's change in memory and expose the persistence failure. */
      }
      const next = { key, value, available };
      live.current = next;
      setSnapshot(next);
      if (available) window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
    },
    [fallback, key, parse],
  );

  const clear = useCallback(() => {
    let available = false;
    try {
      window.localStorage.removeItem(key);
      available = true;
    } catch {
      /* The caller still keeps its successful server save. */
    }
    const next = { key, value: undefined, available };
    live.current = next;
    setSnapshot(next);
    if (available) window.dispatchEvent(new CustomEvent(EVENT, { detail: key }));
  }, [key]);

  return { value: selected.value ?? fallback, setValue, clear, available: selected.available };
}
