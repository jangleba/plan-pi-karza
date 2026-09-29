import { useEffect } from "react";

export function useDuplicateNavigationGuard() {
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
}
