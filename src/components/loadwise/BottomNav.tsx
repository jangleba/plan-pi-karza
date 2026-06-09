import { Link, useRouterState } from "@tanstack/react-router";
import { Home, CalendarDays, Camera, Telescope, User } from "lucide-react";

const items = [
  { to: "/start", label: "Start", icon: Home },
  { to: "/plan", label: "Plan", icon: CalendarDays },
  { to: "/aparat", label: "AI Aparat", icon: Camera },
  { to: "/scouting", label: "Scouting", icon: Telescope },
  { to: "/profil", label: "Profil", icon: User },
] as const;

export function BottomNav() {
  const pathname = useRouterState({
    select: (s) => s.location.pathname,
  });

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50">
      <div className="app-shell">
        <div className="mx-3 mb-3 flex items-center justify-between rounded-2xl border border-border bg-card/95 px-1.5 py-1.5 shadow-[0_8px_30px_oklch(0.21_0.04_258_/_0.12)] backdrop-blur">
          {items.map((item) => {
            const active =
              pathname === item.to || pathname.startsWith(item.to + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-medium transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground"
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 1.9} />
                <span className="leading-tight">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
