import { clubProcessStep, clubRefreshStep, clubSearchStep } from "./clubpipeline.ts";
import { monitorSource, processQueue, refreshStep, searchStep, type Deps, type SourceRow, type Stats } from "./pipeline.ts";

export interface JobResult { run: string | null; status: "ok" | "partial" | "failed" | "skipped"; stats: Stats; error?: string }

async function withJob(deps: Deps, job: "discover" | "refresh", body: (stats: Stats) => Promise<void>): Promise<JobResult> {
  const s = (await deps.rpc("radar_settings_get")) as { job_lock_ttl_seconds: number };
  const run = (await deps.rpc("radar_try_lock", { p_job: job, p_ttl_seconds: s.job_lock_ttl_seconds })) as string | null;
  if (!run) return { run: null, status: "skipped", stats: { locked: 1 } };
  const stats: Stats = {};
  try {
    await body(stats);
    const errors = Object.entries(stats).filter(([k]) => /errors$|_http_error$|_network$/.test(k)).reduce((a, [, v]) => a + v, 0);
    const status = errors > 0 ? "partial" : "ok";
    await deps.rpc("radar_finish_job", { p_run: run, p_status: status, p_stats: stats, p_error: null });
    return { run, status, stats };
  } catch (e) {
    const error = e instanceof Error ? e.message.slice(0, 500) : "nieznany błąd";
    await deps.rpc("radar_finish_job", { p_run: run, p_status: "failed", p_stats: stats, p_error: error });
    await deps.alert?.(`Radar: zadanie ${job} zakończone błędem: ${error}`);
    return { run, status: "failed", stats, error };
  }
}

/** discover (co 12 h): nowe ogłoszenia z zatwierdzonych źródeł + wyszukiwanie + przetworzenie kolejki małą partią. */
export function runDiscover(deps: Deps): Promise<JobResult> {
  return withJob(deps, "discover", async (stats) => {
    const s = (await deps.rpc("radar_settings_get")) as { max_new_urls_per_run: number };
    const due = (await deps.rpc("radar_due_sources", { p_limit: 20 })) as SourceRow[];
    for (const source of due) {
      if (deps.nowMs() > deps.deadlineMs) { stats.sources_deferred = (stats.sources_deferred ?? 0) + 1; continue; }
      try { await monitorSource(deps, source, stats); stats.sources_checked = (stats.sources_checked ?? 0) + 1; }
      catch { stats.source_errors = (stats.source_errors ?? 0) + 1; await deps.rpc("radar_mark_source_checked", { p_id: source.id, p_ok: false, p_error: "wyjątek przy monitorowaniu" }); }
    }
    await searchStep(deps, stats);
    await processQueue(deps, stats, s.max_new_urls_per_run);
    await clubSearchStep(deps, stats); // research klubów: kandydaci z wyszukiwarki
    await clubProcessStep(deps, stats); // strona klubu → adresy organizacyjne z dowodem (do akceptacji)
    const failing = (await deps.rpc("radar_health")) as { failingSources?: number };
    if ((failing.failingSources ?? 0) > 0) await deps.alert?.(`Radar: źródła z kolejnymi błędami: ${failing.failingSources}`);
  });
}

/** refresh (co 6 h): ponowne sprawdzenie aktywnych ofert + dokończenie kolejki. */
export function runRefresh(deps: Deps): Promise<JobResult> {
  return withJob(deps, "refresh", async (stats) => {
    await refreshStep(deps, stats);
    const s = (await deps.rpc("radar_settings_get")) as { max_new_urls_per_run: number };
    await processQueue(deps, stats, Math.max(5, Math.floor(s.max_new_urls_per_run / 2)));
    await clubRefreshStep(deps, stats); // ponowne potwierdzanie adresów zaakceptowanych klubów
  });
}
