import { Empty, PageHeader } from "./Sketch";

export type Tab = "start" | "plan" | "lab" | "iq" | "fuel" | "progres";

const TABS: Array<[Tab, string]> = [
  ["start", "Start"], ["plan", "Plan"], ["lab", "Lab"], ["iq", "IQ"], ["fuel", "Fuel"], ["progres", "Progres"],
];

export function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-hairline bg-card/90 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-md">
        {TABS.map(([t, label]) => (
          <button
            key={t}
            onClick={() => onChange(t)}
            className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-xs transition ${tab === t ? "font-semibold text-accent" : "text-muted"}`}
          >
            {label}
            <span className={`h-1 w-1 rounded-full ${tab === t ? "bg-accent" : "bg-transparent"}`} />
          </button>
        ))}
      </div>
    </nav>
  );
}

export function Soon({ title, text }: { title: string; text: string }) {
  return (
    <main className="mx-auto max-w-md px-4 pb-28 pt-14">
      <PageHeader kind="iq" title={title} sub={text} />
      <Empty kind="iq">W budowie.</Empty>
    </main>
  );
}
