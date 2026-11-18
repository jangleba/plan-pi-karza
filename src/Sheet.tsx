import { useEffect, type ReactNode } from "react";

/** Karta wysuwana od dołu (wspólna dla całej aplikacji). */
export function Sheet({ title, onClose, children }: { title?: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="bw-backdrop fixed inset-0 z-30 flex items-end bg-black/25" onClick={onClose}>
      <div className="bw-sheet max-h-[88vh] w-full overflow-y-auto rounded-t-3xl bg-card px-5 pb-10 pt-3 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-hairline" />
        {title && <h2 className="mb-4 text-xl font-semibold tracking-tight">{title}</h2>}
        {children}
      </div>
    </div>
  );
}
