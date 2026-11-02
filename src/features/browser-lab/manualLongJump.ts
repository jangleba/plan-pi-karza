import {
  findBallWiseCalibrationMarkers,
  longJumpMeasurement,
  type FloorPoint,
  type AutomaticLongJumpCalibration,
} from "./longJump";
import { orientStartMarker, takeoffEdgeFromMarkers } from "./markerGeometry";

export type ManualJumpStart = Pick<
  AutomaticLongJumpCalibration,
  | "referenceCorners"
  | "rangeCorners"
  | "takeoffLine"
  | "markerQuality"
  | "calibrationFrameIndex"
  | "lineFrameIndex"
  | "imageWidth"
  | "imageHeight"
>;
export function prepareManualJump(image: ImageData, frameIndex: number): ManualJumpStart {
  if (!Number.isInteger(frameIndex) || frameIndex < 1)
    throw new Error("Wybierz klatkę przed skokiem, z widocznymi wzorcami.");
  const markers = findBallWiseCalibrationMarkers(image);
  if (!markers) throw new Error("Pokaż oba wzorce w całości: START i 3 METRY.");
  const reference = orientStartMarker(markers.start.corners, markers.range.corners);
  return {
    referenceCorners: reference,
    rangeCorners: markers.range.corners,
    takeoffLine: takeoffEdgeFromMarkers(reference, markers.range.corners),
    markerQuality: Math.min(markers.start.quality, markers.range.quality),
    calibrationFrameIndex: frameIndex,
    lineFrameIndex: frameIndex,
    imageWidth: image.width,
    imageHeight: image.height,
  };
}
export function completeManualJump(
  start: ManualJumpStart,
  image: ImageData,
  heel: FloorPoint,
  frameIndex: number,
): AutomaticLongJumpCalibration {
  if (!Number.isInteger(frameIndex) || frameIndex <= start.lineFrameIndex)
    throw new Error("Wybierz lądowanie po klatce przed skokiem.");
  if (image.width !== start.imageWidth || image.height !== start.imageHeight)
    throw new Error("Zmienił się rozmiar obrazu. Wybierz ponownie klatkę przed skokiem.");
  const markers = findBallWiseCalibrationMarkers(image);
  if (!markers) throw new Error("Na klatce lądowania muszą być widoczne oba wzorce.");
  const result: AutomaticLongJumpCalibration = {
    ...start,
    method: "ballwise-marker-pose-v4",
    referenceWidthCm: 20,
    referenceDepthCm: 24,
    baselineCm: 300,
    landingReferenceCorners: orientStartMarker(markers.start.corners, markers.range.corners),
    landingRangeCorners: markers.range.corners,
    markerQuality: Math.min(start.markerQuality, markers.start.quality, markers.range.quality),
    heelFrameIndex: frameIndex,
    heel,
    heelSource: "manual",
    poseConfidence: 0,
  };
  // Zero means no pose estimate, not invented confidence. Geometry and camera
  // checks remain identical; the athlete explicitly identifies the heel.
  longJumpMeasurement(result);
  return result;
}
