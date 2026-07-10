import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useLoadwise } from "@/lib/loadwise/store";
import { runFuelCheck } from "@/lib/fuelcheck.functions";
import { AppHeader } from "@/components/loadwise/ui";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, Apple, Loader2, Sparkles } from "lucide-react";
import type { SessionDay } from "@/lib/loadwise/types";

export const Route = createFileRoute("/_tabs/fuel")({
  component: FuelCheckScreen,
});

const GOAL_LABEL: Record<string, string> = {
  speed: "szybkość",
  strength: "siła",
  endurance: "wytrzymałość",
  power: "moc",
  agility: "zwrotność",
  general: "ogólny rozwój",
  mobility: "mobilność",
  return: "powrót po przerwie",
  matchready: "gotowość meczowa",
};

const POSITION_LABEL: Record<string, string> = {
  goalkeeper: "bramkarz",
  defender: "obrońca",
  midfielder: "pomocnik",
  forward: "napastnik",
};

function sessionLine(s: SessionDay | null): string {
  if (!s) return "brak zaplanowanej sesji";
  const parts = [s.title, s.sessionType, `intensywność: ${s.intensity}`, `${s.durationMin} min`]
    .filter(Boolean)
    .join(", ");
  return `${s.dayType} — ${parts}`;
}

const QUICK: { label: string; value: string }[] = [
  { label: "Kebab przed treningiem", value: "Kebab w bułce z frytkami i sosem czosnkowym, ok. 90 min przed treningiem." },
  { label: "Baton + cola po siłowni", value: "Baton czekoladowy i cola zaraz po treningu siłowym." },
  { label: "Kawa przed meczem", value: "Podwójne espresso 30 minut przed meczem." },
  { label: "Owsianka rano", value: "Owsianka z bananem i masłem orzechowym na śniadanie przed treningiem." },
];

function FuelCheckScreen() {
  const { state, todaySession, todayIso } = useLoadwise();
  const fuelCheck = useServerFn(runFuelCheck);
  const [meal, setMeal] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const profile = state.profile;

  const contextText = useMemo(() => {
    const r = state.readiness[todayIso];
    const upcoming = state.plan
      .filter((d) => d.date > todayIso)
      .slice(0, 3)
      .map((d) => `${d.date}: ${sessionLine(d)}`)
      .join("; ");

    const lines: string[] = [];
    if (profile) {
      lines.push(
        `Zawodnik: ${profile.age} lat, ${POSITION_LABEL[profile.position] ?? profile.position}, poziom: ${profile.level}, cel: ${GOAL_LABEL[profile.goal] ?? profile.goal}.`,
      );
      if (profile.painInjury) lines.push("Zgłoszony ból/kontuzja: tak.");
    }
    lines.push(`Dzisiejsza jednostka: ${sessionLine(todaySession)}.`);
    if (r) {
      lines.push(
        `Gotowość dziś: sen ${r.sleep}/10, energia ${r.energy}/10, zmęczenie ${r.fatigue}/10, bolesność ${r.soreness}/10, ogólnie ${r.overall}/10.`,
      );
    } else {
      lines.push("Brak dzisiejszego check-inu gotowości.");
    }
    if (upcoming) lines.push(`Kolejne jednostki: ${upcoming}.`);
    return lines.join("\n");
  }, [profile, state.readiness, state.plan, todayIso, todaySession]);

  async function analyze(text: string) {
    const value = text.trim();
    if (!value) {
      toast.error("Opisz co planujesz zjeść lub wypić.");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await fuelCheck({ data: { meal: value, context: contextText } });
      setResult(res.result);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się przeanalizować.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <AppHeader
        title="Fuel Check"
        subtitle="Sprawdź, czy Twój wybór pasuje do treningu"
        right={
          <Link
            to="/start"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-card text-muted-foreground"
            aria-label="Wróć"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
        }
      />

      <div className="space-y-4 px-5 pb-8">
        <div className="soft-card p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Apple className="h-4 w-4 text-brand" />
            Co planujesz zjeść lub wypić?
          </div>
          <Textarea
            value={meal}
            onChange={(e) => setMeal(e.target.value)}
            placeholder="Np. kebab z frytkami 90 minut przed treningiem interwałowym…"
            rows={4}
            className="resize-none"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {QUICK.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => setMeal(q.value)}
                className="rounded-full border border-border/60 bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {q.label}
              </button>
            ))}
          </div>
          <Button
            className="mt-4 w-full"
            size="lg"
            disabled={loading}
            onClick={() => analyze(meal)}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analizuję…
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" /> Sprawdź paliwo
              </>
            )}
          </Button>
        </div>

        {result && <FuelResult text={result} />}

        {!result && !loading && (
          <p className="px-1 text-xs leading-relaxed text-muted-foreground">
            Fuel Check ocenia dopasowanie wyboru do Twojego treningu — nie ocenia
            jedzenia jako dobre czy złe. To wsparcie, nie porada medyczna.
          </p>
        )}
      </div>
    </div>
  );
}

/** Prosty renderer sekcji ### 1..8 z odpowiedzi AI. */
function FuelResult({ text }: { text: string }) {
  const sections = useMemo(() => {
    const parts = text.split(/\n(?=###\s)/g);
    return parts.map((block) => {
      const m = block.match(/^###\s*(.+?)\n([\s\S]*)$/);
      if (m) return { title: m[1].trim(), body: m[2].trim() };
      return { title: "", body: block.trim() };
    });
  }, [text]);

  return (
    <div className="space-y-3">
      {sections.map((s, i) => (
        <div key={i} className="soft-card p-4">
          {s.title && (
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-primary">
              {s.title}
            </div>
          )}
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
            {s.body}
          </div>
        </div>
      ))}
    </div>
  );
}
