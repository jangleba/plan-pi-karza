import { useState } from "react";
import { Timer } from "lucide-react";
import { useLoadwise } from "@/lib/loadwise/store";
import { buildFieldMasTestSession, fieldMasTestAvailable } from "@/lib/loadwise/runningWeek";
import { isFieldMasCurrent } from "@/lib/running/engine";
import type { SessionDay } from "@/lib/loadwise/types";

/**
 * Test 5 min jest dobrowolny. Zawodnik może go wykonać zamiast zaplanowanego
 * biegu; bez testu plan dalej prowadzi czasem i odczuwanym wysiłkiem.
 */
export function OptionalFieldTest({
  session,
  wholeDay,
  slot,
  locked,
}: {
  session: SessionDay;
  wholeDay: SessionDay;
  slot: 1 | 2;
  locked: boolean;
}) {
  const { state, applyModification } = useLoadwise();
  const profile = state.profile;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!profile || session.runningRecipe?.method === "field_mas_test") return null;
  const available = fieldMasTestAvailable(profile);
  const current = isFieldMasCurrent(profile.fieldMasTestedAt, session.date);

  async function swap() {
    if (!profile || locked) return;
    setSaving(true);
    setError(null);
    try {
      const test = buildFieldMasTestSession(session, profile);
      const day =
        slot === 2
          ? { ...wholeDay, secondSession: test }
          : { ...test, secondSession: wholeDay.secondSession };
      await applyModification(session.date, "swap", day, wholeDay, "Test 5 min zamiast biegu.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie zapisano zmiany. Spróbuj ponownie.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="bw-run-test-option" aria-label="Test 5 minut">
      <h3>
        <Timer size={16} aria-hidden="true" /> Test 5 min (opcjonalnie)
      </h3>
      <p>
        {current
          ? "Masz aktualny wynik testu. Powtórzenie nie jest potrzebne."
          : "Bez testu treningi działają normalnie: prowadzi je czas i odczuwany wysiłek. Wynik testu doda tempo min/km."}
      </p>
      {available.ok ? (
        <button type="button" disabled={saving || locked} onClick={() => void swap()}>
          {saving ? "Zapisuję…" : "Zrób dziś test zamiast tego biegu"}
        </button>
      ) : (
        <p>{available.reason}</p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
