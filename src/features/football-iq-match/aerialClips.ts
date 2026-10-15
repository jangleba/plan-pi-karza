export type AerialAnimation = "long-kick" | "header";
export type AerialCalibration = {
  sha256: string;
  fps: 30;
  durationSeconds: number;
  contactFrame: number;
  takeoffFrame?: number;
  landingFrame?: number;
  // Ball centre relative to the player root, measured at the contact frame.
  // Uses the displayed Y Bot scale (height 6.8), not FBX centimetres.
  contact: { lateral: number; forward: number; height: number };
};
export type AerialCalibrations = Partial<Record<AerialAnimation, AerialCalibration>>;
export const aerialAnimationNames: readonly AerialAnimation[] = ["long-kick", "header"];

// Intentionally empty until the actual Y Bot exports have been inspected.
// Adding an FBX alone must never enable an uncalibrated kick or jumping header.
export const aerialCalibrations: AerialCalibrations = {};

export function validateAerialCalibration(
  name: AerialAnimation,
  value: AerialCalibration,
  actual?: { sha256: string; durationSeconds: number },
) {
  const contact = value?.contact;
  if (
    !value ||
    !/^[a-f0-9]{64}$/.test(value.sha256) ||
    value.fps !== 30 ||
    !Number.isFinite(value.durationSeconds) ||
    value.durationSeconds < 0.4 ||
    value.durationSeconds > 10 ||
    !Number.isInteger(value.contactFrame) ||
    value.contactFrame < 3 ||
    value.contactFrame / value.fps > value.durationSeconds - 0.1 ||
    !contact ||
    ![contact.lateral, contact.forward, contact.height].every(Number.isFinite) ||
    Math.abs(contact.lateral) > 10 ||
    Math.abs(contact.forward) > 10 ||
    contact.height < (name === "header" ? 5 : 0.5) ||
    contact.height > (name === "header" ? 12 : 3)
  )
    throw new Error(`Nieprawidłowa kalibracja animacji ${name}.`);
  if (
    name === "header" &&
    (!Number.isInteger(value.takeoffFrame) ||
      !Number.isInteger(value.landingFrame) ||
      value.takeoffFrame! < 1 ||
      value.takeoffFrame! >= value.contactFrame ||
      value.landingFrame! <= value.contactFrame ||
      value.landingFrame! / value.fps > value.durationSeconds - 1 / value.fps)
  )
    throw new Error("Główka wymaga klatek wybicia, kontaktu i lądowania.");
  if (
    actual &&
    (actual.sha256 !== value.sha256 ||
      !Number.isFinite(actual.durationSeconds) ||
      Math.abs(actual.durationSeconds - value.durationSeconds) > 1 / 60)
  )
    throw new Error(`Plik ${name} nie odpowiada skalibrowanej wersji.`);
  return {
    duration: value.durationSeconds,
    contact: value.contactFrame / value.fps,
    recovery: value.durationSeconds - value.contactFrame / value.fps,
  };
}
