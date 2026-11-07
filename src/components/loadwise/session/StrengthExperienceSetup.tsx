import { useState } from "react";
import { ChevronRight, SlidersHorizontal } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useLoadwise } from "@/lib/loadwise/store";
import { hasStrengthExperience, type StrengthExperience } from "@/lib/loadwise/strengthExperience";
import "./training-coach.css";

export function StrengthExperienceSetup({ compact = false }: { compact?: boolean } = {}) {
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
    setSaving(true);
    setError(null);
    try {
      await saveStrengthExperience(draft);
      setEditing(false);
    } catch {
      setError("Nie zapisano odpowiedzi. Sprawdź połączenie i spróbuj ponownie.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className="bw-strength-experience-trigger"
        aria-haspopup="dialog"
        aria-label={known ? "Doświadczenie siłowe" : "Dopasuj trening siłowy"}
        onClick={() => {
          setDraft({
            gymExperienceLevel: profile.gymExperienceLevel ?? "beginner",
            strengthTrainingMonths: profile.strengthTrainingMonths,
            movementCompetence: profile.movementCompetence ?? "low",
            supervisionLevel: profile.supervisionLevel ?? "none",
          });
          setError(null);
          setEditing(true);
        }}
      >
        <SlidersHorizontal size={18} strokeWidth={1.5} aria-hidden="true" />
        <span>
          {compact
            ? known
              ? "Doświadczenie"
              : "Dopasuj trening"
            : known
              ? "Doświadczenie siłowe"
              : "Dopasuj trening siłowy"}
        </span>
        <ChevronRight size={16} aria-hidden="true" />
      </button>
      <Sheet open={editing} onOpenChange={setEditing} initialDetent="large">
        <SheetContent className="bw-strength-experience-sheet">
          <SheetTitle>Doświadczenie siłowe</SheetTitle>
          <SheetDescription>
            Dopasuj ćwiczenia do swojego stażu i techniki. To osobne ustawienie od poziomu
            piłkarskiego.
          </SheetDescription>
          <div className="bw-coach-experience bw-coach-experience-fields">
            <label>
              Trening siłowy
              <select
                value={draft.gymExperienceLevel}
                disabled={saving}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    gymExperienceLevel: e.target.value as StrengthExperience["gymExperienceLevel"],
                    ...(e.target.value === "none" ? { strengthTrainingMonths: 0 } : {}),
                  }))
                }
              >
                <option value="none">Jeszcze nie trenowałem</option>
                <option value="beginner">Uczę się podstaw</option>
                <option value="intermediate">Regularny trening, znam podstawy</option>
                <option value="advanced">Duże doświadczenie siłowe</option>
              </select>
            </label>
            <div className="bw-strength-tenure" role="group" aria-label="Szybki wybór stażu">
              <span className="bw-strength-tenure-title">Staż regularnego treningu</span>
              {[
                { label: "Poniżej 6 mies.", value: 0, max: 6 },
                { label: "6–11 mies.", value: 6, max: 12 },
                { label: "1–2 lata", value: 12, max: 24 },
                { label: "2 lata lub więcej", value: 24, max: 721 },
              ].map((option) => (
                <button
                  type="button"
                  key={option.value}
                  disabled={saving}
                  aria-pressed={
                    draft.strengthTrainingMonths !== undefined &&
                    draft.strengthTrainingMonths >= option.value &&
                    draft.strengthTrainingMonths < option.max
                  }
                  onClick={() => setDraft((d) => ({ ...d, strengthTrainingMonths: option.value }))}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <label>
              Ile miesięcy regularnego treningu?
              <input
                type="number"
                min="0"
                max="720"
                step="1"
                inputMode="numeric"
                value={draft.strengthTrainingMonths ?? ""}
                placeholder="np. 18"
                disabled={saving}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    strengthTrainingMonths:
                      e.target.value === "" ? undefined : Number(e.target.value),
                  }))
                }
              />
            </label>
            {draft.gymExperienceLevel !== "none" && draft.strengthTrainingMonths === undefined && (
              <p className="bw-strength-tenure-note" role="status">
                Wybierz staż, aby dopasować trudność. Przy pustym polu plan zachowa wariant
                wprowadzający.
              </p>
            )}
            <label>
              Technika podstawowych ćwiczeń
              <select
                value={draft.movementCompetence}
                disabled={saving}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    movementCompetence: e.target.value as StrengthExperience["movementCompetence"],
                  }))
                }
              >
                <option value="low">Dopiero się uczę</option>
                <option value="medium">Kontroluję podstawowe ruchy</option>
                <option value="high">Kontroluję też trudniejsze warianty</option>
              </select>
            </label>
            <label>
              Nadzór na treningu
              <select
                value={draft.supervisionLevel}
                disabled={saving}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    supervisionLevel: e.target.value as StrengthExperience["supervisionLevel"],
                  }))
                }
              >
                <option value="none">Trenuję sam</option>
                <option value="some">Trener sprawdza część ćwiczeń</option>
                <option value="full">Trener prowadzi i nadzoruje sesję</option>
              </select>
            </label>
            {error && <p role="alert">{error}</p>}
            <button
              type="button"
              className="bw-strength-experience-save"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? "Zapisywanie…" : "Zapisz odpowiedzi"}
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
