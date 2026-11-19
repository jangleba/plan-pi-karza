import type { ClubView } from "./clubs";

/** Kolory (HEX) odpowiadające klasom .bw-t0…5 – do rysowania w SVG. */
export const TINT_FILL = ["#cfe3fa", "#c9ecd8", "#fbd9bf", "#ddd3f7", "#f7cfe0", "#f9e6a6"] as const;
export const TINT_INK = ["#245a94", "#2e7a51", "#a8571f", "#5a4a9c", "#a2406b", "#8a6a12"] as const;

/** Stały odcień z identyfikatora (ten sam klub zawsze ma ten sam kolor). */
export function tintOf(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (Math.imul(h, 31) + id.charCodeAt(i)) >>> 0;
  return h % 6;
}

const PREFIX = /^(ks|uks|lks|mks|gks|mlks|aks|ap|fc|sp|zs|ckf|kp|mks|tks|ks\.)$/i;

/** Inicjały klubu do awatara: pomija przedrostki KS/UKS/LKS…, bierze pierwsze litery dwóch kolejnych słów. */
export function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} -]/gu, " ").split(/[\s-]+/).filter(Boolean);
  const main = words.filter((w) => !PREFIX.test(w));
  if (!main.length) return name.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2).toUpperCase() || "?";
  const pick = main.slice(0, 2);
  // jedno znaczące słowo (np. „MKS Myślenice”) → dwie pierwsze litery, żeby awatary się różniły
  const out = pick.length === 1 ? pick[0]![0]!.toUpperCase() + (pick[0]![1] ?? "").toLowerCase() : pick.map((w) => w[0]!.toUpperCase()).join("");
  return out;
}

export interface Dot { id: string; x: number; y: number; angle: number; distanceKm: number; tint: number; label: string; name: string }

export const CENTER = 150;
export const RADIUS = 128;
/** Szerokość widoku dla „cała Polska”. */
export const POLAND_KM = 400;

/**
 * Położenie klubów na radarze: kierunek geograficzny (północ u góry) i odległość w skali promienia.
 * Kropki nie nakładają się (lekkie rozsunięcie po okręgu), a ich liczba jest ograniczona.
 */
export function radarDots(place: { lat: number; lon: number }, clubs: ClubView[], maxKm: number, limit = 12): Dot[] {
  const cosLat = Math.cos((place.lat * Math.PI) / 180);
  const dots: Dot[] = [];
  for (const v of clubs.slice(0, limit)) {
    const c = v.club;
    if (c.lat == null || c.lon == null) continue;
    const dx = (c.lon - place.lon) * cosLat * 111.32, dy = (c.lat - place.lat) * 110.57;
    const dist = Math.hypot(dx, dy);
    const angle = dist < 0.5 ? (tintOf(c.id) / 6) * 2 * Math.PI : Math.atan2(dx, dy);
    dots.push({ id: c.id, x: 0, y: 0, angle, distanceKm: v.distanceKm ?? Math.round(dist), tint: tintOf(c.id), label: initials(c.name), name: c.name });
  }
  const place1 = (d: Dot) => {
    const r = Math.max(30, Math.min(RADIUS - 14, (d.distanceKm / maxKm) * RADIUS));
    d.x = Math.round((CENTER + Math.sin(d.angle) * r) * 10) / 10;
    d.y = Math.round((CENTER - Math.cos(d.angle) * r) * 10) / 10;
    return r;
  };
  const radii = dots.map(place1);
  for (let pass = 0; pass < 12; pass++) {
    let moved = false;
    for (let i = 0; i < dots.length; i++) for (let j = i + 1; j < dots.length; j++) {
      const a = dots[i]!, b = dots[j]!;
      if (Math.hypot(a.x - b.x, a.y - b.y) < 30) { b.angle += 0.22; place1(b); moved = true; }
    }
    if (!moved) break;
  }
  void radii;
  return dots;
}

/** Okręgi pomocnicze: ćwiartki promienia. */
export const ringsFor = (maxKm: number): number[] => [0.25, 0.5, 0.75, 1].map((f) => Math.round(maxKm * f));
