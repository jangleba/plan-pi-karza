/**
 * URL search keys of the training panel. Kept apart from SessionSheet so the
 * route definitions (loaded at startup) do not pull the panel, the drawer and
 * its dependencies into the startup code.
 */

/** Search keys that keep the open training panel in the URL (back closes it). */
export interface SessionSheetSearch {
  sesja?: string;
  slot?: 1 | 2;
  mod?: string;
}

export function parseSessionSheetSearch(search: Record<string, unknown>): SessionSheetSearch {
  const sesja =
    typeof search.sesja === "string" && /^\d{4}-\d{2}-\d{2}$/.test(search.sesja)
      ? search.sesja
      : undefined;
  if (!sesja) return {};
  return {
    sesja,
    slot: Number(search.slot) === 2 ? 2 : 1,
    mod: typeof search.mod === "string" && search.mod ? search.mod : undefined,
  };
}
