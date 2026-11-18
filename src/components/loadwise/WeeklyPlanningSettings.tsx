import type { Profile, SessionDay } from "@/lib/loadwise/types";
import { GOAL_LABELS } from "@/lib/loadwise/labels";
import {
  automaticWeeklyTargets,
  defaultWeeklyTargets,
  type WeeklyPlanningPreferences,
} from "@/lib/loadwise/weeklyPlanningPreferences";
import { weeklyTargetCoverage } from "@/lib/loadwise/engineV2/weeklyTargets";
import { plDate } from "./PlanWeek";
import "./weekly-planning.css";

export function WeeklyPlanningSettings({
  profile,
  value: savedValue,
  onChange,
}: {
  profile: Profile;
  value: WeeklyPlanningPreferences | null;
  onChange: (value: WeeklyPlanningPreferences | null) => void;
}) {
  const value = savedValue
    ? { ...savedValue, weeklyTargets: automaticWeeklyTargets(savedValue.weeklyTargets) }
    : null;
  return (
    <section className="bw-weekly-settings" aria-label="Cele tygodnia">
      <h3>Cele tygodnia</h3>
      <p>Priorytet z profilu: {GOAL_LABELS[profile.goal]}. Klub i mecze pozostają w kalendarzu.</p>
      <p className="bw-weekly-speed" aria-label="Liczba sesji sprintu">
        Sprint automatycznie: główna sesja i ewentualna dodatkowa ekspozycja, jeśli pasuje do celu i
        obciążenia tygodnia.
      </p>
      <div className="bw-weekly-actions">
        <button type="button" aria-pressed={value === null} onClick={() => onChange(null)}>
          Automatycznie z profilu
        </button>
        <button
          type="button"
          aria-pressed={
            value?.weeklyTargets.speed === "auto" &&
            value.weeklyTargets.endurance === 1 &&
            value.minFullRestDays === 1 &&
            value.fillRestDays
          }
          onClick={() =>
            onChange({
              weeklyTargets: { strength: 2, speed: "auto", endurance: 1 },
              fillRestDays: true,
              minFullRestDays: 1,
            })
          }
        >
          2 siłowe · 1 bieg · sprint automatycznie
        </button>
      </div>
      {value ? (
        <div className="bw-weekly-fields">
          <p className="bw-weekly-strength">Siła A i B: 2 osobne sesje</p>
          <label>
            Biegi na tydzień
            <select
              aria-label="Biegi na tydzień"
              value={value.weeklyTargets.endurance}
              onChange={(event) =>
                onChange({
                  ...value,
                  weeklyTargets: {
                    ...value.weeklyTargets,
                    endurance: Number(event.target.value) as 1 | 2,
                  },
                })
              }
            >
              <option value={1}>1</option>
              <option value={2}>2</option>
            </select>
          </label>
          <label className="bw-weekly-rest">
            Pełne dni odpoczynku
            <select
              aria-label="Pełne dni odpoczynku"
              value={value.minFullRestDays}
              onChange={(event) =>
                onChange({ ...value, minFullRestDays: Number(event.target.value) as 0 | 1 | 2 })
              }
            >
              <option value={0}>Bez rezerwy</option>
              <option value={1}>Min. 1 dzień</option>
              <option value={2}>Min. 2 dni</option>
            </select>
          </label>
          <label className="bw-weekly-check">
            <input
              type="checkbox"
              checked={value.fillRestDays}
              onChange={(event) => onChange({ ...value, fillRestDays: event.target.checked })}
            />
            Lekka technika lub mobilność w pozostałe wolne dni
          </label>
        </div>
      ) : (
        <button
          type="button"
          className="bw-plan-link"
          onClick={() =>
            onChange({
              weeklyTargets: defaultWeeklyTargets(profile),
              fillRestDays: false,
              minFullRestDays: 1,
            })
          }
        >
          Ustaw własne cele
        </button>
      )}
      <p>To cel do rozplanowania. Podgląd pokaże faktyczne sesje i ograniczenia przed zapisem.</p>
    </section>
  );
}

export function WeeklyPlanningCoverage({
  plan,
  preferences,
}: {
  plan: SessionDay[];
  preferences: WeeklyPlanningPreferences | null;
}) {
  if (!preferences || !plan.length) return null;
  const coverage = weeklyTargetCoverage(plan, preferences.weeklyTargets);
  return (
    <section className="bw-plan-card bw-weekly-coverage" aria-label="Pokrycie celów tygodniowych">
      <h2>Cel i zaplanowane sesje</h2>
      <p>
        Każdy okres obejmuje 7 dni od początku planu. Technika i mobilność są liczone oddzielnie od
        sprintu, biegu i siły.
      </p>
      {!coverage.length ? (
        <p role="alert">Nie można odczytać pokrycia celów. Przygotuj nowy podgląd planu.</p>
      ) : null}
      {coverage.map((week, index) => {
        const missing =
          week.planned.strength < week.requested.strength ||
          week.planned.endurance < week.requested.endurance;
        const restMissing = week.fullRestDays < preferences.minFullRestDays;
        return (
          <details key={week.startDate} open={index === 0}>
            <summary>
              Tydzień {index + 1} · {plDate(week.startDate)}–{plDate(week.endDate)}
              {missing || restMissing ? " · ograniczenia" : ""}
            </summary>
            <table>
              <caption>Zaplanowane / cel</caption>
              <thead>
                <tr>
                  <th scope="col">Rodzaj</th>
                  <th scope="col">Sesje</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    { key: "strength", label: "Siła" },
                    { key: "speed", label: "Sprint" },
                    { key: "endurance", label: "Bieganie" },
                  ] as const
                ).map(({ key, label }) => (
                  <tr
                    key={key}
                    data-unmet={
                      (key !== "speed" && week.planned[key] < week.requested[key]) || undefined
                    }
                  >
                    <th scope="row">{label}</th>
                    <td>
                      {key === "speed"
                        ? `${week.planned.speed} · automatycznie`
                        : `${week.planned[key]} / ${week.requested[key]}`}
                    </td>
                  </tr>
                ))}
                <tr data-unmet={restMissing || undefined}>
                  <th scope="row">Pełny odpoczynek</th>
                  <td>
                    {week.fullRestDays} / min. {preferences.minFullRestDays}
                  </td>
                </tr>
              </tbody>
            </table>
            {missing || restMissing ? (
              <p role="status">
                Nie wszystkie cele się mieszczą. Przyczyny znajdziesz w ograniczeniach planu.
              </p>
            ) : null}
          </details>
        );
      })}
    </section>
  );
}
