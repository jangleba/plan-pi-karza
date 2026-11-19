import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchFeed, type FeedResult } from "./api";
import { evaluateListing, type Evaluation, type PlayerFacts } from "./lib";

export type RadarFeed = { state: "loading" } | FeedResult;

/**
 * Pobiera GOTOWE wyniki z serwera (bez wyszukiwarki i AI) i dopasowuje je lokalnie do zawodnika – data urodzenia nie
 * opuszcza urządzenia. Zmiana profilu/kryteriów przelicza dopasowania na bieżąco (nic nie jest utrwalane, więc stare
 * dopasowania nie mogą przetrwać zmiany profilu).
 */
export function useRadar(facts: PlayerFacts) {
  const [feed, setFeed] = useState<RadarFeed>({ state: "loading" });
  const load = useCallback(async () => {
    setFeed({ state: "loading" });
    setFeed(await fetchFeed());
  }, []);
  useEffect(() => { void load(); }, [load]);

  const evals: Evaluation[] = useMemo(() => {
    if (feed.state !== "ok") return [];
    const now = Date.now() + feed.offsetMs;
    return feed.listings.map((l) => evaluateListing(l, facts, now));
  }, [feed, facts]);
  const nowMs = feed.state === "ok" ? Date.now() + feed.offsetMs : Date.now();
  return { feed, evals, nowMs, reload: load };
}
