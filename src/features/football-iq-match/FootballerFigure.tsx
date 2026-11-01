import type { PlayerMotion } from "./animation";
import { RUN_STRIDE_UNITS, WALK_STRIDE_UNITS } from "./animation";

/** A filled footballer silhouette for devices without WebGL; pose follows the same recorded frame. */
export function footballerPose(motion: PlayerMotion) {
  const phase =
    (motion.distance / (motion.gait === "walk" ? WALK_STRIDE_UNITS : RUN_STRIDE_UNITS)) *
    Math.PI *
    2;
  const stride = motion.moving ? Math.sin(phase) : 0;
  const kick =
    motion.state === "pass" ? Math.sin(Math.PI * Math.min(1, (motion.phase ?? 0) * 1.5)) : 0;
  const leg = (side: number) => {
    const swing = stride * side * 7 + (side === 1 ? kick * 10 : 0);
    const lift = motion.moving ? Math.max(0, stride * side) * 9 : side === 1 ? kick * 8 : 0;
    return `M${20 + side * 3} 31 Q${20 + swing * 0.45 + side * 3} ${43 - lift * 0.8} ${20 + swing + side * 4} ${55 - lift}`;
  };
  const arm = (side: number) =>
    `M${20 + side * 7} 17 Q${20 + side * 11 - stride * side * 4} 28 ${20 + side * 8 - stride * side * 8} 32`;
  return {
    leftLeg: leg(-1),
    rightLeg: leg(1),
    leftArm: arm(-1),
    rightArm: arm(1),
    facing: Math.sin(motion.heading) < -0.1 ? -1 : 1,
  };
}
export function applyFootballerPose(svg: SVGSVGElement, motion: PlayerMotion) {
  const pose = footballerPose(motion);
  for (const name of ["leftLeg", "rightLeg", "leftArm", "rightArm"] as const)
    svg.querySelector(`[data-limb="${name}"]`)?.setAttribute("d", pose[name]);
  svg
    .querySelector("[data-figure-body]")
    ?.setAttribute("transform", pose.facing === -1 ? "translate(40 0) scale(-1 1)" : "");
}
export function FootballerFigure({ motion }: { motion: PlayerMotion }) {
  const pose = footballerPose(motion);
  return (
    <g data-figure-body transform={pose.facing === -1 ? "translate(40 0) scale(-1 1)" : undefined}>
      <ellipse cx="20" cy="57" rx="13" ry="3" fill="#082e3660" />
      <g stroke="#d9b99b" strokeWidth="5.5" strokeLinecap="round" fill="none">
        <path data-limb="leftLeg" d={pose.leftLeg} />
        <path data-limb="rightLeg" d={pose.rightLeg} />
        <path data-limb="leftArm" d={pose.leftArm} />
        <path data-limb="rightArm" d={pose.rightArm} />
      </g>
      <path d="M14 28H26L27 37H21L20 32L19 37H13Z" fill="var(--figure-shorts)" />
      <path
        d="M14 12Q20 9 26 12L31 19L26 23L25 30H15L14 23L9 19Z"
        fill="var(--figure-shirt)"
        stroke="#102f4d"
        strokeWidth=".8"
      />
      <path d="M18 12L20 16L23 12" fill="none" stroke="#ffffffa0" strokeWidth="1" />
      <circle cx="20" cy="6" r="5.5" fill="#d9b99b" stroke="#29443e" strokeWidth=".7" />
    </g>
  );
}
