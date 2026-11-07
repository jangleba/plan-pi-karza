export function TimedTestGuide({ turn = false }: { turn?: boolean }) {
  return (
    <div className="bl-timing-guide">
      <svg
        viewBox="0 0 320 84"
        role="img"
        aria-label={
          turn
            ? "Rozbieg 10 metrów, potem 5 metrów do nawrotu i powrót"
            : "Odcinek 10 metrów i nieruchomy telefon ustawiony z boku"
        }
      >
        <path d="M28 26H292" stroke="currentColor" strokeWidth="1" opacity=".18" />
        <path d="M40 17V35M280 17V35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path
          d="M56 26H263M257 22L263 26L257 30"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {turn && (
          <path
            d="M262 33H60M66 29L60 33L66 37"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            opacity=".5"
          />
        )}
        <text x="40" y="12" textAnchor="middle">
          {turn ? "Pomiar" : "Start"}
        </text>
        <text x="280" y="12" textAnchor="middle">
          {turn ? "Nawrót" : "Meta"}
        </text>
        <text x="160" y="17" textAnchor="middle" className="bl-guide-distance">
          {turn ? "5 m + powrót" : "10 m"}
        </text>
        <rect
          x="153"
          y="50"
          width="14"
          height="21"
          rx="3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <path
          d="M160 38V46"
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="2 3"
          opacity=".4"
        />
        <text x="160" y="81" textAnchor="middle">
          Telefon stoi z boku
        </text>
      </svg>
      <p>Taśma i znaczniki · nieruchomy telefon · oryginalny film</p>
    </div>
  );
}
