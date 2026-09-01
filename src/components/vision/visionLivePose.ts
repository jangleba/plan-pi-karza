import {
  POSE,
  type FramePose,
  type Landmark,
  type TestType,
} from "@/features/vision-analysis/types";

const LEFT_EAR = 7;
const RIGHT_EAR = 8;

export interface LivePoseStatus {
  detected: boolean;
  singleAthlete: boolean;
  fullBody: boolean;
  timingReady: boolean;
  mechanicsReady: boolean;
  confidence: number;
  silhouetteFraction: number;
}

export const EMPTY_LIVE_POSE_STATUS: LivePoseStatus = {
  detected: false,
  singleAthlete: false,
  fullBody: false,
  timingReady: false,
  mechanicsReady: false,
  confidence: 0,
  silhouetteFraction: 0,
};

const DISTANCE_TESTS = new Set<TestType>(["sprint_20m", "sprint_30m", "flying_sprint"]);

/** Sprint wymaga szerszego kadru, a skok większej sylwetki do oceny stawów. */
export function isLivePoseReadyForTest(status: LivePoseStatus, testType: TestType): boolean {
  if (!status.detected || !status.singleAthlete || !status.fullBody) return false;
  return DISTANCE_TESTS.has(testType) ? status.timingReady : status.mechanicsReady;
}

function visible(point: Landmark | undefined, threshold = 0.35): point is Landmark {
  return !!point && point.visibility >= threshold;
}

function safelyInFrame(point: Landmark | undefined): point is Landmark {
  return visible(point) && point.x >= 0.02 && point.x <= 0.98 && point.y >= 0.02 && point.y <= 0.98;
}

function completeSideChain(landmarks: Landmark[], side: "left" | "right"): boolean {
  const indices =
    side === "left"
      ? [POSE.LEFT_SHOULDER, POSE.LEFT_HIP, POSE.LEFT_KNEE, POSE.LEFT_ANKLE]
      : [POSE.RIGHT_SHOULDER, POSE.RIGHT_HIP, POSE.RIGHT_KNEE, POSE.RIGHT_ANKLE];
  const heel = landmarks[side === "left" ? POSE.LEFT_HEEL : POSE.RIGHT_HEEL];
  const toe = landmarks[side === "left" ? POSE.LEFT_FOOT_INDEX : POSE.RIGHT_FOOT_INDEX];
  return (
    indices.every((index) => safelyInFrame(landmarks[index])) &&
    (safelyInFrame(heel) || safelyInFrame(toe))
  );
}

export function getLivePoseStatus(pose: FramePose): LivePoseStatus {
  const landmarks = pose.landmarks;
  if (!landmarks) return EMPTY_LIVE_POSE_STATUS;

  const headVisible = [POSE.NOSE, LEFT_EAR, RIGHT_EAR].some((index) =>
    safelyInFrame(landmarks[index]),
  );
  const fullBody =
    headVisible && (completeSideChain(landmarks, "left") || completeSideChain(landmarks, "right"));
  const topCandidates = [
    landmarks[POSE.NOSE],
    landmarks[LEFT_EAR],
    landmarks[RIGHT_EAR],
    landmarks[POSE.LEFT_SHOULDER],
    landmarks[POSE.RIGHT_SHOULDER],
  ]
    .filter((point) => visible(point))
    .map((point) => point.y);
  const bottomCandidates = [
    landmarks[POSE.LEFT_ANKLE],
    landmarks[POSE.RIGHT_ANKLE],
    landmarks[POSE.LEFT_HEEL],
    landmarks[POSE.RIGHT_HEEL],
    landmarks[POSE.LEFT_FOOT_INDEX],
    landmarks[POSE.RIGHT_FOOT_INDEX],
  ]
    .filter((point) => visible(point))
    .map((point) => point.y);
  const top = topCandidates.length > 0 ? Math.min(...topCandidates) : 0;
  const bottom = bottomCandidates.length > 0 ? Math.max(...bottomCandidates) : 0;
  const silhouetteFraction = Math.max(0, bottom - top);
  const singleAthlete = pose.peopleCount === 1;
  const timingReady =
    singleAthlete &&
    fullBody &&
    pose.trackingConfidence >= 0.35 &&
    silhouetteFraction >= 0.08 &&
    silhouetteFraction <= 0.72;
  const mechanicsReady =
    singleAthlete &&
    fullBody &&
    pose.trackingConfidence >= 0.45 &&
    silhouetteFraction >= 0.3 &&
    silhouetteFraction <= 0.85;

  return {
    detected: true,
    singleAthlete,
    fullBody,
    timingReady,
    mechanicsReady,
    confidence: pose.trackingConfidence,
    silhouetteFraction,
  };
}
