import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";

export function authRedirectUrl(
  native: boolean,
  configured: string | undefined,
  origin?: string,
): string {
  if (configured?.trim()) {
    const url = new URL(configured.trim());
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/auth"
    )
      throw new Error(
        "Adres powrotu logowania musi być publicznym adresem HTTPS kończącym się /auth.",
      );
    return url.toString();
  }
  if (native)
    throw new Error(
      "Brakuje konfiguracji powrotu logowania. Ustaw VITE_AUTH_REDIRECT_URL i domenę Universal Links.",
    );
  if (!origin) throw new Error("Nie można ustalić adresu powrotu logowania.");
  const url = new URL("/auth", origin);
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))
  )
    throw new Error("Logowanie wymaga bezpiecznego adresu aplikacji.");
  return url.toString();
}

export function acceptedAuthCode(incoming: string, expected: string): string | null {
  let url: URL;
  try {
    url = new URL(incoming);
  } catch {
    return null;
  }
  const allowed = new URL(expected);
  if (
    url.origin !== allowed.origin ||
    url.pathname !== allowed.pathname ||
    url.username ||
    url.password ||
    url.hash
  )
    return null;
  const codes = url.searchParams.getAll("code");
  return codes.length === 1 && /^[A-Za-z0-9._~-]{8,2048}$/.test(codes[0]) ? codes[0] : null;
}

export function configuredAuthRedirect() {
  return authRedirectUrl(
    Capacitor.isNativePlatform(),
    import.meta.env.VITE_AUTH_REDIRECT_URL,
    typeof window === "undefined" ? undefined : window.location.origin,
  );
}

type Exchange = (code: string) => Promise<{ error: unknown; data?: unknown }>;
/** Hooks are registered before getLaunchUrl so both cold and warm Universal Links are received. */
export async function installNativeAuthCallbacks(
  exchange: Exchange,
  onResult: (error: string | null, recovery: boolean) => void,
) {
  if (!Capacitor.isNativePlatform()) return () => {};
  const state = await App.addListener("appStateChange", (event) => {
    window.dispatchEvent(
      new CustomEvent("ballwise:app-state", { detail: { isActive: event.isActive } }),
    );
  });
  let redirect: string;
  try {
    redirect = configuredAuthRedirect();
  } catch (error) {
    onResult(error instanceof Error ? error.message : "Brakuje konfiguracji linków.", false);
    return () => {
      void state.remove();
    };
  }
  const seen = new Set<string>();
  let alive = true;
  const handle = async (incoming: string) => {
    const code = acceptedAuthCode(incoming, redirect);
    if (!code || seen.has(code) || !alive) return;
    seen.add(code);
    if (seen.size > 20) seen.delete(seen.values().next().value!);
    try {
      const result = await exchange(code);
      const data = result.data;
      const recovery =
        !!data &&
        typeof data === "object" &&
        "redirectType" in data &&
        data.redirectType === "recovery";
      if (alive)
        onResult(
          result.error
            ? "Link logowania wygasł lub jest nieprawidłowy. Poproś o nowy link na tym urządzeniu."
            : null,
          !result.error && recovery,
        );
    } catch {
      if (alive)
        onResult("Nie udało się obsłużyć linku. Sprawdź połączenie i poproś o nowy link.", false);
    }
  };
  let link;
  try {
    link = await App.addListener("appUrlOpen", (event) => {
      void handle(event.url);
    });
  } catch (error) {
    void state.remove();
    throw error;
  }
  try {
    const launch = await App.getLaunchUrl();
    if (launch?.url) await handle(launch.url);
  } catch {
    /* Warm listener remains available if the platform has no launch URL. */
  }
  return () => {
    alive = false;
    void link.remove();
    void state.remove();
  };
}
