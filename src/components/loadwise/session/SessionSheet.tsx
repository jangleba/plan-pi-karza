import { lazy, Suspense, useCallback, useRef } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import type { SessionTarget } from "./SessionDetailView";
import { SessionSkeleton } from "./SessionChrome";
import "./session-sheet.css";

const loadView = () => import("./SessionDetailView");
const SessionDetailView = lazy(() => loadView().then((m) => ({ default: m.SessionDetailView })));

/** Warms the session panel code before the athlete taps a training. */
export function prepareSessionSheet() {
  void loadView().catch(() => undefined);
}

import type { SessionSheetSearch } from "./sessionSheetSearch";
export { parseSessionSheetSearch, type SessionSheetSearch } from "./sessionSheetSearch";

type Search = Record<string, unknown>;
const withTarget = (prev: Search, target: SessionTarget | null): Search => ({
  ...prev,
  sesja: target?.date,
  slot: target?.slot,
  mod: target?.mod,
});

/**
 * Opens, switches and closes the training panel through the URL. Opening adds
 * one history entry, so the phone's back gesture closes the panel; closing a
 * panel opened from a link replaces the entry instead of leaving the app.
 */
export function useSessionSheet(search: SessionSheetSearch) {
  const navigate = useNavigate();
  const router = useRouter();
  const pushed = useRef(false);
  const target: SessionTarget | null = search.sesja
    ? { date: search.sesja, slot: search.slot ?? 1, mod: search.mod }
    : null;
  const go = useCallback(
    (next: SessionTarget | null, replace: boolean) =>
      void navigate({
        to: ".",
        search: ((prev: Search) => withTarget(prev, next)) as never,
        replace,
        resetScroll: false,
      }),
    [navigate],
  );
  const open = useCallback(
    (next: SessionTarget) => {
      pushed.current = true;
      go(next, false);
    },
    [go],
  );
  const close = useCallback(() => {
    if (pushed.current && router.history.canGoBack()) {
      pushed.current = false;
      router.history.back();
    } else go(null, true);
  }, [go, router]);
  const select = useCallback((next: SessionTarget) => go(next, true), [go]);
  return { target, open, close, select };
}

/**
 * The large bottom panel with one training. Every piece of progress (marks,
 * saved sets, skips, the open exercise and the rest clock) lives in storage
 * keyed by the session, so closing and reopening resumes exactly where the
 * athlete left; the rest clock counts down to its end time meanwhile.
 */
export function SessionSheet({
  target,
  onClose,
  onSelect,
}: {
  target: SessionTarget | null;
  onClose: () => void;
  onSelect: (target: SessionTarget) => void;
}) {
  // Keep the last training on screen while the panel slides away.
  const last = useRef<SessionTarget | null>(target);
  if (target) last.current = target;
  const shown = target ?? last.current;
  return (
    <Sheet
      open={Boolean(target)}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      initialDetent="large"
    >
      <SheetContent className="bw-unit-sheet" aria-describedby={undefined}>
        <SheetTitle className="sr-only">Jednostka treningowa</SheetTitle>
        {shown && (
          <Suspense
            fallback={
              <div className="space-y-3 px-5 pt-2" role="status" aria-label="Wczytywanie">
                <SessionSkeleton />
              </div>
            }
          >
            <SessionDetailView
              key={`${shown.date}:${shown.slot}:${shown.mod ?? ""}`}
              date={shown.date}
              slot={shown.slot}
              mod={shown.mod}
              variant="sheet"
              onBack={onClose}
              onSelect={onSelect}
            />
          </Suspense>
        )}
      </SheetContent>
    </Sheet>
  );
}
