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
