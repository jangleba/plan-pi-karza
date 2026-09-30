import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useBlocker } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ResponsiveDialog } from "@/components/ui/app-ui";

export type ActivityExitOptions = {
  dirty: boolean;
  busy?: boolean;
  description?: string;
  pause?: () => void;
  resume?: () => void;
  dispose?: () => void;
};
type Registration = { get: () => ActivityExitOptions };
type PendingExit = { action: () => void; cancel?: () => void; entries: Registration[] };
type ExitContextValue = {
  register: (id: string, entry: Registration) => () => void;
  changed: () => void;
  requestExit: (action: () => void, id?: string) => void;
};
const ExitContext = createContext<ExitContextValue | null>(null);

/** Coordinates route links, browser history and local task dismissal once. */
export function ActivityExitProvider({ children }: { children: ReactNode }) {
  const registry = useRef(new Map<string, Registration>());
  const bypass = useRef(new Set<Registration>());
  const [revision, setRevision] = useState(0);
  const [pending, setPending] = useState<PendingExit | null>(null);
  const pendingRef = useRef<PendingExit | null>(null);
  const changed = useCallback(() => setRevision((value) => value + 1), []);
  const activeEntries = useCallback(
    (id?: string) =>
      [...registry.current.entries()]
        .filter(([key]) => !id || key === id)
        .map(([, entry]) => entry)
        .filter((entry) => {
          const options = entry.get();
          return options.dirty || options.busy;
        }),
    [],
  );
  const register = useCallback(
    (id: string, entry: Registration) => {
      registry.current.set(id, entry);
      changed();
      return () => {
        registry.current.delete(id);
        changed();
      };
    },
    [changed],
  );
  const shouldBlockFn = useCallback(() => {
    return activeEntries().some((entry) => !bypass.current.has(entry));
  }, [activeEntries]);
  const enableBeforeUnload = useCallback(() => activeEntries().length > 0, [activeEntries]);
  const blocker = useBlocker({ shouldBlockFn, enableBeforeUnload, withResolver: true });

  const beginExit = useCallback(
    (action: () => void, cancel?: () => void, id?: string) => {
      if (pendingRef.current) {
        cancel?.();
        return;
      }
      const entries = activeEntries(id);
      if (!entries.length) {
        action();
        return;
      }
      entries.forEach((entry) => entry.get().pause?.());
      const next = { action, cancel, entries };
      pendingRef.current = next;
      setPending(next);
    },
    [activeEntries],
  );
  const requestExit = useCallback(
    (action: () => void, id?: string) =>
      beginExit(
        () => {
          // The same action may trigger the router blocker; confirmation is already done.
          bypass.current = new Set(activeEntries(id));
          action();
          window.setTimeout(() => {
            bypass.current.clear();
          }, 0);
        },
        undefined,
        id,
      ),
    [beginExit, activeEntries],
  );
  useEffect(() => {
    if (blocker.status === "blocked" && !pendingRef.current) {
      beginExit(blocker.proceed, blocker.reset);
    }
  }, [blocker, beginExit]);

  const stay = useCallback(() => {
    const current = pendingRef.current;
    if (!current) return;
    pendingRef.current = null;
    setPending(null);
    current.cancel?.();
    current.entries.forEach((entry) => entry.get().resume?.());
  }, []);
  const leave = useCallback(() => {
    const current = pendingRef.current;
    if (!current || current.entries.some((entry) => entry.get().busy)) return;
    current.entries.forEach((entry) => entry.get().dispose?.());
    pendingRef.current = null;
    setPending(null);
    current.action();
  }, []);
  // A successful save can finish while the user waits to navigate away.
  useEffect(() => {
    if (pending && !pending.entries.some((entry) => entry.get().dirty || entry.get().busy)) leave();
  }, [pending, revision, leave]);
  const context = useMemo(
    () => ({ register, changed, requestExit }),
    [register, changed, requestExit],
  );
  const busy = pending?.entries.some((entry) => entry.get().busy) ?? false;
  const descriptions = [
    ...new Set(
      pending?.entries
        .filter((entry) => entry.get().dirty)
        .map((entry) => entry.get().description)
        .filter(Boolean),
    ),
  ];
  return (
    <ExitContext.Provider value={context}>
      {children}
      <ResponsiveDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) stay();
        }}
        title={busy ? "Trwa zapisywanie" : "Przejść bez zapisu?"}
        dismissible={!busy}
        description={
          busy
            ? "Poczekaj na zakończenie zapisu."
            : descriptions.length
              ? descriptions.join(" ")
              : "Niezapisane zmiany zostaną odrzucone."
        }
        footer={
          <>
            <Button autoFocus variant="outline" onClick={stay}>
              Zostań
            </Button>
            <Button disabled={busy} onClick={leave}>
              Odrzuć i przejdź
            </Button>
          </>
        }
      ></ResponsiveDialog>
    </ExitContext.Provider>
  );
}

/** Also works in isolated component tests without a provider. */
export function useActivityExitGuard(options: ActivityExitOptions) {
  const context = useContext(ExitContext);
  const id = useId();
  const latest = useRef(options);
  latest.current = options;
  useEffect(() => context?.register(id, { get: () => latest.current }), [context, id]);
  useEffect(() => {
    context?.changed();
  }, [context, options.dirty, options.busy]);
  const requestExit = useCallback(
    (action: () => void, scope: "local" | "route" = "local") => {
      if (context) context.requestExit(action, scope === "local" ? id : undefined);
      else action();
    },
    [context, id],
  );
  return { requestExit };
}
