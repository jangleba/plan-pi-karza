import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

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
    <section className="bw-form-page bw-page-content bw-stack">
      <h1 className="bw-page-title">Publiczne demo</h1>

      <p className="text-base leading-6 text-muted-foreground">
        Przykład działania BallWise. Bez konta i zapisu danych.
      </p>

      <section className="bw-section rounded-lg bg-primary p-5 text-primary-foreground">
        <h2 className="text-xl font-semibold">Dziś: szybkość bez dodatkowej objętości</h2>
        <p className="mt-2 text-sm leading-relaxed opacity-90">
          W przykładowym tygodniu jutro jest trening klubowy, dlatego sesja jest krótka i skupiona
          na jakości sprintu.
        </p>
      </section>

      <section className="bw-section">
        <h2 className="text-xl font-semibold">Tydzień</h2>
        <div className="mt-4 space-y-4">
          {DEMO_WEEK.map((item) => (
            <div key={item.day} className="flex items-center gap-4">
              <span className="w-9 text-sm text-muted-foreground">{item.day}</span>
              <div className="min-w-0 flex-1">
                <div className="text-base font-medium">{item.title}</div>
                <div className="text-sm text-muted-foreground">{item.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <p className="text-sm leading-5 text-muted-foreground">
        BallWise wspiera decyzje treningowe, ale nie diagnozuje, nie leczy i nie zastępuje trenera
        ani specjalisty.
      </p>

      <Button asChild className="w-full">
        <Link to="/auth">Wróć do logowania</Link>
      </Button>
    </section>
  );
}
