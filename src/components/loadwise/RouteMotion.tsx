import type { ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
/** Entry motion is also available in WebViews without the View Transitions API. */
export function RouteMotion({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="bw-route-motion" key={pathname}>
      {children}
    </div>
  );
}
