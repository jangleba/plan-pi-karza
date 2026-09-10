import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, CalendarDays, Dumbbell, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/demo")({
  component: PublicDemo,
});

const DEMO_WEEK = [
  { day: "Pon", title: "Siła całego ciała", detail: "45 min · umiarkowanie" },
  { day: "Wt", title: "Trening klubowy", detail: "obciążenie zespołowe" },
  { day: "Śr", title: "Szybkość i sprint", detail: "35 min · wysoka jakość" },
  { day: "Czw", title: "Regeneracja", detail: "lekki ruch" },
];

function PublicDemo() {
  return (
    <main className="app-shell min-h-screen px-5 pb-12 pt-8">
      <div className="mx-auto max-w-md">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">BallWise</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Publiczne demo</h1>
          </div>
          <ShieldCheck className="h-8 w-8 text-primary" aria-hidden="true" />
        </div>

        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Ten ekran nie wymaga konta, nie pyta o wiek, zdrowie ani lokalizację i niczego nie zapisuje.
          Pokazuje jedynie przykładowy sposób działania aplikacji.
        </p>

        <section className="mt-6 rounded-3xl bg-primary p-5 text-primary-foreground shadow-lg">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide opacity-80">
            <Activity className="h-4 w-4" aria-hidden="true" /> Przykładowa decyzja dnia
          </div>
          <h2 className="mt-3 text-xl font-semibold">Dziś: szybkość bez dodatkowej objętości</h2>
          <p className="mt-2 text-sm leading-relaxed opacity-90">
            W przykładowym tygodniu jutro jest trening klubowy, dlatego sesja jest krótka i skupiona na jakości sprintu.
          </p>
        </section>

        <section className="mt-5 rounded-3xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" /> Przykładowy tydzień
          </div>
          <div className="mt-3 divide-y divide-border">
            {DEMO_WEEK.map((item) => (
              <div key={item.day} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span className="w-9 text-xs font-semibold text-muted-foreground">{item.day}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{item.title}</div>
                  <div className="text-xs text-muted-foreground">{item.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-5 flex items-start gap-3 rounded-2xl bg-muted p-4 text-xs leading-relaxed text-muted-foreground">
          <Dumbbell className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          BallWise wspiera decyzje treningowe, ale nie diagnozuje, nie leczy i nie zastępuje trenera ani specjalisty.
        </div>

        <Link
          to="/auth"
          className="mt-6 flex h-12 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          Wróć do logowania
        </Link>
      </div>
    </main>
  );
}
