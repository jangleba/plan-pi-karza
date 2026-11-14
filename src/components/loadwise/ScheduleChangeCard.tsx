import type { ScheduleChange } from "@/lib/loadwise/scheduleChange";

/** Short reason and concrete change; the plan itself changes only after the explicit save. */
export function ScheduleChangeCard({
  changes,
  onOpen,
}: {
  changes: readonly ScheduleChange[];
  onOpen: () => void;
}) {
  if (!changes.length) return null;
  return (
    <section className="bw-home-iq-task" aria-label="Zmiana ustawień a plan">
      <span>
        <small>Zmieniły się ustawienia. Proponujemy zaktualizować nierozpoczęte sesje:</small>
        <ul>
          {changes.map((c) => (
            <li key={c.kind}>{c.line}</li>
          ))}
        </ul>
      </span>
      <button type="button" onClick={onOpen}>
        Zobacz podgląd
      </button>
    </section>
  );
}
