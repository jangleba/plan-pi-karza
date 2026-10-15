import { BALL_REST_HEIGHT, METRES_PER_UNIT } from "./animation";

export type BallDelivery = "ground" | "chip" | "lofted" | "cross";
export const deliveryLabels: Record<BallDelivery, string> = {
  ground: "Po ziemi",
  chip: "Podcięcie",
  lofted: "Przerzut",
  cross: "Dośrodkowanie",
};
const clamp = (v: number) => Math.max(0, Math.min(1, v));
export function flightProfile(delivery: BallDelivery, distance: number) {
  const metres = Math.max(0, distance) * METRES_PER_UNIT;
  const flight =
    delivery === "ground"
      ? Math.max(0.22, metres / 15)
      : delivery === "chip"
        ? Math.max(0.75, metres / 12)
        : delivery === "cross"
          ? Math.max(1.1, metres / 17)
          : Math.max(1.4, metres / 20);
  const apex =
    delivery === "ground"
      ? 0.1
      : delivery === "chip"
        ? Math.min(7.5, 3.5 + metres * 0.14)
        : delivery === "cross"
          ? Math.min(12, 6 + metres * 0.12)
          : Math.min(14, 7.5 + metres * 0.12);
  return { flight, apex, control: delivery === "ground" ? 0.22 : 0.65 };
}
// A deterministic parabola, sampled identically during live play and seeking.
// Coordinates are deliberately stylised to match the existing player display scale.
export function flightHeight(
  delivery: BallDelivery,
  distance: number,
  progress: number,
  landingHeight = BALL_REST_HEIGHT,
) {
  const t = clamp(progress);
  return (
    BALL_REST_HEIGHT +
    (landingHeight - BALL_REST_HEIGHT) * t +
    4 * flightProfile(delivery, distance).apex * t * (1 - t)
  );
}
