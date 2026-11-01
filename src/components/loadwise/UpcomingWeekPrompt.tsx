import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/loadwise/auth";
import { useLoadwise } from "@/lib/loadwise/store";
import { selectPlanWeeks } from "@/lib/loadwise/effectivePlanSelector";
import { transitionMatchesBlock } from "@/lib/loadwise/confirmedCalendar";
import { weeklyPromptTarget, weekdayFromIso } from "@/lib/loadwise/weeklyNavigation";
import { profileMatchDates } from "@/lib/loadwise/matchSchedule";
import { formatDate } from "@/lib/loadwise/labels";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { WeeklyGateSheet } from "./WeeklyGateSheet";

const shown = new Set<string>();
export function UpcomingWeekPrompt({
  onConfirmed,
}: {
  onConfirmed: (weekStart: string, index: number) => void;
}) {
  const { state, todayIso } = useLoadwise();
  const { user } = useAuth();
  const weeks = useMemo(
    () => selectPlanWeeks(state.plan, state.profile),
    [state.plan, state.profile],
  );
  const confirmed = (index: number) =>
    transitionMatchesBlock(state.plan, state.transitions[index], index) &&
    Boolean(state.transitions[index]?.nextMatchDate || state.transitions[index]?.noMatchNextWeek);
  const target = state.plan.some((day) => day.date === todayIso)
    ? weeklyPromptTarget(weeks, todayIso, confirmed, weekdayFromIso(todayIso) === 1 && state.profile?.weeklyMatches === true && profileMatchDates(state.profile).every(date => date < todayIso))
    : null;
  const [prompt, setPrompt] = useState<ReturnType<typeof weeklyPromptTarget>>(null);
  const [gate, setGate] = useState(false);
  const owner = user?.id;
  const cycle = state.plan[0]?.cycleId ?? state.plan[0]?.date;
  const key = owner && target && cycle ? `${owner}:${cycle}:${todayIso}:${target.startDate}` : null;
  const processedKey = useRef<string | null>(null);
  useEffect(() => {
    if (processedKey.current === key) return;
    processedKey.current = key;
    setPrompt(null);
    setGate(false);
    if (!key || !owner || !target || shown.has(key)) return;
    const storageKey = `ballwise:weekly-prompt:v1:${owner}`;
    try {
      if (localStorage.getItem(storageKey) === key) return;
      localStorage.setItem(storageKey, key);
    } catch {
      /* In-memory guard still prevents repeated prompts. */
    }
    shown.add(key);
    setPrompt(target);
  }, [key, owner, target]);
  if (!prompt) return null;
  const done = confirmed(prompt.index);
  return (
    <>
      <Dialog
        open={!gate}
        onOpenChange={(open) => {
          if (!open) setPrompt(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{prompt.isNext ? "Kolejny tydzień" : "Potwierdź ten tydzień"}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {formatDate(prompt.startDate)}–{formatDate(prompt.endDate)}.{" "}
            {done
              ? "Plan jest gotowy do otwarcia."
              : "Potwierdź mecz albo tydzień bez meczu. Dopasujemy treningi."}
          </p>
          <Button
            onClick={() => {
              if (done) {
                onConfirmed(prompt.startDate, prompt.index);
                setPrompt(null);
              } else setGate(true);
            }}
          >
            {done ? "Otwórz tydzień" : "Przygotuj tydzień"}
          </Button>
          <Button variant="ghost" onClick={() => setPrompt(null)}>
            Później
          </Button>
        </DialogContent>
      </Dialog>
      {gate && (
        <WeeklyGateSheet
          open
          onOpenChange={(open) => {
            if (!open) {
              setGate(false);
              setPrompt(null);
            }
          }}
          weekNumber={prompt.index}
          nextWeekStart={prompt.index === 0 && state.plan[0].date > prompt.startDate ? state.plan[0].date : prompt.startDate}
          nextWeekEnd={prompt.endDate}
          allowNoMatch
          onConfirmed={() => {
            onConfirmed(prompt.startDate, prompt.index);
            setGate(false);
            setPrompt(null);
          }}
        />
      )}
    </>
  );
}
