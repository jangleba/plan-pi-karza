/**
 * Rozpoznanie, jak zawodnik otworzył BallWise i jak może dodać ikonę do ekranu głównego.
 * Czyste funkcje (bez `window`), żeby dało się je testować; dane o przeglądarce podaje wywołujący.
 *
 * iOS/iPadOS: dodanie do ekranu początkowego odbywa się ręcznie z menu „Udostępnij” (Safari, a od iOS 16.4 także inne
 * przeglądarki oparte na WebKit). Przeglądarki wbudowane w aplikacje (Instagram, Facebook, Messenger, TikTok…) tej opcji nie mają.
 * Android/Chrome: przeglądarka sama proponuje instalację (zdarzenie `beforeinstallprompt`) albo opcję „Zainstaluj aplikację” w menu.
 */
export type InstallContext =
  | "installed" // uruchomiono z ikony (tryb standalone)
  | "ios-safari" // iPhone/iPad w Safari: Udostępnij → Do ekranu początkowego
  | "ios-other" // iPhone/iPad w innej przeglądarce (Chrome, Firefox, Edge na iOS)
  | "in-app" // przeglądarka wbudowana w komunikator lub portal społecznościowy: trzeba otworzyć w przeglądarce
  | "android-prompt" // Android: przeglądarka udostępniła okno instalacji
  | "android-manual" // Android bez okna instalacji: menu ⋮ → Zainstaluj aplikację / Dodaj do ekranu głównego
  | "desktop"; // komputer: panel trenera, instalacja opcjonalna

export interface ClientInfo {
  userAgent: string;
  /** `matchMedia('(display-mode: standalone)')` lub `navigator.standalone` (iOS). */
  standalone: boolean;
  /** Czy przeglądarka zgłosiła `beforeinstallprompt` (Chromium). */
  canPrompt: boolean;
  /** `navigator.maxTouchPoints` – iPadOS przedstawia się jako Mac z ekranem dotykowym. */
  maxTouchPoints?: number;
}

const IN_APP = /FBAN|FBAV|FB_IAB|Instagram|Messenger|Line\/|TikTok|musical_ly|Snapchat|Twitter|LinkedInApp|GSA\//i;

export function isIOS(ua: string, maxTouchPoints = 0): boolean {
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1);
}

export function installContext(c: ClientInfo): InstallContext {
  if (c.standalone) return "installed";
  const ua = c.userAgent;
  if (IN_APP.test(ua)) return "in-app";
  if (isIOS(ua, c.maxTouchPoints)) return /CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua) ? "ios-other" : "ios-safari";
  if (/Android/i.test(ua)) return c.canPrompt ? "android-prompt" : "android-manual";
  return "desktop";
}

/** Kroki instrukcji dla danego kontekstu (tekst wyświetlany w aplikacji). */
export function installSteps(ctx: InstallContext): string[] {
  switch (ctx) {
    case "ios-safari":
      return ["Dotknij przycisku Udostępnij (kwadrat ze strzałką) na dole lub u góry ekranu.", "Przewiń w dół i wybierz „Do ekranu początkowego”.", "Zostaw „Otwórz jako aplikację internetową” włączone i dotknij „Dodaj”.", "Od teraz otwieraj BallWise ikoną z ekranu głównego."];
    case "ios-other":
      return ["Dotknij przycisku Udostępnij w pasku przeglądarki (w Chrome: ikona obok paska adresu).", "Wybierz „Do ekranu początkowego”. Jeśli jej nie ma, otwórz ten adres w Safari.", "Dotknij „Dodaj” i otwieraj BallWise ikoną z ekranu głównego."];
    case "in-app":
      return ["Ta przeglądarka nie pozwala dodać ikony.", "Dotknij ⋯ lub ⋮ i wybierz „Otwórz w przeglądarce” (Safari lub Chrome).", "Tam dodaj BallWise do ekranu głównego."];
    case "android-prompt":
      return ["Dotknij „Zainstaluj” poniżej i potwierdź.", "Ikona BallWise pojawi się na ekranie głównym."];
    case "android-manual":
      return ["Otwórz menu przeglądarki ⋮ (prawy górny róg).", "Wybierz „Zainstaluj aplikację” albo „Dodaj do ekranu głównego”.", "Potwierdź i otwieraj BallWise ikoną z ekranu głównego."];
    case "desktop":
      return ["Na komputerze możesz korzystać z BallWise w przeglądarce.", "W Chrome lub Edge kliknij ikonę instalacji w pasku adresu, żeby mieć osobne okno.", "Zawodnik: otwórz ten adres na telefonie i dodaj go do ekranu głównego."];
    default:
      return [];
  }
}

/** Co ma się otworzyć po wejściu z ikony, skrótu lub powiadomienia (parametry adresu). */
export type LaunchTarget = "today" | "message" | "plan" | "workout" | null;

export function launchTarget(search: string): LaunchTarget {
  const p = new URLSearchParams(search);
  const open = p.get("open");
  if (open === "message" || open === "plan" || open === "workout" || open === "today") return open;
  if (p.get("source") === "pwa") return "today";
  return null;
}

/** Adres bez parametrów uruchomienia (żeby odświeżenie nie otwierało tego samego jeszcze raz). Inne parametry zostają. */
export function stripLaunchParams(href: string): string {
  const u = new URL(href);
  u.searchParams.delete("source");
  u.searchParams.delete("open");
  return u.pathname + (u.searchParams.toString() ? `?${u.searchParams}` : "") + u.hash;
}
