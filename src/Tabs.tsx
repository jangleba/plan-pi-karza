export type Tab = "plan" | "lab" | "iq" | "fuel" | "progres";

const TABS: Array<[Tab, string]> = [
  ["plan", "Plan"], ["lab", "Lab"], ["iq", "IQ"], ["fuel", "Fuel"], ["progres", "Progres"],
];

export function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-black/5 bg-white/85 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-md">
        {TABS.map(([t, label]) => (
          <button
            key={t}
            onClick={() => onChange(t)}
            className={`flex-1 py-3 text-xs transition ${tab === t ? "font-semibold text-ink" : "text-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>
    </nav>
  );
}

export function Soon({ title, text }: { title: string; text: string }) {
  return (
    <main className="mx-auto max-w-md px-4 pb-28 pt-14">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mb-6 mt-1 text-sm text-muted">{text}</p>
      <p className="rounded-2xl bg-card p-4 text-sm text-muted shadow-[0_1px_2px_rgba(0,0,0,0.04)]">W budowie.</p>
    </main>
  );
}
