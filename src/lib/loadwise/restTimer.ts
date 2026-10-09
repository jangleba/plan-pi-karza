/** Parse only explicit durations; manual rest cues must not become invented times. */
export function parseRestDuration(label: string): number | null {
  const normalized = label.toLowerCase().replace(/,/g, ".");
  const minutes = /min|minute/.test(normalized);
  const seconds = /(?:\bs\b|sek|sec)/.test(normalized);
  if (!minutes && !seconds) return null;

  if (minutes && seconds) {
    const min = normalized.match(/(\d+(?:\.\d+)?)\s*min/);
    const sec = normalized.match(/(\d+(?:\.\d+)?)\s*(?:s\b|sek|sec)/);
    if (!min || !sec) return null;
    const duration = Math.round(Number(min[1]) * 60 + Number(sec[1]));
    return duration > 0 && duration <= 3600 ? duration : null;
  }

  const values = [...normalized.matchAll(/\d+(?:\.\d+)?/g)].map(([value]) =>
    Number(value),
  );
  if (values.length < 1 || values.length > 2) return null;
  const duration = Math.round(
    (values.reduce((sum, value) => sum + value, 0) / values.length) *
      (minutes ? 60 : 1),
  );
  return duration > 0 && duration <= 3600 ? duration : null;
}

export function formatRestTime(seconds: number): string {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
