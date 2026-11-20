import { useMemo } from "react";
import { addDays, daySkipText, daySkipInfo, localISO, skipLabel } from "./engine";
import type { Profile } from "./engine";
import { loadSkipped, setSkipped, useSkippedVersion } from "./lib/skipped";

/**
 * Check-in: „Nie mogę zrobić dzisiejszych treningów” (przy dwóch treningach w dniu) albo „…dzisiejszego treningu” (przy jednym).
 * Plan przelicza się od razu: silnik przekłada trening indywidualny na kolejny dozwolony dzień, a zawodnik widzi, dokąd trafił.
 * Treningu klubowego nie przekładamy (prowadzi go trener). Przycisk pojawia się tylko, gdy dziś jest jakiś trening.
 */
export function DaySkipToggle({ profile }: { profile: Profile }) {
  const v = useSkippedVersion();
  const date = localISO();
  const info = useMemo(() => daySkipInfo(profile, date, loadSkipped()), [profile, date, v]);
  if (!info.show) return null;
  const text = daySkipText(info);
  return (
    <div>
      <button type="button" aria-pressed={info.skipped} onClick={() => setSkipped(date, !info.skipped, date)}
        className={`w-full rounded-2xl py-3.5 text-sm font-medium ${info.skipped ? "bw-sel" : "bg-canvas text-ink"}`}>
        {skipLabel(info.count)}
      </button>
      {text && <p className="mt-2 text-center text-xs text-muted" role="status">{text}</p>}
    </div>
  );
}

/** Plan: lista zgłoszeń „nie mogę” z tego tygodnia – gdzie trafił trening i przycisk cofnięcia. */
export function SkippedDays({ profile, weekStart }: { profile: Profile; weekStart: string }) {
  const v = useSkippedVersion();
  const rows = useMemo(() => {
    const all = loadSkipped();
    const end = addDays(weekStart, 7);
    return all.filter((b) => b.date >= weekStart && b.date < end).map((b) => {
      const info = daySkipInfo(profile, b.date, all);
      return { b, text: daySkipText(info), plural: info.count >= 2 };
    });
  }, [profile, weekStart, v]);
  if (!rows.length) return null;
  return (
    <section className="mt-4 rounded-2xl border border-hairline bg-card p-3" aria-label="Dni bez treningu">
      {rows.map(({ b, text, plural }) => (
        <div key={b.date} className="flex items-start justify-between gap-3 py-1.5">
          <p className="text-sm text-muted"><span className="font-medium text-ink">{plural ? "Bez treningów" : "Bez treningu"} {dayPhrase(b.date)}.</span> {text}</p>
          <button onClick={() => setSkipped(b.date, false, localISO())} className="shrink-0 rounded-xl px-2.5 py-1 text-sm text-accent active:scale-95">Cofnij</button>
        </div>
      ))}
    </section>
  );
}

const DAY = ["w poniedziałek", "we wtorek", "w środę", "w czwartek", "w piątek", "w sobotę", "w niedzielę"];
/** „w środę”, „we wtorek”: dzień z przyimkiem. */
const dayPhrase = (iso: string): string => DAY[(new Date(Date.parse(iso)).getUTCDay() + 6) % 7]!;
