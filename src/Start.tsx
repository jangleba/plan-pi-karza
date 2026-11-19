import { useEffect, useState } from "react";
import { FEEL_NOW, feelDue, loadFeelings, localISO, readinessScore, saveFeeling, strainOf } from "./engine";
import type { CheckIn, FeelNow, Profile } from "./engine";
import { Sheet } from "./Sheet";
import { MatchInMind } from "./MatchInMind";
import { Bench } from "./Bench";
import { Group, ListRow } from "./ui";

const LEVELS: Array<[1 | 2 | 3, string]> = [[1, "Słabo"], [2, "Średnio"], [3, "Dobrze"]];
const STRAIN = { none: "Pełna sesja", light: "Trochę lżej", heavy: "Wyraźnie lżej" } as const;

/** Pierścień gotowości; dotknięcie otwiera check-in. */
/** Liczba „doliczająca się” do celu (easeOutCubic). */
function useCountUp(to: number, run: boolean, ms = 800): number {
  const [v, setV] = useState(run ? 0 : to);
  useEffect(() => {
    if (!run) { setV(to); return; }
    let raf = 0;
    const from = 0, t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      setV(Math.round(from + (to - from) * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, run, ms]);
  return v;
}

function Ring({ value, done, onTap }: { value: number; done: boolean; onTap: () => void }) {
  const r = 70, c = 2 * Math.PI * r;
  const shown = useCountUp(value, done);
  return (
    <button onClick={onTap} className="relative mx-auto block h-40 w-40" aria-label="Check-in">
      <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
        <circle cx="80" cy="80" r={r} fill="none" stroke="var(--color-hairline)" strokeWidth="10" />
        <circle cx="80" cy="80" r={r} fill="none" stroke="var(--color-accent)" strokeWidth="10" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={done ? c * (1 - value / 100) : c} style={{ transition: "stroke-dashoffset 0.8s ease" }} />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[44px] font-semibold tabular-nums tracking-tight">{done ? shown : "?"}</span>
        <span className="mt-1 text-xs text-muted">{done ? "gotowość" : "dotknij"}</span>
      </span>
    </button>
  );
}

function Choice({ label, value, onChange }: { label: string; value: 1 | 2 | 3; onChange: (v: 1 | 2 | 3) => void }) {
  return (
    <div className="mb-5">
      <div className="mb-2 text-sm text-muted">{label}</div>
      <div className="grid grid-cols-3 gap-2">
        {LEVELS.map(([v, t]) => (
          <button key={v} onClick={() => onChange(v)}
            className={`rounded-2xl py-3.5 text-sm font-medium ${value === v ? "bw-sel" : "bg-canvas text-ink"}`}>{t}</button>
        ))}
      </div>
    </div>
  );
}

export function Start({ profile, checkIn, checkedIn, onCheckIn }: {
  profile: Profile; checkIn: CheckIn; checkedIn: boolean; onCheckIn: (c: CheckIn) => void;
}) {
  const [sheet, setSheet] = useState<"checkin" | "mind" | "bench" | "feel" | null>(null);
  const [feel, setFeel] = useState<FeelNow[]>([]);
  const [feelTick, setFeelTick] = useState(0);
  void feelTick;
  const feelings = loadFeelings();
  const today = localISO();

  return (
    <main className="mx-auto max-w-md px-5 pb-32 pt-14">
      <p className="text-sm text-muted">{new Date().toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" })}</p>
      <h1 className="mb-6 text-[32px] font-semibold tracking-tight">{profile.name ? `Cześć, ${profile.name}` : "Dziś"}</h1>

      <section className="bw-rise mb-6 rounded-3xl border border-hairline bg-card px-5 py-5">
        <Ring value={readinessScore(checkIn)} done={checkedIn} onTap={() => setSheet("checkin")} />
        <p className="mt-3 text-center text-sm text-muted">{checkedIn ? STRAIN[strainOf(checkIn)] : "Jak się czujesz? Dotknij, by odpowiedzieć"}</p>
      </section>

      <Group>
        <ListRow index={1} title="Mecz w głowie" detail="3 min" onTap={() => setSheet("mind")} />
        <ListRow index={2} title="Tryb ławki" sub="Obserwuj, rozgrzej się, wejdź" onTap={() => setSheet("bench")} />
        {feelDue(feelings.at(-1), today) && <ListRow index={3} title="Jak czujesz się na boisku?" detail="co 5 tyg." onTap={() => { setFeel([]); setSheet("feel"); }} />}
      </Group>

      {sheet === "checkin" && (
        <Sheet title="Jak się czujesz?" onClose={() => setSheet(null)}>
          <Choice label="Sen" value={checkIn.sleep} onChange={(v) => onCheckIn({ ...checkIn, sleep: v })} />
          <Choice label="Samopoczucie" value={checkIn.feeling} onChange={(v) => onCheckIn({ ...checkIn, feeling: v })} />
          <button onClick={() => onCheckIn({ ...checkIn, less: !checkIn.less })}
            className={`mb-6 w-full rounded-2xl py-3.5 text-sm font-medium ${checkIn.less ? "bw-sel" : "bg-canvas text-ink"}`}>
            Dziś mniej
          </button>
          <button onClick={() => { onCheckIn(checkIn); setSheet(null); }} className="w-full bw-grad rounded-2xl py-4 text-base font-medium">Gotowe</button>
        </Sheet>
      )}
      {sheet === "bench" && <Bench position={profile.position} onClose={() => setSheet(null)} />}
      {sheet === "mind" && <MatchInMind position={profile.position} onClose={() => setSheet(null)} />}
      {sheet === "feel" && (
        <Sheet title="Jak czujesz się na boisku?" onClose={() => setSheet(null)}>
          <div className="mb-6 flex flex-col gap-2">
            {FEEL_NOW.map(([v, t]) => {
              const on = feel.includes(v);
              return (
                <button key={`${v}-${on}`} onClick={() => setFeel(on ? feel.filter((x) => x !== v) : [...feel, v])}
                  className={`flex items-center justify-between rounded-2xl px-4 py-3.5 text-left ${on ? "bw-pop bw-sel font-semibold" : "border border-hairline bg-card"}`}>
                  {t}<span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${on ? "bw-grad" : "border border-hairline"}`}>{on ? "✓" : ""}</span>
                </button>
              );
            })}
          </div>
          <button onClick={() => { saveFeeling({ date: today, now: feel }); setFeelTick((x) => x + 1); setSheet(null); }}
            className="bw-grad w-full rounded-2xl py-4 text-base font-medium">{feel.length ? "Zapisz" : "Wszystko gra – zapisz"}</button>
        </Sheet>
      )}
    </main>
  );
}
