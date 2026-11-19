import type { BuildTask, Phrase } from "./types";

/** Normalizacja do porównań: wielkość liter, typograficzne apostrofy, interpunkcja i odstępy nie mają znaczenia. */
export const normalizeText = (s: string): string =>
  s.toLowerCase().replace(/[’‘`]/g, "'").replace(/[.,!?;:"“”„()]/g, " ").replace(/\s+/g, " ").trim();

/** Czy ułożone słowa tworzą któreś z akceptowanych zdań. */
export function checkBuild(task: BuildTask, placed: string[]): boolean {
  const got = normalizeText(placed.join(" "));
  return placed.length > 0 && task.answers.some((a) => normalizeText(a.join(" ")) === got);
}

/** Zdanie wzorcowe do pokazania po błędzie (pierwsze akceptowane ułożenie, z dużą literą i kropką). */
export function modelAnswer(task: BuildTask): string {
  const s = task.answers[0]!.join(" ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a: number) {
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Powtarzalne mieszanie (ten sam ziarno = ta sama kolejność), żeby ekran nie „skakał” po ponownym wyrenderowaniu. */
export function seededShuffle<T>(arr: readonly T[], seed: string): T[] {
  const out = [...arr];
  const rnd = mulberry32(hash(seed));
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j]!, out[i]!]; }
  return out;
}

/** Opcje pytania w losowej, ale stałej dla danego ziarna kolejności; poprawna odpowiedź nie jest zawsze pierwsza. */
export const checkOptions = (p: Phrase, salt: string): string[] => seededShuffle([p.check.correct, ...p.check.wrong], `${p.id}|${salt}`);
export const buildPieces = (p: Phrase, salt: string): string[] => seededShuffle(p.build.pieces, `${p.id}|b|${salt}`);
