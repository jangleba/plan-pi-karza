type Props = { step: number; onNext: () => void; onBack: () => void; onClose: () => void };

const steps = [
  { eyebrow: "KROK 1/3", title: "Najpierw obserwuj", text: "Zobacz dynamiczny moment meczu. Skanuj piłkę, blok rywala, partnerów i wolną przestrzeń — bez podpowiedzi taktycznej." },
  { eyebrow: "KROK 2/3", title: "Zbuduj własny wariant", text: "Przeciągnij zawodnika, aby dodać ruch, albo przeciągnij piłkę, aby podać. Możesz zapisać maksymalnie 3 akcje i 1 podanie." },
  { eyebrow: "KROK 3/3", title: "Zobacz konsekwencję", text: "Odtwórz wariant i sprawdź trzy rzeczy: Timing, Decyzję przestrzenną i Konsekwencję. Potem porównaj go z lepszą opcją." },
];

export function Onboarding({ step, onNext, onBack, onClose }: Props) {
  const current = steps[step];
  return (
    <div className="bwiq-onboarding" role="dialog" aria-modal="true" aria-label="Instrukcja Football IQ">
      <div className="bwiq-onboarding-card">
        <button className="bwiq-skip" onClick={onClose}>Pomiń</button>
        <span className="bwiq-eyebrow">{current.eyebrow}</span>
        <div className={`bwiq-gesture-demo bwiq-gesture-demo--${step + 1}`} aria-hidden="true">
          <span className="bwiq-demo-player">7</span><span className="bwiq-demo-line" /><span className="bwiq-demo-target" />
        </div>
        <h2>{current.title}</h2>
        <p>{current.text}</p>
        <div className="bwiq-dots">{steps.map((_, index) => <i key={index} className={index === step ? "active" : ""} />)}</div>
        <div className="bwiq-onboarding-actions">
          {step > 0 && <button className="bwiq-secondary" onClick={onBack}>Wstecz</button>}
          <button className="bwiq-primary" onClick={step === 2 ? onClose : onNext}>{step === 2 ? "Rozumiem" : "Dalej"}</button>
        </div>
      </div>
    </div>
  );
}
