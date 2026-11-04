import type { Profile } from "./types";
import type { prepareMonthlyPlan } from "./persist";
export type ProfileSaveStage = "consents" | "generation" | "saving" | "verification";
export const PROFILE_SAVE_LABELS: Record<ProfileSaveStage, string> = {
  consents: "Zapisuję ustawienia…",
  generation: "Układam Twój plan…",
  saving: "Zapisuję plan…",
  verification: "Sprawdzam zapis…",
};
export interface ProfileSaveAttempt {
  key: string;
  profile: Profile;
  revision: string;
  expectedRevision: string | null;
  consentsDone?: boolean;
  consentIndex?: number;
  prepared?: ReturnType<typeof prepareMonthlyPlan>;
  uncertain?: boolean;
}
export interface ProfileSaveRefs {
  attempt: ProfileSaveAttempt | null;
  flight: Promise<void> | null;
  key: string | null;
}
export class ProfileSaveTimeout extends Error {
  constructor(public stage: ProfileSaveStage) {
    super(
      stage === "saving"
        ? "Serwer nie potwierdził jeszcze zapisu planu."
        : "Odpowiedź serwera trwa zbyt długo. Twoje odpowiedzi pozostają w formularzu.",
    );
    this.name = "ProfileSaveTimeout";
  }
}
export function profileCommandKey(
  ownerId: string,
  profile: Profile,
  consents?: Record<string, boolean>,
) {
  const {
    createdAt: _createdAt,
    serverProfileUpdatedAt: _updatedAt,
    onboardingRevision: _revision,
    ...input
  } = profile;
  void _createdAt;
  void _updatedAt;
  void _revision;
  const normalize = (x: unknown): unknown =>
    Array.isArray(x)
      ? x.map(normalize)
      : x && typeof x === "object"
        ? Object.fromEntries(
            Object.entries(x)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => [k, normalize(v)]),
          )
        : x;
  return JSON.stringify(normalize({ ownerId, input, consents }));
}
/** Cancels supported requests as well as bounding thenables; aborted writes may still commit remotely. */
export async function withProfileDeadline<T>(
  stage: ProfileSaveStage,
  ms: number,
  task: (signal: AbortSignal) => PromiseLike<T>,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => task(controller.signal)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => {
            reject(new ProfileSaveTimeout(stage));
            controller.abort();
          },
          Math.max(1, ms),
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export function cancellableRequest<T>(
  request: PromiseLike<T>,
  signal: AbortSignal,
): PromiseLike<T> {
  const query = request as PromiseLike<T> & {
    abortSignal?: (s: AbortSignal) => PromiseLike<T>;
    retry?: (v: boolean) => PromiseLike<T>;
  };
  const noRetry = typeof query.retry === "function" ? query.retry(false) : query;
  return typeof (noRetry as typeof query).abortSignal === "function"
    ? (noRetry as typeof query).abortSignal!(signal)
    : noRetry;
}
