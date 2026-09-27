type Props = { step: number; onNext: () => void; onClose: () => void };

const steps = [
  { eyebrow: "KROK 1/3", title: "Zaplanuj ruch", text: "Przeciągnij zawodnika w przestrzeń. Przerywana linia pokaże jego bieg." },
  { eyebrow: "KROK 2/3", title: "Zagraj piłkę", text: "Przeciągnij piłkę do partnera albo w miejsce, do którego ma pobiec." },
  { eyebrow: "KROK 3/3", title: "Dodaj wsparcie", text: "Możesz przesunąć jeszcze dwóch partnerów. Pozostali zareagują automatycznie." },
];

export function Onboarding({ step, onNext, onClose }: Props) {
  const current = steps[step];
  return (
    <div className="bwiq-onboarding" role="dialog" aria-modal="true" aria-label="Instrukcja Football IQ">
      <div className="bwiq-onboarding-card">
        <button className="bwiq-skip" onClick={onClose}>Pomiń</button>
        <span className="bwiq-eyebrow">{current.eyebrow}</span>
        <div className="bwiq-gesture-demo" aria-hidden="true">
          <span className="bwiq-demo-player">7</span><span className="bwiq-demo-line" /><span className="bwiq-demo-target" />
        </div>
        <h2>{current.title}</h2>
        <p>{current.text}</p>
        <div className="bwiq-dots">{steps.map((_, index) => <i key={index} className={index === step ? "active" : ""} />)}</div>
        <button className="bwiq-primary" onClick={step === 2 ? onClose : onNext}>{step === 2 ? "Rozumiem" : "Dalej"}</button>
      </div>
    </div>
  );
}
