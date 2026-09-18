import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";

type NetworkInformationLike = {
  saveData?: boolean;
  effectiveType?: string;
};

type NavigatorWithConnection = Navigator & {
  connection?: NetworkInformationLike;
};

type WindowWithIdleCallback = Window & {
  requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
  cancelIdleCallback?: (handle: number) => void;
};

function shouldAvoidBackgroundPreload(connection?: NetworkInformationLike): boolean {
  return Boolean(
    connection?.saveData ||
    connection?.effectiveType === "slow-2g" ||
    connection?.effectiveType === "2g" ||
    connection?.effectiveType === "3g",
  );
}

/**
 * Ładuje moduły najważniejszych ekranów, kiedy przeglądarka ma wolną chwilę.
 * Nie renderuje UI i nigdy nie blokuje pierwszej interakcji użytkownika.
 */
export function AppRoutePreloader({
  authState,
  sessionDate,
}: {
  authState: "loading" | "guest" | "user";
  sessionDate: string | null;
}) {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    let idleHandle: number | null = null;
    let fallbackIdleTimer: number | null = null;
    const connection = (navigator as NavigatorWithConnection).connection;
    const avoidBackgroundPreload = shouldAvoidBackgroundPreload(connection);

    const preloadSequentially = async (routes: Array<() => Promise<unknown>>) => {
      for (const preload of routes) {
        if (cancelled) return;
        await preload().catch(() => undefined);
      }
    };

    const scheduleIdlePreload = (callback: () => void) => {
      const idleWindow = window as WindowWithIdleCallback;
      if (idleWindow.requestIdleCallback) {
        idleHandle = idleWindow.requestIdleCallback(callback, { timeout: 3_500 });
        return;
      }
      fallbackIdleTimer = window.setTimeout(callback, 1_500);
    };

    const primaryTimer = window.setTimeout(
      () => {
        if (cancelled) return;
        const criticalRoutes: Array<() => Promise<unknown>> =
          authState === "user"
            ? [
                () => router.preloadRoute({ to: "/start" }),
                () => router.preloadRoute({ to: "/plan" }),
                ...(sessionDate
                  ? [
                      () =>
                        router.preloadRoute({
                          to: "/sesja/$date",
                          params: { date: sessionDate },
                          search: { slot: 1 },
                        }),
                    ]
                  : []),
              ]
            : [
                () => router.preloadRoute({ to: "/auth" }),
                () => router.preloadRoute({ to: "/onboarding" }),
              ];

        void preloadSequentially(criticalRoutes).then(() => {
          if (cancelled) return;
          if (avoidBackgroundPreload) return;
          scheduleIdlePreload(() => {
            if (cancelled) return;
            const backgroundRoutes: Array<() => Promise<unknown>> = [
              ...(authState === "user"
                ? [
                    () => router.preloadRoute({ to: "/profil" }),
                    () => router.preloadRoute({ to: "/postep" }),
                    () => router.preloadRoute({ to: "/fuel" }),
                    () => router.preloadRoute({ to: "/football-iq" }),
                    () => router.preloadRoute({ to: "/reakcja" }),
                    () => router.preloadRoute({ to: "/faq" }),
                    () => router.preloadRoute({ to: "/onboarding", search: { edit: true } }),
                    () => router.preloadRoute({ to: "/data-rights" }),
                    () => router.preloadRoute({ to: "/privacy-policy" }),
                    () => router.preloadRoute({ to: "/terms" }),
                  ]
                : [() => router.preloadRoute({ to: "/demo" })]),
            ];
            void preloadSequentially(backgroundRoutes);
          });
        });
      },
      avoidBackgroundPreload ? 900 : 250,
    );

    return () => {
      cancelled = true;
      window.clearTimeout(primaryTimer);
      if (fallbackIdleTimer !== null) window.clearTimeout(fallbackIdleTimer);
      if (idleHandle !== null) {
        (window as WindowWithIdleCallback).cancelIdleCallback?.(idleHandle);
      }
    };
  }, [authState, router, sessionDate]);

  // Dwa szybkie kliknięcia tego samego linku nie mogą dodać dwóch identycznych
  // wpisów do historii ani rozpocząć dwóch równoległych przejść.
  useEffect(() => {
    let lastHref = "";
    let lastAt = 0;
    const guardDuplicateNavigation = (event: MouseEvent) => {
      if (event.button !== 0 || event.defaultPrevented) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const now = performance.now();
      const href = `${url.pathname}${url.search}${url.hash}`;
      if (href === lastHref && now - lastAt < 450) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      lastHref = href;
      lastAt = now;
    };
    document.addEventListener("click", guardDuplicateNavigation, true);
    return () => document.removeEventListener("click", guardDuplicateNavigation, true);
  }, []);

  return null;
}
