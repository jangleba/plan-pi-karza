import type { ActorKit } from "./actors";
import { BOOTS, BUILDS, HAIR_COLORS, HEIGHTS, SKINS, TEAM_COLORS, type PlayerLook } from "./look";

/** Strój i wygląd aktora z zapisanego wyglądu zawodnika (kolor stroju drużyny, numer, skóra, włosy, budowa, wzrost, buty). */
export function kitFromLook(l: PlayerLook, extra: Partial<ActorKit> = {}): ActorKit {
  const t = TEAM_COLORS[l.teamColor]!;
  return {
    jersey: t.jersey, shorts: t.shorts, socks: t.socks, collar: t.collar, number: l.number,
    look: { skin: SKINS[l.skin]!, hair: HAIR_COLORS[l.hairColor]!, hairStyle: l.hairStyle, thick: BUILDS[l.build]![1], height: HEIGHTS[l.height]![1], boots: BOOTS[l.boots]! },
    ...extra,
  };
}
