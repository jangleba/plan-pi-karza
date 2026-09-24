import { ArrowLeft, Check, X } from "lucide-react";
import { useMemo, useState } from "react";

import type { QuickSignals } from "../engine/fuelEngine";

interface QuickCheckSheetProps {
  initial: QuickSignals;
  onClose: () => void;
  onComplete: (signals: QuickSignals) => void;
}

type SignalKey = keyof QuickSignals;

interface Step {
  key: SignalKey;
  title: string;
  subtitle: string;
  options: Array<{ value: string | number; label: string; detail: string }>;
}

const STEPS: Step[] = [
  {
    key: "hunger",
    title: "Jak duży jest głód?",
    subtitle: "Jedno dotknięcie — bez liczenia kalorii.",
    options: [
      { value: "low", label: "Mały", detail: "Mogę poczekać" },
      { value: "normal", label: "Normalny", detail: "Zjadłbym coś" },
      { value: "high", label: "Duży", detail: "Potrzebuję posiłku" }
    ]
  },
  {
    key: "gutComfort",
    title: "Jak czuje się brzuch?",
    subtitle: "To zmienia ciężkość proponowanych opcji.",
    options: [
      { value: "light", label: "Lekko", detail: "Bez problemu" },
      { value: "normal", label: "Normalnie", detail: "Bez zmian" },
      { value: "heavy", label: "Ciężko", detail: "Potrzebuję prostoty" }
    ]
  },
  {
    key: "prepMinutes",
    title: "Ile masz czasu?",
    subtitle: "Wybierz realny czas, nie idealny.",
    options: [
      { value: 2, label: "2 min", detail: "Biorę i jem" },
      { value: 10, label: "10 min", detail: "Szybko przygotuję" },
      { value: 20, label: "20+ min", detail: "Mogę ugotować" }
    ]
  },
  {
    key: "place",
    title: "Gdzie jesteś?",
    subtitle: "Fuel odrzuci niepraktyczne propozycje.",
    options: [
      { value: "home", label: "W domu", detail: "Mam kuchnię" },
      { value: "store", label: "W sklepie", detail: "Kupuję gotowe" },
      { value: "out", label: "Na mieście", detail: "Szukam lokalu" }
    ]
  },
  {
    key: "lastMeal",
    title: "Kiedy był ostatni posiłek?",
    subtitle: "Bez wpisywania dokładnej godziny.",
    options: [
      { value: "under_1h", label: "Do godziny", detail: "Niedawno" },
      { value: "1_to_3h", label: "1–3 h", detail: "Jakiś czas temu" },
      { value: "over_3h", label: "Ponad 3 h", detail: "Dawno" }
    ]
  }
];

export function QuickCheckSheet({ initial, onClose, onComplete }: QuickCheckSheetProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<QuickSignals>(initial);
  const step = STEPS[stepIndex];
  const progress = useMemo(() => ((stepIndex + 1) / STEPS.length) * 100, [stepIndex]);

  const choose = (value: string | number) => {
    const next = { ...answers, [step.key]: value } as QuickSignals;
    setAnswers(next);
    if (stepIndex === STEPS.length - 1) onComplete(next);
    else setStepIndex((current) => current + 1);
  };

  return (
    <div className="bw-fuel-sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="bw-fuel-sheet bw-fuel-quick-check"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bw-fuel-check-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <button type="button" onClick={stepIndex ? () => setStepIndex((current) => current - 1) : onClose} aria-label="Wstecz">
            {stepIndex ? <ArrowLeft aria-hidden="true" /> : <X aria-hidden="true" />}
          </button>
          <span>{stepIndex + 1} / {STEPS.length}</span>
          <button type="button" onClick={() => onComplete(answers)} aria-label="Zakończ">
            <Check aria-hidden="true" />
          </button>
        </header>
        <div className="bw-fuel-progress"><span style={{ width: `${progress}%` }} /></div>
        <div className="bw-fuel-quick-check__copy">
          <p className="bw-fuel-eyebrow">SZYBKI CHECK</p>
          <h2 id="bw-fuel-check-title">{step.title}</h2>
          <p>{step.subtitle}</p>
        </div>
        <div className="bw-fuel-answer-grid">
          {step.options.map((option) => (
            <button key={String(option.value)} type="button" onClick={() => choose(option.value)}>
              <strong>{option.label}</strong>
              <small>{option.detail}</small>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

