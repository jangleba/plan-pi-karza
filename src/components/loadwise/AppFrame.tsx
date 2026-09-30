import { useEffect, useRef, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/loadwise/auth";
import { useLoadwise } from "@/lib/loadwise/store";
import { BottomNav } from "./BottomNav";

/** One viewport and navigation budget for routes, activities and portal dialogs. */
export function AppFrame({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const { hydrated, state } = useLoadwise();
  const pathname = useRouterState({ select: (router) => router.location.pathname });
  const nav = useRef<HTMLElement>(null);
  const visible =
    !loading &&
    Boolean(user) &&
    hydrated &&
    Boolean(state.profile?.onboardingComplete) &&
    pathname !== "/auth" &&
    pathname !== "/demo" &&
    pathname !== "/";
  useEffect(() => {
    const root = document.documentElement;
    const update = () => {
      const height = visible ? (nav.current?.getBoundingClientRect().height ?? 64) : 0;
      root.style.setProperty("--app-nav-clearance", `${height}px`);
      root.style.setProperty(
        "--app-viewport-height",
        `${window.visualViewport?.height ?? window.innerHeight}px`,
      );
      root.style.setProperty("--app-viewport-top", `${window.visualViewport?.offsetTop ?? 0}px`);
    };
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    if (nav.current) observer?.observe(nav.current);
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
      root.style.removeProperty("--app-nav-clearance");
      root.style.removeProperty("--app-viewport-height");
      root.style.removeProperty("--app-viewport-top");
    };
  }, [visible]);
  return (
    <div className="bw-app-frame">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[80] focus:rounded-lg focus:bg-card focus:p-3"
      >
        Przejdź do treści
      </a>
      <main id="main-content" tabIndex={-1} className="bw-route-frame">
        {children}
      </main>
      {visible && <BottomNav ref={nav} />}
    </div>
  );
}
