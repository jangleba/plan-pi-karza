import { useState } from "react";
import { useLoadwise } from "@/lib/loadwise/store";
import { hasStrengthExperience, type StrengthExperience } from "@/lib/loadwise/strengthExperience";
import "./training-coach.css";

export function StrengthExperienceSetup() {
  const { state, saveStrengthExperience } = useLoadwise();
  const profile = state.profile;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<StrengthExperience>(() => ({
    gymExperienceLevel: profile?.gymExperienceLevel ?? "beginner",
    strengthTrainingMonths: profile?.strengthTrainingMonths,
    movementCompetence: profile?.movementCompetence ?? "low",
    supervisionLevel: profile?.supervisionLevel ?? "none",
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!profile) return null;
  const known = hasStrengthExperience(profile);
  async function save() {
    setSaving(true); setError(null);
    try { await saveStrengthExperience(draft); setEditing(false); }
    catch { setError("Nie zapisano odpowiedzi. Sprawdź połączenie i spróbuj ponownie."); }
    finally { setSaving(false); }
  }
  return (
    <details className="bw-coach-experience" open={editing || undefined}>
      <summary onClick={event => { event.preventDefault(); setEditing(!editing); }}>
        {known ? "Doświadczenie siłowe" : "Dobierz warianty do doświadczenia"}
      </summary>
      <div className="bw-coach-experience-fields">
        <p>Odpowiedz raz. Poziom piłkarski nie określa doświadczenia na siłowni.</p>
        <label>Trening siłowy
          <select value={draft.gymExperienceLevel} disabled={saving} onChange={e => setDraft(d => ({ ...d,
            gymExperienceLevel: e.target.value as StrengthExperience["gymExperienceLevel"],
            ...(e.target.value === "none" ? { strengthTrainingMonths: 0 } : {}),
          }))}>
            <option value="none">Jeszcze nie trenowałem</option><option value="beginner">Uczę się podstaw</option>
            <option value="intermediate">Trenuję regularnie i znam podstawy</option>
            <option value="advanced">Mam duże doświadczenie siłowe</option>
          </select>
        </label>
        <label>Ile miesięcy regularnego treningu?
          <input type="number" min="0" max="720" step="1" inputMode="numeric"
            value={draft.strengthTrainingMonths ?? ""} placeholder="Możesz zostawić puste" disabled={saving}
            onChange={e => setDraft(d => ({ ...d, strengthTrainingMonths: e.target.value === "" ? undefined : Number(e.target.value) }))} />
        </label>
        <label>Technika podstawowych ćwiczeń
          <select value={draft.movementCompetence} disabled={saving} onChange={e => setDraft(d => ({ ...d,
            movementCompetence: e.target.value as StrengthExperience["movementCompetence"],
          }))}>
            <option value="low">Dopiero się uczę</option><option value="medium">Znam podstawowe ustawienie i kontroluję ruch</option>
            <option value="high">Utrzymuję technikę także przy trudniejszych wariantach</option>
          </select>
        </label>
        <label>Nadzór na treningu
          <select value={draft.supervisionLevel} disabled={saving} onChange={e => setDraft(d => ({ ...d,
            supervisionLevel: e.target.value as StrengthExperience["supervisionLevel"],
          }))}>
            <option value="none">Trenuję sam</option><option value="some">Trener sprawdza część ćwiczeń</option>
            <option value="full">Trener prowadzi i nadzoruje sesję</option>
          </select>
        </label>
        {error && <p role="alert">{error}</p>}
        <button type="button" disabled={saving} onClick={() => void save()}>{saving ? "Zapisywanie…" : "Zapisz odpowiedzi"}</button>
      </div>
    </details>
  );
}
