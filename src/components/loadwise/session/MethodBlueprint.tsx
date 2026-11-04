import { useId } from "react";
const METHOD_BLUEPRINT_IDS=[
      "flywheel_squat",
      "band_resisted_squat",
      "overcoming_pin_squat",
      "clean_pull_from_hang",
      "hill_acceleration",
      "band_resisted_acceleration",
      "assisted_straight_sprint",
      "method_interval_run",
      "method_repeated_sprint",
      "method_speed_endurance",
      "method_sprint_interval",
    ];
export function hasMethodBlueprint(exerciseId?:string){return METHOD_BLUEPRINT_IDS.includes(exerciseId??" ");}
/** Technical setup schematics, not a substitute for a coach's demonstration. */
export function MethodBlueprint({ exerciseId }: { exerciseId?: string }) {
  const id = useId();
  if(!hasMethodBlueprint(exerciseId))return null;
  const field = /acceleration|sprint|interval|endurance/.test(exerciseId ?? ""),
    flywheel = exerciseId === "flywheel_squat",
    bands = exerciseId === "band_resisted_squat",
    pins = exerciseId === "overcoming_pin_squat",
    pull = exerciseId === "clean_pull_from_hang";
  const caption = field
    ? exerciseId === "hill_acceleration"
      ? "Łagodny podbieg i wolna droga zatrzymania"
      : exerciseId === "band_resisted_acceleration"
        ? "Partner kontroluje opór; nie puszcza napiętej gumy"
        : exerciseId === "assisted_straight_sprint"
          ? "System asysty ustawia i kontroluje trener"
          : "Odcinek pracy i osobna strefa wyhamowania"
    : flywheel
      ? "Linka i uprząż; trener dobiera ustawienie urządzenia"
      : bands
        ? "Symetryczne gumy i podpory asekuracyjne"
        : pins
          ? "Pewne, nieruchome piny i pozycja ustalona z trenerem"
          : pull
            ? "Pociągnięcie z zawieszenia, bez chwytu zarzutu"
            : "";
  return (
    <figure className="my-4 rounded-xl border border-border p-3">
      <svg viewBox="0 0 320 145" role="img" aria-labelledby={id}>
        <title id={id}>{caption}</title>
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-primary"
        >
          {field ? (
            <>
              <path
                d={exerciseId === "hill_acceleration" ? "M20 125L295 50" : "M20 110H300"}
                opacity=".4"
              />
              <path d="M35 38V125M210 38V125" strokeDasharray="3 5" />
              <path d="M45 78H195M187 71L196 78L187 85" />
              <path d="M220 78H290" strokeDasharray="3 5" />
              <text x="70" y="57" fill="currentColor" stroke="none" fontSize="12">
                Praca
              </text>
              <text x="224" y="57" fill="currentColor" stroke="none" fontSize="10">
                Wyhamuj
              </text>
              {exerciseId === "band_resisted_acceleration" && (
                <path d="M25 95L70 95" stroke="#b47b3a" />
              )}
              {exerciseId === "assisted_straight_sprint" && (
                <path d="M215 135H300M250 130V105" stroke="#b47b3a" />
              )}
            </>
          ) : (
            <>
              <path d="M30 130H290" opacity=".3" />
              {(bands || pins) && (
                <path d="M90 130V20H235V130M82 130H105M222 130H245" opacity=".5" />
              )}
              <circle cx="162" cy="30" r="9" />
              <path d="M159 40L150 76L178 97L165 126M150 76L128 103L113 126M151 49L122 65M153 51L181 62" />
              <path d={pull ? "M115 68H205" : "M110 47H208"} strokeWidth="3" />
              {pull ? <path d="M220 94V55M215 62L220 54L225 62" stroke="#b47b3a" /> : null}
              {bands ? <path d="M117 49L100 123M198 49L227 123" stroke="#b47b3a" /> : null}
              {pins ? (
                <>
                  <path d="M94 44H116M206 44H232" strokeWidth="4" />
                  <path d="M222 76V54M217 61L222 53L227 61" stroke="#b47b3a" />
                </>
              ) : null}
              {flywheel ? (
                <>
                  <rect x="130" y="126" width="65" height="8" rx="2" />
                  <circle cx="240" cy="111" r="18" />
                  <circle cx="240" cy="111" r="5" />
                  <path d="M160 78L160 124L222 112" stroke="#b47b3a" />
                  <path d="M230 90Q254 81 263 104" strokeDasharray="3 4" />
                </>
              ) : null}
            </>
          )}
        </g>
      </svg>
      <figcaption className="text-xs text-muted-foreground">
        {caption}. Schemat ustawienia; szczegóły wykonania poniżej.
      </figcaption>
    </figure>
  );
}
