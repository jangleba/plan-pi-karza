import { Link, useRouterState } from "@tanstack/react-router";
import { Home, CalendarDays, ScanEye, Brain, TrendingUp } from "lucide-react";

const items = [
  { to: "/start", label: "Start", icon: Home },
  { to: "/plan", label: "Plan", icon: CalendarDays },
  { to: "/vision-lab", label: "Lab", icon: ScanEye },
  { to: "/football-iq", label: "IQ", icon: Brain },
  { to: "/postep", label: "Postęp", icon: TrendingUp },
] as const;

export function BottomNav() {
  const pathname = useRouterState({
    select: (s) => s.location.pathname,
  });

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.5rem)" }}
    >
      <div className="mx-auto w-full max-w-[30rem]">
        <div className="mx-3 flex items-center justify-between gap-1 rounded-[1.6rem] border border-border/60 bg-card/80 px-1.5 py-1.5 shadow-[0_10px_40px_oklch(0.21_0.04_258_/_0.18)] backdrop-blur-xl">
          {items.map((item) => {
            const active =
              pathname === item.to || pathname.startsWith(item.to + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-[48px] min-w-0 flex-1 select-none flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1.5 text-[10px] font-medium transition-all duration-200 ease-out active:scale-[0.98] [touch-action:manipulation] [-webkit-tap-highlight-color:transparent] ${
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 1.9} />
                <span className="max-w-full truncate leading-tight">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
