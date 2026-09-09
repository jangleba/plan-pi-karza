import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";

/**
 * Zwraca `true` dopiero po `delay` ms od momentu, gdy `active` stało się true.
 * Dzięki temu unikamy migania loadera przy szybkim ładowaniu danych —
 * pusty/skeletonowy ekran pokazuje się tylko, gdy faktycznie trzeba czekać.
 */
export function useDelayedFlag(active: boolean, delay = 280): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!active) {
      setShown(false);
      return;
    }
    const t = setTimeout(() => setShown(true), delay);
    return () => clearTimeout(t);
  }, [active, delay]);
  return shown;
}

/**
 * Natychmiastowa nawigacja „wstecz" jak w aplikacji natywnej:
 * - cofa wizualnie od razu (history.back), bez czekania na refetch danych,
 * - zabezpiecza przed double-tap / wielokrotnym kliknięciem,
 * - gdy brak historii w obrębie aplikacji (deep link / odświeżenie),
 *   wraca bezpiecznie do podanego ekranu fallback (domyślnie /plan).
 */
export function useInstantBack(fallbackTo: string = "/plan") {
  const router = useRouter();
  const navigating = useRef(false);

  return useCallback(() => {
    if (navigating.current) return;
    navigating.current = true;

    const canGoBack =
      typeof window !== "undefined" && window.history.length > 1;

    if (canGoBack) {
      router.history.back();
    } else {
      router.navigate({ to: fallbackTo });
    }

    // Odblokuj po krótkiej chwili — jeden gest = jedno cofnięcie.
    setTimeout(() => {
      navigating.current = false;
    }, 450);
  }, [router, fallbackTo]);
}
