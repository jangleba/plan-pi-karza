import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Sketch, type SketchKind } from "./Sketch";

/** Po przewinięciu dużego tytułu pokazuje się mały, rozmyty pasek u góry – jak w iOS. */
function useScrolledPast(px: number): boolean {
  const [past, setPast] = useState(false);
  useEffect(() => {
    let raf = 0;
    const on = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setPast(window.scrollY > px)); };
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => { window.removeEventListener("scroll", on); cancelAnimationFrame(raf); };
  }, [px]);
  return past;
}

/** Duży tytuł jak w aplikacjach Apple, z małym szkicem i zwijanym paskiem przy przewijaniu. */
export function LargeTitle({ title, sub, kind }: { title: string; sub?: ReactNode; kind?: SketchKind }) {
  const past = useScrolledPast(56);
  return (
    <>
    <div aria-hidden={!past}
      className={`fixed inset-x-0 top-0 z-20 border-b bg-card/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150 transition-all duration-200 ${past ? "border-hairline/80 opacity-100" : "pointer-events-none border-transparent opacity-0"}`}>
      <div className="mx-auto max-w-md py-3 text-center text-[15px] font-semibold">{title}</div>
    </div>
    <header className="bw-rise mb-6 flex items-end justify-between gap-3">
      <div>
        {sub && <p className="text-sm text-muted">{sub}</p>}
        <h1 className="text-[32px] font-semibold leading-tight tracking-tight">{title}</h1>
      </div>
      {kind && <Sketch kind={kind} className="h-12 w-12" />}
    </header>
    </>
  );
}

/** Pogrupowana lista (jak Ustawienia w iPhonie). */
export function Group({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      {label && <h2 className="mb-2 px-1 text-xs uppercase tracking-wide text-muted">{label}</h2>}
      <div className="overflow-hidden rounded-3xl border border-hairline bg-card">{children}</div>
    </section>
  );
}

export const rise = (i: number): CSSProperties => ({ animationDelay: `${Math.min(i, 10) * 40}ms` });

/** Wiersz listy: tytuł po lewej, szczegół i strzałka po prawej; dotknięcie otwiera kartę od dołu. */
export function ListRow({ title, sub, detail, accent, onTap, index = 0, lead }: {
  title: ReactNode; sub?: ReactNode; detail?: ReactNode; accent?: boolean; onTap?: () => void; index?: number; lead?: ReactNode;
}) {
  return (
    <button
      onClick={onTap}
      disabled={!onTap}
      style={rise(index)}
      className="bw-rise flex w-full items-center gap-4 border-b border-hairline px-5 py-4 text-left last:border-0 disabled:active:scale-100"
    >
      {lead}
      <span className="min-w-0 flex-1">
        <span className={`block text-base ${accent ? "font-semibold text-accent" : "font-medium"}`}>{title}</span>
        {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
      </span>
      {detail && <span className="shrink-0 text-sm text-muted">{detail}</span>}
      {onTap && <span className="shrink-0 text-lg leading-none text-accent">›</span>}
    </button>
  );
}

/** Pierścień postępu (0–1) z animacją wypełnienia. */
export function MiniRing({ value, label, center }: { value: number; label: string; center: ReactNode }) {
  const r = 34, c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center">
      <div className="relative h-24 w-24">
        <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
          <circle cx="40" cy="40" r={r} fill="none" stroke="var(--color-hairline)" strokeWidth="7" />
          <circle cx="40" cy="40" r={r} fill="none" stroke="var(--color-accent)" strokeWidth="7" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))} style={{ transition: "stroke-dashoffset 0.9s ease" }} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-base font-semibold tabular-nums">{center}</span>
      </div>
      <span className="mt-1.5 text-xs text-muted">{label}</span>
    </div>
  );
}
