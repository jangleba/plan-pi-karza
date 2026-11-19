import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

const portraitNow = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(orientation: portrait)").matches : true);

/**
 * Pełny ekran „poziomo”: gdy telefon jest ustawiony pionowo, treść jest obrócona o 90°, więc da się z niej korzystać
 * od razu (Safari nie pozwala wymusić orientacji); po obróceniu telefonu wraca na normalny pełny ekran.
 */
export function Landscape({ children, bg = "#1d1d1f" }: { children: ReactNode; bg?: string }) {
  const [portrait, setPortrait] = useState(portraitNow);
  useEffect(() => {
    const mq = window.matchMedia("(orientation: portrait)");
    const f = () => setPortrait(mq.matches);
    mq.addEventListener("change", f);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { mq.removeEventListener("change", f); document.body.style.overflow = prev; };
  }, []);
  const style: CSSProperties = portrait
    ? { position: "fixed", top: 0, left: "100vw", width: "100dvh", height: "100vw", transform: "rotate(90deg)", transformOrigin: "top left" }
    : { position: "fixed", inset: 0 };
  return <div className="z-50 overflow-hidden text-white" style={{ ...style, background: bg, zIndex: 60 }}>{children}</div>;
}
