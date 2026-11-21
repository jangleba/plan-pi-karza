import { useEffect, useState } from "react";
import { MATCH_WEEKS_EVENT, loadMatchWeeks, type MatchWeeks } from "../engine";

/** Terminy meczów na tygodnie; odświeża się po każdym zapisie (z dowolnego ekranu). */
export function useMatchWeeks(): MatchWeeks {
  const [weeks, setWeeks] = useState<MatchWeeks>(loadMatchWeeks);
  useEffect(() => {
    const on = () => setWeeks(loadMatchWeeks());
    window.addEventListener(MATCH_WEEKS_EVENT, on);
    return () => window.removeEventListener(MATCH_WEEKS_EVENT, on);
  }, []);
  return weeks;
}
