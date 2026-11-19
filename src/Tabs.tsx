import type { ReactNode } from "react";

export type Tab = "start" | "plan" | "lab" | "iq" | "fuel" | "progres";

const P = { fill: "none", stroke: "currentColor", strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** Ikony liniowe w stylu SF Symbols (24×24). */
const ICONS: Record<Tab, ReactNode> = {
  start: <g {...P}><circle cx="12" cy="13" r="4.2" /><path d="M12 4.5v1.8M5.6 7.1l1.3 1.3M18.4 7.1l-1.3 1.3M3.5 13h1.8M18.7 13h1.8M4 19.5h16" /></g>,
  plan: <g {...P}><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /><circle cx="8.5" cy="14" r="0.6" fill="currentColor" /><circle cx="12" cy="14" r="0.6" fill="currentColor" /><circle cx="15.5" cy="14" r="0.6" fill="currentColor" /></g>,
  lab: <g {...P}><circle cx="12" cy="13.5" r="7" /><path d="M12 13.5V9.5M10 3.5h4M12 3.5v3M18 6.5l1.3-1.3" /></g>,
  iq: <g {...P}><rect x="3.5" y="4.5" width="17" height="15" rx="3" /><path d="M12 4.5v15" /><circle cx="7.5" cy="9" r="1.2" /><path d="M8.6 10.2c2 3 4.5 4 7.4 3.6" strokeDasharray="1.6 1.6" /><path d="M14.6 12.3l1.5 1.5-1.8 1" /></g>,
  fuel: <g {...P}><path d="M12 7.5c-2.5-1.8-6.5-.8-6.5 4 0 3.5 2.6 8 4.6 8 1 0 1.3-.5 1.9-.5s.9.5 1.9.5c2 0 4.6-4.5 4.6-8 0-4.8-4-5.8-6.5-4z" /><path d="M12 7.5c0-1.8.8-3.2 2.6-4" /></g>,
  progres: <g {...P}><path d="M4 19.5h16" /><path d="M5 15.5l4.2-4.2 3.3 2.7 6-6.5" /><path d="M15.2 7.5h3.3v3.3" /></g>,
};

const TABS: Array<[Tab, string]> = [
  ["start", "Start"], ["plan", "Plan"], ["lab", "Lab"], ["iq", "IQ"], ["fuel", "Fuel"], ["progres", "Progres"],
];

export function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-hairline/80 bg-card/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex max-w-md">
        {TABS.map(([t, label]) => {
          const on = tab === t;
          return (
            <button
              key={t}
              onClick={() => { if (!on) { navigator.vibrate?.(6); onChange(t); } }}
              aria-current={on ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 pb-1.5 pt-2 text-[10px] font-medium transition-colors ${on ? "text-accent" : "text-muted"}`}
            >
              <svg key={on ? "on" : "off"} viewBox="0 0 24 24" className={`h-6 w-6 ${on ? "bw-pop" : ""}`} strokeWidth={on ? 1.9 : 1.5} aria-hidden="true">
                {ICONS[t]}
              </svg>
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/** Szkielet ekranu na czas ładowania (zamiast pustego miejsca). */
export function Skeleton({ title }: { title: string }) {
  return (
    <main className="mx-auto max-w-md px-5 pb-28 pt-14">
      <h1 className="mb-6 text-[32px] font-semibold leading-tight tracking-tight">{title}</h1>
      <div className="bw-shimmer h-[58vh] min-h-[340px] rounded-3xl" />
    </main>
  );
}
