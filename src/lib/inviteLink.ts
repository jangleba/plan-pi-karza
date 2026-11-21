import { ALL_DRILLS, decodeInvite, type Invite } from "../engine";

const KEY = "invite";

/** Zaproszenie z adresu strony (?invite=…) albo null; nie zmienia adresu. */
export function readInviteParam(): Invite | null {
  try {
    const p = new URLSearchParams(window.location.search).get(KEY);
    return decodeInvite(p, ALL_DRILLS.map((d) => d.id));
  } catch { return null; }
}

/** Usuwa parametr zaproszenia z adresu (po zamknięciu zaproszenia), żeby odświeżenie go nie otwierało ponownie. */
export function clearInviteParam(): void {
  try {
    const u = new URL(window.location.href);
    if (!u.searchParams.has(KEY)) return;
    u.searchParams.delete(KEY);
    window.history.replaceState(null, "", u.pathname + (u.search ? u.search : "") + u.hash);
  } catch { /* bez zmiany adresu */ }
}
