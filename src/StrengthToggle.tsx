import { useMemo } from "react";
import { addDays, localISO, strengthDayInfo, strengthMoveText } from "./engine";
import type { Profile } from "./engine";
import { loadBlocked, setBlocked, useBlockedVersion } from "./lib/blocked";

/**
 * Check-in: „Dziś nie zrobię siły”. Plan przelicza się od razu (silnik przekłada siłę na kolejny dozwolony dzień), a zawodnik widzi,
 * dokąd trafiła. Przełącznik pojawia się tylko wtedy, gdy dziś jest siła w planie (albo zgłoszenie już istnieje i można je cofnąć).
 */
export function StrengthToggle({ profile }: { profile: Profile }) {
  const v = useBlockedVersion();
  const date = localISO();
  const info = useMemo(() => strengthDayInfo(profile, date, loadBlocked()), [profile, date, v]);
  if (!info.show) return null;
  const text = strengthMoveText(info);
  return (
    <div>
      <button type="button" aria-pressed={info.blocked} onClick={() => setBlocked(date, !info.blocked, date)}
        className={`w-full rounded-2xl py-3.5 text-sm font-medium ${info.blocked ? "bw-sel" : "bg-canvas text-ink"}`}>
        Dziś nie zrobię siły
      </button>
      <p className="mt-2 text-center text-xs text-muted" role="status">
        {text ?? "Przełożymy trening siłowy na inny dzień tygodnia."}
      </p>
    </div>
  );
}

/** Plan: lista zgłoszeń „bez siły” z tego tygodnia – gdzie trafiła siła i przycisk cofnięcia. */
export function MovedStrength({ profile, weekStart }: { profile: Profile; weekStart: string }) {
  const v = useBlockedVersion();
  const rows = useMemo(() => {
    const all = loadBlocked();
    const end = addDays(weekStart, 7);
    return all.filter((b) => b.date >= weekStart && b.date < end).map((b) => ({ b, text: strengthMoveText(strengthDayInfo(profile, b.date, all)) }));
  }, [profile, weekStart, v]);
  if (!rows.length) return null;
  return (
    <section className="mt-4 rounded-2xl border border-hairline bg-card p-3" aria-label="Przełożona siła">
      {rows.map(({ b, text }) => (
        <div key={b.date} className="flex items-start justify-between gap-3 py-1.5">
          <p className="text-sm text-muted"><span className="font-medium text-ink">Bez siły {weekdayLoc(b.date)}.</span> {text}</p>
          <button onClick={() => setBlocked(b.date, false, localISO())} className="shrink-0 rounded-xl px-2.5 py-1 text-sm text-accent active:scale-95">Cofnij</button>
        </div>
      ))}
    </section>
  );
}

const LOC = ["w poniedziałek", "we wtorek", "w środę", "w czwartek", "w piątek", "w sobotę", "w niedzielę"];
/** „w środę”, „we wtorek”: dzień z przyimkiem. */
const weekdayLoc = (iso: string): string => LOC[(new Date(Date.parse(iso)).getUTCDay() + 6) % 7]!;
