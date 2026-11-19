import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Karta wysuwana od dołu (wspólna dla całej aplikacji), jak w iOS:
 * przeciągnięcie uchwytu w dół zamyka, zamykanie jest animowane, tło się nie przewija.
 */
export function Sheet({ title, onClose, children, dismissable = true }: {
  title?: ReactNode; onClose: () => void; children: ReactNode; dismissable?: boolean;
}) {
  const [closing, setClosing] = useState(false);
  const [drag, setDrag] = useState(0);
  const start = useRef<{ y: number; t: number } | null>(null);

  const close = useCallback(() => {
    if (!dismissable) return;
    setClosing(true);
    setTimeout(onClose, 220);
  }, [onClose, dismissable]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [close]);

  const down = (e: React.PointerEvent) => {
    if (!dismissable) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    start.current = { y: e.clientY, t: performance.now() };
  };
  const move = (e: React.PointerEvent) => { if (start.current) setDrag(Math.max(0, e.clientY - start.current.y)); };
  const up = (e: React.PointerEvent) => {
    if (!start.current) return;
    const dy = e.clientY - start.current.y;
    const v = dy / Math.max(1, performance.now() - start.current.t); // px/ms
    start.current = null;
    if (dy > 110 || v > 0.6) close(); else setDrag(0);
  };

  return (
    <div className={`${closing ? "bw-backdrop-out" : "bw-backdrop"} fixed inset-0 z-30 flex items-end bg-black/25`} onClick={close}>
      <div
        className={`${closing ? "bw-sheet-out" : "bw-sheet"} max-h-[88vh] w-full overflow-y-auto overscroll-contain rounded-t-[28px] bg-card px-5 pb-[max(2.5rem,env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(0,0,0,0.08)]`}
        style={drag ? { transform: `translateY(${drag}px)`, transition: "none" } : { transition: "transform 0.25s cubic-bezier(0.2,0.8,0.2,1)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 -mx-5 touch-none bg-card px-5 pb-2 pt-3" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <div className="mx-auto h-1.5 w-10 rounded-full bg-hairline" />
          {title && <h2 className="mt-4 text-xl font-semibold tracking-tight">{title}</h2>}
        </div>
        <div className="pt-2">{children}</div>
      </div>
    </div>
  );
}
