import { PASTEL, type Pastel } from "./lib/pastel";

export type TileIconKind = "extra" | "today" | "goal" | "english";

/** Pastel każdego kafelka: mała, spokojna plamka koloru, żeby kafelki dało się odróżnić bez „kolorowania” całych kart. */
export const TILE_TONE: Record<TileIconKind, Pastel> = { extra: PASTEL.mint, today: PASTEL.peach, goal: PASTEL.lavender, english: PASTEL.blue };

const PATHS: Record<TileIconKind, string> = {
  extra: "M3 12h3.5l2.5-6 4 12 2.5-6H21",
  today: "M4.5 7.5h15v12h-15zM4.5 11h15M8.5 4.5v4M15.5 4.5v4",
  goal: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 12h.01",
  english: "M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 16.5h-7l-4 3v-3H5A1.5 1.5 0 0 1 3.5 15V7A1.5 1.5 0 0 1 5 5.5z",
};

/** Mała ikona liniowa w pastelowym kółku, do nagłówka kafelka. */
export function TileIcon({ kind }: { kind: TileIconKind }) {
  const t = TILE_TONE[kind];
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: t.s, boxShadow: `inset 0 0 0 1px ${t.c}` }} aria-hidden="true">
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke={t.i} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={PATHS[kind]} /></svg>
    </span>
  );
}

/** Nagłówek kafelka: ikona + podpis. */
export function TileHead({ kind, children }: { kind: TileIconKind; children: string }) {
  return <div className="flex items-center gap-2"><TileIcon kind={kind} /><h2 className="truncate text-[13px] text-muted">{children}</h2></div>;
}
