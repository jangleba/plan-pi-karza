/**
 * Zakres stabilny Vision Lab.
 *
 * W stabilnej wersji aktywne są wyłącznie testy wymienione poniżej.
 * Pozostałe testy pozostają w repozytorium (kod, adaptery, testy jednostkowe),
 * ale są ukryte w UI za feature flagą `VITE_VISION_EXPERIMENTAL_TESTS`.
 *
 * Ta lista jest jedynym źródłem prawdy o tym, co widzi użytkownik końcowy.
 * Nie modyfikuj bez świadomej decyzji o rozszerzeniu zakresu stabilnego.
 */

/** Identyfikatory testów aktywnych w stabilnej wersji Vision Lab. */
export const SUPPORTED_VISION_TESTS = ["cmj", "broad_jump"] as const;

export type SupportedVisionTestId = (typeof SUPPORTED_VISION_TESTS)[number];

/**
 * Identyfikatory testów zaimplementowanych, ale ukrytych w UI za flagą
 * eksperymentalną. Pozostają w repozytorium i mogą być testowane wewnętrznie.
 */
export const EXPERIMENTAL_VISION_TESTS = [
  "sprint_20m",
  "sprint_30m",
  "flying_sprint",
  "five_ten_five",
  "sprint_to_stop",
] as const;

export type ExperimentalVisionTestId = (typeof EXPERIMENTAL_VISION_TESTS)[number];

/**
 * Feature flaga eksperymentalnych testów. Domyślnie WYŁĄCZONA.
 * Ustaw `VITE_VISION_EXPERIMENTAL_TESTS=true` w środowisku deweloperskim,
 * aby zobaczyć ukryte testy w UI.
 */
export function experimentalTestsEnabled(): boolean {
  const raw = (import.meta.env?.VITE_VISION_EXPERIMENTAL_TESTS ?? "") as string;
  return String(raw).toLowerCase() === "true";
}

/** Czy dany test jest widoczny w UI dla użytkownika końcowego? */
export function isTestVisibleInUi(testId: string): boolean {
  if ((SUPPORTED_VISION_TESTS as readonly string[]).includes(testId)) return true;
  if ((EXPERIMENTAL_VISION_TESTS as readonly string[]).includes(testId)) {
    return experimentalTestsEnabled();
  }
  // Testy spoza obu list (np. `analyze_gym_exercise`) mają własną obsługę.
  return false;
}
