import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";

type NetworkInformationLike = {
  saveData?: boolean;
  effectiveType?: string;
};

type NavigatorWithConnection = Navigator & {
  connection?: NetworkInformationLike;
};

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
    let secondaryTimer: number | null = null;
    const connection = (navigator as NavigatorWithConnection).connection;
    const initialDelay = connection?.saveData || connection?.effectiveType === "2g" ? 1_400 : 320;

    const primaryTimer = window.setTimeout(() => {
      if (cancelled) return;
      const primaryRoutes =
        authState === "user"
          ? [
              router.preloadRoute({ to: "/start" }),
              router.preloadRoute({ to: "/plan" }),
              router.preloadRoute({ to: "/football-iq" }),
              router.preloadRoute({ to: "/fuel" }),
              router.preloadRoute({ to: "/postep" }),
              router.preloadRoute({ to: "/profil" }),
              ...(sessionDate
                ? [
                    router.preloadRoute({
                      to: "/sesja/$date",
                      params: { date: sessionDate },
                      search: { slot: 1 },
                    }),
                  ]
                : []),
            ]
          : [router.preloadRoute({ to: "/auth" }), router.preloadRoute({ to: "/onboarding" })];

      void Promise.allSettled(primaryRoutes).finally(() => {
        if (cancelled) return;
        secondaryTimer = window.setTimeout(() => {
          if (cancelled) return;
          const secondaryRoutes = [
            router.preloadRoute({ to: "/data-rights" }),
            router.preloadRoute({ to: "/privacy-policy" }),
            router.preloadRoute({ to: "/terms" }),
            ...(authState === "user"
              ? [
                  router.preloadRoute({ to: "/reakcja" }),
                  router.preloadRoute({ to: "/onboarding", search: { edit: true } }),
                ]
              : [router.preloadRoute({ to: "/demo" })]),
          ];
          void Promise.allSettled(secondaryRoutes);
        }, 900);
      });
    }, initialDelay);

    return () => {
      cancelled = true;
      window.clearTimeout(primaryTimer);
      if (secondaryTimer !== null) window.clearTimeout(secondaryTimer);
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
