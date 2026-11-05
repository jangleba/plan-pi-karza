import type { PreparationVisual } from "@/lib/loadwise/preparation/protocols";
import { ExerciseAnimationPreview } from "../session/ExerciseAnimationPreview";
import { APP_VERSION } from "@/lib/appVersion";

/** Small thumbnails are a frame from the same renderer; the opened exercise moves. */
export function PreparationIllustration({
  visual,
  label,
  side,
  small = false,
  squeeze = false,
}: {
  visual: PreparationVisual;
  label: string;
  side?: "left" | "right" | null;
  small?: boolean;
  squeeze?: boolean;
}) {
  const id = squeeze ? "adductor_bridge_squeeze" : `bwprep:${visual}`;
  const name =
    label + (side === "left" ? " · lewa strona" : side === "right" ? " · prawa strona" : "");
  if (small)
    return (
      <img
        src={`/technique/animations/thumbs/${visual}.svg?v=${APP_VERSION}`}
        alt={name}
        width={140}
        height={140}
        className="bw-prep-illustration is-small"
        loading="lazy"
      />
    );
  return (
    <ExerciseAnimationPreview
      exercise={{ id, exerciseId: id, name }}
      autoOpen
      mirror={side === "right"}
    />
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
