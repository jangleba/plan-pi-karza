import { Link, useRouterState } from "@tanstack/react-router";
import { Home, CalendarDays, Brain, TrendingUp, Apple } from "lucide-react";

const items = [
  { to: "/start", label: "Start", icon: Home },
  { to: "/plan", label: "Plan", icon: CalendarDays },
  { to: "/football-iq", label: "IQ", icon: Brain },
  { to: "/fuel", label: "Fuel", icon: Apple },
  { to: "/postep", label: "Postęp", icon: TrendingUp },
] as const;

export function BottomNav() {
  const pathname = useRouterState({
    select: (s) => s.location.pathname,
  });

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border/70 bg-background/92 backdrop-blur-xl"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.35rem)" }}
    >
      <div className="mx-auto w-full max-w-[30rem]">
        <div className="flex items-center justify-between px-2 pt-1.5">
          {items.map((item) => {
            const active =
              pathname === item.to || pathname.startsWith(item.to + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={`relative flex min-h-[48px] min-w-0 flex-1 select-none flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] font-medium transition-colors duration-200 active:opacity-60 [touch-action:manipulation] [-webkit-tap-highlight-color:transparent] ${
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {active && <span className="absolute top-0 h-0.5 w-5 rounded-full bg-primary" />}
                <Icon className="h-[19px] w-[19px]" strokeWidth={active ? 2.25 : 1.75} />
                <span className="max-w-full truncate leading-tight">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
