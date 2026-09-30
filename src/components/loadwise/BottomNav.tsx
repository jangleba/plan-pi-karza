import { Link, useRouterState } from "@tanstack/react-router";
import { Home, CalendarDays, Brain, TrendingUp, Apple } from "lucide-react";

const items = [
  { to: "/start", label: "Start", icon: Home },
  { to: "/plan", label: "Plan", icon: CalendarDays },
  { to: "/football-iq", label: "IQ", icon: Brain },
  { to: "/fuel", label: "Fuel", icon: Apple },
  { to: "/postep", label: "Progres", icon: TrendingUp },
] as const;

export function BottomNav() {
  const pathname = useRouterState({
    select: (s) => s.location.pathname,
  });

  return (
    <nav className="bw-tab-bar" aria-label="Główna nawigacja">
      <div className="bw-tab-list">
        {items.map((item) => {
          const active = pathname === item.to || pathname.startsWith(item.to + "/");
          const Icon = item.icon;

          return (
            <Link
              key={item.to}
              to={item.to}
              preload="intent"
              aria-current={active ? "page" : undefined}
              className={`bw-tab-item ${active ? "is-active" : ""}`}
            >
              <span className="bw-tab-icon" aria-hidden="true">
                <Icon className="h-[19px] w-[19px]" strokeWidth={active ? 2.25 : 1.8} />
              </span>
              <span className="bw-tab-label">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

