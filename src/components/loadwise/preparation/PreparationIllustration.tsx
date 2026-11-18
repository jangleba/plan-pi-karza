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
