import { useEffect, useState, useSyncExternalStore } from "react";
import * as rec from "./recorder";

/** Pasek „bieg trwa” – widoczny, gdy ekran biegu jest schowany, ale rejestrator pracuje (albo czeka niedokończony zapis). */
export function useActiveRun() {
  const snap = useSyncExternalStore(rec.subscribe, rec.getSnapshot);
  const live = snap.status === "running" || snap.status === "paused" || snap.status === "done";
  const saved = snap.status === "idle" && rec.hasSavedRun();
  return { snap, live, saved, active: live || saved };
}

export function ActiveRunBanner({ onOpen }: { onOpen: () => void }) {
  const { snap, live, saved, active } = useActiveRun();
  const [, setTick] = useState(0);
  useEffect(() => { if (!active) return; const id = setInterval(() => setTick((n) => n + 1), 1000); return () => clearInterval(id); }, [active]);
  if (!active) return null;
  const ms = live ? rec.elapsedMs(snap) : 0;
  const mm = `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
  const text = saved ? "Niedokończony bieg – można go odzyskać" : snap.status === "done" ? "Bieg zakończony – zapisz albo odrzuć" : snap.status === "paused" ? `Bieg wstrzymany · ${mm}` : `Bieg trwa · ${mm}`;
  return (
    <button onClick={onOpen} className="mt-3 flex w-full items-center justify-between gap-3 rounded-2xl bg-accent-soft px-4 py-3.5 text-left text-[15px] font-medium text-accent active:scale-[0.99]">
      <span>{text}</span><span aria-hidden="true" className="shrink-0 whitespace-nowrap">Wróć ›</span>
    </button>
  );
}
