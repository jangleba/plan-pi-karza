/**
 * Countdown state measured against an end time, so a locked phone or an app
 * returning from the background shows the true remaining time instead of a
 * paused interval counter. Pure functions; the components own the ticking.
 */
export interface Countdown {
  /** Epoch ms when the countdown reaches zero; null while paused. */
  endsAt: number | null;
  /** Seconds left at the moment of pausing; used only while paused. */
  pausedLeft: number | null;
  total: number;
  label: string;
  /** Changes with every new start, so the same rest can be restarted. */
  id: number;
  /** Second line under the label, e.g. the next set's load ("60 kg × 8"). */
  detail?: string;
  /** Step that started the rest between its own sets; absent for a rest before another exercise. */
  stepKey?: string;
}

export function startCountdown(
  seconds: number,
  label: string,
  now = Date.now(),
  id = now,
  extra: { detail?: string; stepKey?: string } = {},
): Countdown {
  const total = Math.max(1, Math.min(7200, Math.round(seconds)));
  const countdown: Countdown = { endsAt: now + total * 1000, pausedLeft: null, total, label, id };
  if (extra.detail) countdown.detail = extra.detail.slice(0, 120);
  if (extra.stepKey) countdown.stepKey = extra.stepKey.slice(0, 200);
  return countdown;
}

export function remainingSeconds(countdown: Countdown, now = Date.now()): number {
  if (countdown.endsAt === null) return Math.max(0, countdown.pausedLeft ?? 0);
  return Math.max(0, Math.ceil((countdown.endsAt - now) / 1000));
}

export function pauseCountdown(countdown: Countdown, now = Date.now()): Countdown {
  if (countdown.endsAt === null) return countdown;
  return { ...countdown, endsAt: null, pausedLeft: remainingSeconds(countdown, now) };
}

export function resumeCountdown(countdown: Countdown, now = Date.now()): Countdown {
  if (countdown.endsAt !== null) return countdown;
  return { ...countdown, endsAt: now + (countdown.pausedLeft ?? 0) * 1000, pausedLeft: null };
}

export function extendCountdown(
  countdown: Countdown,
  seconds: number,
  now = Date.now(),
): Countdown {
  // Shortening never goes below zero and keeps a valid total, so the stored rest stays readable.
  const left = Math.max(0, Math.min(7200, remainingSeconds(countdown, now) + seconds));
  const total = Math.max(1, Math.min(7200, countdown.total + seconds), left);
  return countdown.endsAt === null
    ? { ...countdown, pausedLeft: left, total }
    : { ...countdown, endsAt: now + left * 1000, total };
}

export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

export function parseCountdown(value: unknown): Countdown | undefined {
  if (!value || typeof value !== "object") return undefined;
  const c = value as Countdown;
  const okEnd = c.endsAt === null || (Number.isFinite(c.endsAt) && c.endsAt > 0);
  const okPause = c.pausedLeft === null || (Number.isFinite(c.pausedLeft) && c.pausedLeft >= 0);
  if (
    !okEnd ||
    !okPause ||
    !Number.isFinite(c.total) ||
    c.total <= 0 ||
    c.total > 7200 ||
    typeof c.label !== "string" ||
    c.label.length > 120 ||
    !Number.isFinite(c.id) ||
    (c.detail !== undefined && (typeof c.detail !== "string" || c.detail.length > 120)) ||
    (c.stepKey !== undefined && (typeof c.stepKey !== "string" || c.stepKey.length > 200))
  )
    return undefined;
  return c;
}
