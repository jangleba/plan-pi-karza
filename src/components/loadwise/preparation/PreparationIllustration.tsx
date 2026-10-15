import { useId } from "react";
import type { PreparationVisual } from "@/lib/loadwise/preparation/protocols";

/** Ilustracje wektorowe opisują pozycję, nie diagnozują pracy ani stanu tkanek. */
export function PreparationIllustration({
  visual,
  label,
  side,
  small = false,
}: {
  visual: PreparationVisual;
  label: string;
  side?: "left" | "right" | null;
  small?: boolean;
}) {
  const titleId = useId();
  const wall = visual === "calf" || visual === "soleus" || visual === "quad";
  const calf = visual === "calf" || visual === "soleus";
  return (
    <svg
      viewBox="0 0 280 210"
      role="img"
      aria-labelledby={titleId}
      className={`bw-prep-illustration ${small ? "is-small" : ""}`}
    >
      <title id={titleId}>
        {label}
        {side === "left" ? " — lewa strona" : side === "right" ? " — prawa strona" : ""}
      </title>
      <path d="M22 190H258" stroke="#dce2e7" strokeWidth="2" />
      <g
        transform={side === "right" ? "translate(280 0) scale(-1 1)" : undefined}
        fill="none"
        stroke="#26384a"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {wall && <path d="M242 32V190" stroke="#aeb9c4" strokeWidth="2" />}
        {calf ? (
          <>
            <circle cx="184" cy="47" r="12" fill="#f0f2f3" />
            <path d="M177 65L146 112L164 128L190 78" fill="#e6ebef" />
            <path d="M180 73L207 98L239 87M164 84L204 105L239 96" />
            <path d="M164 128L199 142L207 185L225 187" />
            {visual === "soleus" ? (
              <path d="M148 118L108 143L82 184L61 186" stroke="#102e50" strokeWidth="6" />
            ) : (
              <path d="M148 118L107 151L77 185L57 187" stroke="#102e50" strokeWidth="6" />
            )}
            <path d="M54 192H83" stroke="#69849b" strokeWidth="3" />
          </>
        ) : visual === "hip" || visual === "hamstring" || visual === "ankle" ? (
          <>
            <circle cx="136" cy="42" r="12" fill="#f0f2f3" />
            <path
              d={
                visual === "hamstring"
                  ? "M139 60L157 114L136 120L124 65"
                  : "M133 61L124 115L146 120L151 64"
              }
              fill="#e6ebef"
            />
            <path d="M134 76L163 113L183 132" />
            {visual === "hamstring" ? (
              <>
                <path d="M139 120L105 160L122 185L150 187" />
                <path d="M149 121L195 158L230 182L237 170" stroke="#102e50" strokeWidth="6" />
              </>
            ) : (
              <>
                <path d="M132 120L109 182L72 185L61 181" stroke="#102e50" strokeWidth="6" />
                <path d="M146 120L190 132L204 184L225 187" />
              </>
            )}
          </>
        ) : visual === "quad" ? (
          <>
            <circle cx="167" cy="36" r="12" fill="#f0f2f3" />
            <path d="M154 55L156 115L179 115L182 55" fill="#e6ebef" />
            <path d="M178 66L210 90L240 88M155 68L133 103L126 142" />
            <path
              d="M174 117L178 183L196 187M158 117L133 169L126 140"
              stroke="#102e50"
              strokeWidth="5"
            />
          </>
        ) : visual === "cat" || visual === "adductor" ? (
          <>
            <circle cx="207" cy="101" r="12" fill="#f0f2f3" />
            <path d="M190 103Q149 75 104 108L111 127Q148 108 183 119Z" fill="#e6ebef" />
            <path d="M183 116L196 179L214 184M173 120L180 175L193 179M110 124L99 179L70 184" />
            {visual === "adductor" ? (
              <path d="M114 122L83 147L35 157L24 153" stroke="#102e50" strokeWidth="6" />
            ) : (
              <path d="M116 129L123 177L95 181" />
            )}
          </>
        ) : visual === "rotation" ? (
          <>
            <circle cx="69" cy="151" r="12" fill="#f0f2f3" />
            <path d="M85 147L142 145L145 166L86 168Z" fill="#e6ebef" />
            <path
              d="M143 151L182 158L162 184L209 186M145 163L181 169L170 187M99 153L109 109L153 86"
              stroke="#102e50"
              strokeWidth="5"
            />
            <path d="M99 166L120 183L148 187" />
          </>
        ) : visual === "squat" ? (
          <>
            <circle cx="177" cy="48" r="12" fill="#f0f2f3" />
            <path d="M168 65L130 115L149 130L185 77Z" fill="#e6ebef" />
            <path
              d="M177 80L207 103L241 103M132 121L185 143L162 184L188 188M145 130L105 151L91 184L115 188"
              stroke="#102e50"
              strokeWidth="5"
            />
          </>
        ) : visual === "bridge" ? (
          <>
            <circle cx="64" cy="174" r="12" fill="#f0f2f3" />
            <path d="M81 171L143 119L157 136L91 183Z" fill="#e6ebef" />
            <path
              d="M151 128L195 108L222 183L243 187M88 182L128 187"
              stroke="#102e50"
              strokeWidth="5"
            />
          </>
        ) : (
          <>
            <circle cx="145" cy="37" r="12" fill="#f0f2f3" />
            <path d="M130 55L124 115L147 122L161 60Z" fill="#e6ebef" />
            <path
              d="M148 120L184 137L168 167L184 172M128 118L109 183L126 187"
              stroke="#102e50"
              strokeWidth="5"
            />
            <path d="M154 67L182 92L208 77M132 69L107 98L83 91" />
          </>
        )}
      </g>
    </svg>
  );
}

export function RecoveryFocusIcon({ focus }: { focus: string }) {
  return (
    <svg
      viewBox="0 0 52 58"
      width="35"
      height="40"
      aria-hidden="true"
      fill="none"
      stroke="#536b80"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="26" cy="7" r="5" />
      <path d="M19 16L13 19L7 34L11 36L18 24L18 37L17 53L22 54L26 39L30 54L35 53L34 37L34 24L41 36L45 34L39 19L33 16Z" />
      {focus === "calves" && <path d="M20 44L19 51M32 44L33 51" stroke="#102b49" strokeWidth="4" />}
      {(focus === "hamstrings" || focus === "quadriceps") && (
        <path d="M21 34L20 42M31 34L32 42" stroke="#102b49" strokeWidth="4" />
      )}
      {focus === "hips" && <path d="M18 31Q26 36 34 31" stroke="#102b49" strokeWidth="4" />}
      {focus === "adductors" && (
        <path d="M24 35L23 42M28 35L29 42" stroke="#102b49" strokeWidth="3" />
      )}
      {focus === "back" && <path d="M26 20L26 29" stroke="#102b49" strokeWidth="5" />}
      {focus === "whole" && (
        <path
          d="M21 21L31 21M26 22L26 34M22 36L20 48M30 36L32 48"
          stroke="#102b49"
          strokeWidth="3"
        />
      )}
    </svg>
  );
}
