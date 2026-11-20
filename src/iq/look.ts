import { scoped } from "../lib/store";

/**
 * Wygląd własnego zawodnika w IQ: cechy wyglądu, numer, kolor stroju drużyny i buty. Dane tylko na urządzeniu (klucz `look`),
 * bez synchronizacji. Odczyt jest walidowany: stary lub uszkodzony zapis wraca do wartości domyślnych pole po polu.
 */
export interface PlayerLook {
  skin: number; hairStyle: number; hairColor: number; build: number; height: number; number: number; teamColor: number; boots: number;
}

export const SKINS = [0xf0cdb0, 0xe8bf9a, 0xd9a77c, 0xb57e55, 0x8a5b3c, 0x5e3b27] as const;
export const HAIR_COLORS = [0x151515, 0x2b2118, 0x4a3426, 0x8a6a3b, 0xc9a24d, 0x9a3b22, 0xd9d9d9] as const;
export const HAIR_STYLES = ["Krótkie", "Bardzo krótkie", "Dłuższe", "Kucyk", "Afro", "Łysy"] as const;
export const BUILDS = [["Smukła", 0.93], ["Atletyczna", 1], ["Mocna", 1.1]] as const;
export const HEIGHTS = [["Niższy", 0.95], ["Średni", 1], ["Wyższy", 1.05]] as const;
export const BOOTS = [0x17181a, 0xf1f3f5, 0x2f6fb3, 0xe0554f, 0xe0b23a, 0x4fbf6a] as const;

export interface TeamKit { name: string; jersey: number; shorts: number; socks: number; collar: number }
export const TEAM_COLORS: TeamKit[] = [
  { name: "Niebieski", jersey: 0x2f6fb3, shorts: 0xffffff, socks: 0x2f6fb3, collar: 0xffffff },
  { name: "Zielony", jersey: 0x2f9e62, shorts: 0xffffff, socks: 0x2f9e62, collar: 0xffffff },
  { name: "Żółty", jersey: 0xe0b23a, shorts: 0x1d1d1f, socks: 0xe0b23a, collar: 0x1d1d1f },
  { name: "Biały", jersey: 0xf1f3f5, shorts: 0x1d1d1f, socks: 0xf1f3f5, collar: 0x2f6fb3 },
  { name: "Pomarańczowy", jersey: 0xe07a2f, shorts: 0x1d1d1f, socks: 0xe07a2f, collar: 0xffffff },
  { name: "Fioletowy", jersey: 0x7b4fc0, shorts: 0xffffff, socks: 0x7b4fc0, collar: 0xffffff },
];

/** Strój rywali: czerwony, a gdy nasz strój jest pomarańczowy (zbyt podobny) – granatowy. */
export function opponentKit(teamColor: number): TeamKit {
  const orange = TEAM_COLORS[teamColor]?.name === "Pomarańczowy";
  return orange
    ? { name: "Granatowy", jersey: 0x2b3a55, shorts: 0x1d1d1f, socks: 0x2b3a55, collar: 0x1d1d1f }
    : { name: "Czerwony", jersey: 0xc8443f, shorts: 0x1d1d1f, socks: 0xc8443f, collar: 0x1d1d1f };
}

export const DEFAULT_LOOK: PlayerLook = { skin: 1, hairStyle: 0, hairColor: 1, build: 1, height: 1, number: 8, teamColor: 0, boots: 0 };
export const LOOK_KEY = "look";

const idx = (v: unknown, n: number, d: number) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < n ? v : d);

/** Poprawny wygląd z dowolnych danych (brakujące lub błędne pola dostają wartości domyślne). */
export function sanitizeLook(raw: unknown): PlayerLook {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_LOOK;
  return {
    skin: idx(r.skin, SKINS.length, d.skin),
    hairStyle: idx(r.hairStyle, HAIR_STYLES.length, d.hairStyle),
    hairColor: idx(r.hairColor, HAIR_COLORS.length, d.hairColor),
    build: idx(r.build, BUILDS.length, d.build),
    height: idx(r.height, HEIGHTS.length, d.height),
    number: typeof r.number === "number" && Number.isInteger(r.number) && r.number >= 1 && r.number <= 99 ? r.number : d.number,
    teamColor: idx(r.teamColor, TEAM_COLORS.length, d.teamColor),
    boots: idx(r.boots, BOOTS.length, d.boots),
  };
}

export function loadLook(): PlayerLook {
  try { return sanitizeLook(JSON.parse(scoped.getItem(LOOK_KEY) ?? "null")); } catch { return DEFAULT_LOOK; }
}
export function saveLook(l: PlayerLook): void { scoped.setItem(LOOK_KEY, JSON.stringify(sanitizeLook(l))); }
