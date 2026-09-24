import { ExternalLink, FlaskConical, Info, ShieldCheck, X } from "lucide-react";

import {
  getEvidenceForRecommendation,
  type FuelRecommendation
} from "../engine/fuelEngine";

interface ExplainSheetProps {
  recommendation: FuelRecommendation;
  onClose: () => void;
}

const interpretationLabel = {
  consensus: "Wprost z konsensusu",
  operational: "Zakres operacyjny",
  individual: "Wymaga przećwiczenia"
} as const;

export function ExplainSheet({ recommendation, onClose }: ExplainSheetProps) {
  const sources = getEvidenceForRecommendation(recommendation);

  return (
    <div className="bw-fuel-sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="bw-fuel-sheet bw-fuel-explain"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bw-fuel-explain-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <span className="bw-fuel-sheet__badge"><FlaskConical aria-hidden="true" /> Podstawa rekomendacji</span>
          <button type="button" onClick={onClose} aria-label="Zamknij"><X aria-hidden="true" /></button>
        </header>

        <div className="bw-fuel-explain__intro">
          <p className="bw-fuel-eyebrow">DLACZEGO TO WIDZISZ?</p>
          <h2 id="bw-fuel-explain-title">{recommendation.title}</h2>
          <ul>
            {recommendation.reasons.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
        </div>

        {recommendation.targets.length > 0 && (
          <div className="bw-fuel-explain__section">
            <h3>Zakresy, nie obietnice</h3>
            {recommendation.targets.map((target) => (
              <div className="bw-fuel-evidence-target" key={`${target.id}-${target.label}`}>
                <span><strong>{target.label}</strong><small>{interpretationLabel[target.interpretation]}</small></span>
                <b>{target.display}</b>
              </div>
            ))}
            <p className="bw-fuel-note"><Info aria-hidden="true" /> Zakres zależy od tolerancji, wcześniejszych posiłków i rzeczywistego obciążenia. Fuel nie ocenia zawartości glikogenu ani „gotowości” procentem.</p>
          </div>
        )}

        <div className="bw-fuel-explain__section">
          <h3>Praktyczne podpowiedzi</h3>
          <ul>{recommendation.tips.map((tip) => <li key={tip}>{tip}</li>)}</ul>
        </div>

        <div className="bw-fuel-explain__section">
          <h3>Źródła</h3>
          <div className="bw-fuel-source-list">
            {sources.map((source) => (
              <a href={source.url} key={source.id} target="_blank" rel="noreferrer">
                <span><strong>{source.shortName}</strong><small>{source.citation}</small></span>
                <ExternalLink aria-hidden="true" />
              </a>
            ))}
          </div>
        </div>

        <div className="bw-fuel-safety">
          <ShieldCheck aria-hidden="true" />
          <div>
            <strong>Granice działania</strong>
            <p>{recommendation.disclaimer}</p>
            {recommendation.safetyNotes.map((note) => <p key={note}>{note}</p>)}
          </div>
        </div>
      </section>
    </div>
  );
}

