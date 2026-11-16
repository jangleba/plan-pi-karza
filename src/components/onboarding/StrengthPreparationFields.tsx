import type { OnboardingAnswers } from "@/lib/loadwise/onboardingFlow";
import { Field } from "./OnboardingControls";

type Answers = Pick<
  OnboardingAnswers,
  "gymExperienceLevel" | "strengthTrainingMonths" | "movementCompetence" | "supervisionLevel"
>;

/** Explicit preparation feeds the existing profile codec and exercise eligibility. */
export function StrengthPreparationFields({
  value,
  onChange,
  age,
}: {
  value: Answers;
  onChange: (patch: Partial<Answers>) => void;
  age?: number;
}) {
  return (
    <div className="space-y-4">
      <Field label="Doświadczenie siłowe" htmlFor="onboarding-strength-level">
        <select
          id="onboarding-strength-level"
          className="ob-input"
          value={value.gymExperienceLevel ?? ""}
          onChange={(event) =>
            onChange({
              gymExperienceLevel: (event.target.value ||
                undefined) as Answers["gymExperienceLevel"],
              ...(event.target.value === "none" ? { strengthTrainingMonths: 0 } : {}),
            })
          }
        >
          <option value="">Uzupełnię później</option>
          <option value="none">Brak doświadczenia</option>
          <option value="beginner">Uczę się podstaw</option>
          <option value="intermediate">Regularny trening</option>
          <option value="advanced">Zaawansowane</option>
        </select>
      </Field>
      <Field
        label="Staż regularnego treningu"
        htmlFor="onboarding-strength-months"
        detail="w miesiącach · np. 48 = 4 lata"
      >
        <input
          id="onboarding-strength-months"
          className="ob-input"
          type="number"
          inputMode="numeric"
          min={0}
          max={Math.min(720, age === undefined ? 720 : age * 12)}
          step={1}
          placeholder="Liczba miesięcy"
          value={value.strengthTrainingMonths ?? ""}
          disabled={value.gymExperienceLevel === "none"}
          onChange={(event) =>
            onChange({
              strengthTrainingMonths:
                event.target.value === "" ? undefined : Number(event.target.value),
            })
          }
        />
      </Field>
      <Field label="Technika podstawowych ćwiczeń" htmlFor="onboarding-movement">
        <select
          id="onboarding-movement"
          className="ob-input"
          value={value.movementCompetence ?? ""}
          onChange={(event) =>
            onChange({
              movementCompetence: (event.target.value ||
                undefined) as Answers["movementCompetence"],
            })
          }
        >
          <option value="">Uzupełnię później</option>
          <option value="low">Uczę się ruchów</option>
          <option value="medium">Podstawowe ruchy</option>
          <option value="high">Trudniejsze warianty</option>
        </select>
      </Field>
      <Field label="Nadzór na treningu siłowym" htmlFor="onboarding-supervision">
        <select
          id="onboarding-supervision"
          className="ob-input"
          value={value.supervisionLevel ?? ""}
          onChange={(event) =>
            onChange({
              supervisionLevel: (event.target.value || undefined) as Answers["supervisionLevel"],
            })
          }
        >
          <option value="">Uzupełnię później</option>
          <option value="none">Samodzielnie</option>
          <option value="some">Częściowy nadzór</option>
          <option value="full">Pełny nadzór trenera</option>
        </select>
      </Field>
      <p className="ob-group__note">
        Te odpowiedzi dopasowują warianty ćwiczeń. Sam wiek ani poziom gry nie potwierdzają stażu,
        techniki lub nadzoru. Brak odpowiedzi pozostaje brakiem danych.
      </p>
    </div>
  );
}
