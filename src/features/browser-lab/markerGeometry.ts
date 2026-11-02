import {
  floorTransform,
  projectiveCentre,
  type AutomaticLongJumpCalibration,
  type FloorPoint,
} from "./longJump";
type Corners = AutomaticLongJumpCalibration["referenceCorners"];
/** Rectangle detection knows image order, not which printed edge is 20 cm.
 * The 3 m marker lies normal to that edge, so it resolves the axis even in a side view. */
export function orientStartMarker(corners: Corners, range: Corners): Corners {
  const [u, v] = floorTransform(corners, 20, 24)(projectiveCentre(range));
  const side = Math.abs((u - 10) / 20),
    forward = Math.abs((v - 12) / 24);
  if (Math.max(side, forward) < 1.5)
    throw new Error("Wzorce są zbyt blisko siebie w kadrze. Pokaż START i 3 METRY.");
  return side > forward ? [corners[1], corners[2], corners[3], corners[0]] : corners;
}
export function takeoffEdgeFromMarkers(corners: Corners, range: Corners): [FloorPoint, FloorPoint] {
  const [, depth] = floorTransform(corners, 20, 24)(projectiveCentre(range));
  if (depth > 24) return [corners[2], corners[3]];
  if (depth < 0) return [corners[0], corners[1]];
  throw new Error("Wzorzec 3 METRY musi leżeć przed krawędzią START, w kierunku skoku.");
}
