import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Apple,
  Brain,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronDown,
  ClipboardList,
  Home,
  PencilLine,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import { useAuth } from "@/lib/loadwise/auth";
import { ownerTestAccessForEmail } from "@/lib/loadwise/ownerTestMode";

const destinations = [
  { to: "/start", label: "Start", icon: Home },
  { to: "/plan", label: "Plan", icon: CalendarDays },
  { to: "/football-iq", label: "Football IQ", icon: Brain },
  { to: "/fuel", label: "Fuel", icon: Apple },
  { to: "/postep", label: "Postęp", icon: ChartNoAxesCombined },
  { to: "/profil", label: "Profil", icon: UserRound },
  { to: "/data-rights", label: "Dane i prawa", icon: ShieldCheck },
] as const;

export function OwnerTestTools() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  if (!ownerTestAccessForEmail(user?.email)) return null;

  const go = (to: (typeof destinations)[number]["to"]) => {
    setOpen(false);
    void navigate({ to });
  };

  return (
    <div className="fixed bottom-[calc(6.2rem+env(safe-area-inset-bottom))] left-3 z-[90]">
      {open && (
        <div
          role="dialog"
          aria-label="Tryb testowy właściciela"
          className="mb-2 w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl border border-amber-400/50 bg-background/95 p-3 shadow-2xl backdrop-blur-xl"
        >
          <div className="mb-3 rounded-xl bg-amber-100 px-3 py-2 text-amber-950 dark:bg-amber-950 dark:text-amber-100">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide">
              <ClipboardList className="h-4 w-4" aria-hidden="true" />
              Tryb testowy — konto właściciela
            </div>
            <p className="mt-1 text-xs leading-relaxed">
              Przełączasz tylko ekrany swojego konta. To nie daje dostępu do danych innych osób.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {destinations.map(({ to, label, icon: Icon }) => (
              <button
                key={to}
                type="button"
                onClick={() => go(to)}
                className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-left text-sm font-medium text-foreground transition-colors hover:bg-accent"
              >
                <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              void navigate({ to: "/onboarding", search: { edit: true } });
            }}
            className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
          >
            <PencilLine className="h-4 w-4" aria-hidden="true" />
            Otwórz onboarding jako edycję
          </button>

          <p className="mt-2 text-center text-[11px] leading-relaxed text-muted-foreground">
            Zapisanie onboardingu zmieni dane i plan na Twoim obecnym koncie testowym.
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex min-h-11 items-center gap-2 rounded-full border border-amber-400/60 bg-amber-300 px-4 py-2 text-xs font-extrabold text-amber-950 shadow-lg transition-transform active:scale-95"
      >
        TEST
        <ChevronDown
          className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}
