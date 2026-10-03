import "./iq-reset.css";

type Props = {
  initialScenario?: number;
  showOnboardingInitially?: boolean;
  onBack?: () => void;
  onComplete?: (result: {
    scenarioId: string;
    verdict: "strong" | "conditional" | "risky";
  }) => void;
};

/**
 * Temporary compile-safe shell.
 *
 * The former IQ renderer, scenarios, evaluation engine and interaction logic
 * were intentionally removed. This component only keeps the existing route
 * alive until the new module is implemented.
 */
export function FootballIQMatch({ onBack }: Props) {
  return (
    <main className="bwiq-reset" aria-label="BallWise IQ — moduł w przebudowie">
      <button className="bwiq-reset__back" type="button" onClick={onBack}>
        ‹ <span>Wróć</span>
      </button>

      <section className="bwiq-reset__message">
        <span>BallWise IQ</span>
        <h1>Budujemy ten moduł od nowa</h1>
        <p>Poprzednia wersja została usunięta.</p>
      </section>
    </main>
  );
}
