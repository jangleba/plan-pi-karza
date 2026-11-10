import type { SessionDay } from "../types";
import { professionalSessionTitle } from "../labels";

/**
 * Header of the session screen: "Całe ciało B" over "Siłownia · 40 min · Umiarkowana".
 * The category moves from the unified title ("Siła: całe ciało B") into the
 * meta line, so the title is not repeated and stays short.
 */
export interface SessionHeading {
  title: string;
  category: string | null;
  meta: string[];
  /** Short, unambiguous label for switching between two sessions of one day. */
  short: string;
}

const CATEGORY_NAMES: Record<string, string> = {
  Siła: "Siła",
  Sprint: "Sprint",
  Bieg: "Bieg",
  Piłka: "Piłka",
};

const INTENSITY: Record<string, string> = {
  niska: "Lekko",
  umiarkowana: "Umiarkowanie",
  wysoka: "Mocno",
};

function upperFirst(text: string) {
  return text.charAt(0).toLocaleUpperCase("pl-PL") + text.slice(1);
}

export function sessionHeading(session: SessionDay): SessionHeading {
  const unified = professionalSessionTitle(session.title);
  const split = unified.match(/^([^:]+):\s*(.+)$/);
  const prefix = split?.[1]?.trim() ?? null;
  const known = prefix ? CATEGORY_NAMES[prefix] : undefined;
  const title = known && split ? upperFirst(split[2].trim()) : unified;
  const gym = known === "Siła" && !/bez sprzętu|w domu/i.test(unified);
  const category = known ? (gym ? "Siłownia" : known) : null;
  const meta = [
    category,
    session.durationMin > 0 ? `${Math.round(session.durationMin)} min` : null,
    INTENSITY[session.intensity] ?? null,
  ].filter((part): part is string => Boolean(part));
  return { title, category, meta, short: known ?? unified };
}

/** Two sessions of one day get labels that differ, e.g. "Siła" and "Regeneracja". */
export function slotLabels(first: SessionDay, second: SessionDay): [string, string] {
  const a = sessionHeading(first);
  const b = sessionHeading(second);
  if (a.short !== b.short) return [a.short, b.short];
  if (a.title !== b.title) return [a.title, b.title];
  return [`${a.short} 1`, `${b.short} 2`];
}
