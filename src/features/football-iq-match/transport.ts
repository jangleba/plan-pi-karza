import type { Playback } from "./playback";

export function clampProgress(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

/** Events use the same clock as the player and ball animation. */
export function currentPlaybackStep(playback: Playback, progress: number, actions: number) {
  if (!actions) return 0;
  const time = clampProgress(progress) * playback.duration;
  return Math.min(
    actions - 1,
    Math.max(
      0,
      playback.simulation?.events.find((e) => e.time > time + 0.0001)?.actionIndex ??
        playback.simulation?.events.at(-1)?.actionIndex ??
        actions - 1,
    ),
  );
}
