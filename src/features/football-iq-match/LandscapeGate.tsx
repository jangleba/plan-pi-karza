import { useEffect, useState } from "react";
import { RotateCw } from "lucide-react";
import "./landscape-gate.css";

const QUERY = "(orientation: landscape)";
const canQuery = () => typeof window !== "undefined" && typeof window.matchMedia === "function";

/** True when the screen is wider than tall. Where it cannot be asked (tests), the screen is fine. */
export function useLandscape(): boolean {
  const [landscape, setLandscape] = useState(() =>
    canQuery() ? window.matchMedia(QUERY).matches : true,
  );
  useEffect(() => {
    if (!canQuery()) return;
    const media = window.matchMedia(QUERY);
    const update = () => setLandscape(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);
  return landscape;
}

/** The live games are played with the phone on its side: upright, the game waits behind this. */
export function LandscapeGate({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="iq-landscape-gate" role="alert">
      <RotateCw size={34} aria-hidden="true" />
      <strong>Obróć telefon poziomo</strong>
      <p>Ta gra działa tylko w poziomie. Gra jest wstrzymana, zacznie się po obróceniu.</p>
    </div>
  );
}
