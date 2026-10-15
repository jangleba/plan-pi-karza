export type AccountOwnerType = "athlete" | "guardian";
export type SubscriptionPayerType = "self" | "guardian";
export type OwnershipTransferStatus =
  | "not_applicable"
  | "not_requested"
  | "pending"
  | "completed";

export const MIN_PERSONALIZED_AGE = 13;
export const SELF_CONSENT_AGE = 16;
export const ADULT_AGE = 18;

function asUtcDate(value: string | Date): Date | null {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return Number.isFinite(date.getTime()) ? date : null;
}

/** Pełne lata w danym dniu. Daty liczymy w UTC, żeby strefa telefonu nie zmieniała progu wieku. */
export function ageOnDate(birthDate: string, onDate: string | Date = new Date()): number | null {
  const born = asUtcDate(birthDate);
  const now = asUtcDate(onDate);
  if (!born || !now || born > now) return null;
  let age = now.getUTCFullYear() - born.getUTCFullYear();
  const birthdayPassed =
    now.getUTCMonth() > born.getUTCMonth() ||
    (now.getUTCMonth() === born.getUTCMonth() && now.getUTCDate() >= born.getUTCDate());
  if (!birthdayPassed) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

export function birthDateForApproximateAge(age: number, onDate: Date = new Date()): string {
  const safeAge = Math.max(0, Math.min(120, Math.floor(age)));
  const year = onDate.getUTCFullYear() - safeAge;
  const month = String(onDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(onDate.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export interface AgeAccessPolicy {
  age: number;
  personalizedAccountAllowed: boolean;
  guardianMustOwnAccount: boolean;
  athleteMayOwnAccount: boolean;
  adultPayerRequired: boolean;
  transferMayBeOffered: boolean;
}

export function policyForAge(age: number): AgeAccessPolicy {
  return {
    age,
    personalizedAccountAllowed: age >= MIN_PERSONALIZED_AGE,
    guardianMustOwnAccount: age >= MIN_PERSONALIZED_AGE && age < SELF_CONSENT_AGE,
    athleteMayOwnAccount: age >= SELF_CONSENT_AGE,
    adultPayerRequired: age < ADULT_AGE,
    transferMayBeOffered: age >= SELF_CONSENT_AGE && age < ADULT_AGE,
  };
}

export function accountSetupIsAllowed(input: {
  age: number;
  accountOwnerType: AccountOwnerType;
  guardianEmailVerified: boolean;
  guardianDeclarationAccepted: boolean;
}): boolean {
  const policy = policyForAge(input.age);
  if (!policy.personalizedAccountAllowed) return false;
  if (input.age >= ADULT_AGE) return input.accountOwnerType === "athlete";
  if (!policy.guardianMustOwnAccount) return true;
  return (
    input.accountOwnerType === "guardian" &&
    input.guardianEmailVerified &&
    input.guardianDeclarationAccepted
  );
}

export function accountRoleLabel(owner: AccountOwnerType, age: number): string {
  if (owner === "guardian") {
    return age < SELF_CONSENT_AGE
      ? "Konto rodzica lub opiekuna · profil zawodnika"
      : "Konto opiekuna · profil zawodnika może zostać przekazany";
  }
  return age < ADULT_AGE ? "Konto zawodnika 16–17" : "Konto dorosłego zawodnika";
}
