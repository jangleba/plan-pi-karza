import { useEffect, useState } from "react";
import { CheckCircle2, Flag } from "lucide-react";
import { toast } from "sonner";
import type { SessionDay } from "@/lib/loadwise/types";
import { useLoadwise } from "@/lib/loadwise/store";
import { composeCompletionNotes, parseCompletionNotes } from "@/lib/loadwise/sessionPresentation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function LogField({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: number;
  onChange?: (next: number) => void;
}) {
  const controlled = typeof value === "number" && typeof onChange === "function";
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <input
        type="number"
        min={0}
        max={10}
        placeholder="0–10"
        value={controlled ? value : undefined}
        onChange={
          controlled
            ? (e) => {
                const next = Number(e.target.value);
                onChange(Number.isFinite(next) ? Math.max(0, Math.min(10, next)) : 0);
              }
            : undefined
        }
        className="w-24 rounded-lg border border-border bg-card px-2 py-1 text-sm"
      />
    </div>
  );
}

export function MatchStartPanel({ session, isToday }: { session: SessionDay; isToday: boolean }) {
  const { state, startSession } = useLoadwise();
  const existing = session.dbId ? state.completions[session.dbId] : undefined;
  const [starting, setStarting] = useState(false);

  if (!session.dbId || session.dayType !== "match" || existing?.completed) return null;

  if (!isToday && existing?.status !== "started") {
    return (
      <div className="soft-card p-4">
        <h3 className="text-sm font-semibold">Zaplanowany mecz</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Przycisk rozpoczęcia będzie dostępny w dniu meczu.
        </p>
      </div>
    );
  }

  if (existing?.status === "started") {
    return (
      <div className="soft-card border-primary/30 p-4">
        <div className="flex items-center gap-2">
          <Flag className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Mecz rozpoczęty</h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Po ostatnim gwizdku uzupełnij wynik obciążenia poniżej.
        </p>
      </div>
    );
  }

  async function start() {
    setStarting(true);
    try {
      await startSession(session);
      toast.success("Mecz rozpoczęty. Powodzenia!");
    } catch {
      toast.error("Nie udało się rozpocząć meczu. Sprawdź połączenie i spróbuj ponownie.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="soft-card p-4">
      <h3 className="text-sm font-semibold">Gotowy do meczu?</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Start zapisze godzinę rozpoczęcia. Dane po meczu uzupełnisz po zakończeniu.
      </p>
      <Button className="mt-3 w-full" size="lg" disabled={starting} onClick={() => void start()}>
        <Flag className="mr-2 h-4 w-4" />
        {starting ? "Rozpoczynanie…" : "Rozpocznij mecz"}
      </Button>
    </div>
  );
}

export function CompletionPanel({ session }: { session: SessionDay }) {
  const { state, completeSession } = useLoadwise();
  const healthPersonalizationEnabled = state.profile?.healthPersonalizationEnabled === true;
  const existing = session.dbId ? state.completions[session.dbId] : undefined;
  const parsed = parseCompletionNotes(existing?.notes ?? "");
  const [rpe, setRpe] = useState(existing?.rpe ?? 6);
  const [pain, setPain] = useState(parsed.pain);
  const [legFatigue, setLegFatigue] = useState(parsed.legFatigue);
  const [notes, setNotes] = useState(parsed.notes);
  const externalSession = session.dayType === "club" || session.dayType === "match";
  const [durationMin, setDurationMin] = useState(
    existing?.durationMin ?? session.durationMin ?? 90,
  );
  const [activityType, setActivityType] = useState(existing?.activityType ?? "mixed");
  const [saving, setSaving] = useState(false);
  const done = existing?.completed ?? false;
  const existingRpe = existing?.rpe ?? 6;
  const existingNotes = existing?.notes ?? "";

  useEffect(() => {
    const next = parseCompletionNotes(existingNotes);
    setRpe(existingRpe);
    setPain(next.pain);
    setLegFatigue(next.legFatigue);
    setNotes(next.notes);
    setDurationMin(existing?.durationMin ?? session.durationMin ?? 90);
    setActivityType(existing?.activityType ?? "mixed");
  }, [
    existingRpe,
    existingNotes,
    existing?.durationMin,
    existing?.activityType,
    session.durationMin,
  ]);

  if (!session.dbId) return null;

  async function save() {
    setSaving(true);
    try {
      await completeSession(
        session,
        rpe,
        healthPersonalizationEnabled ? composeCompletionNotes(notes, pain, legFatigue) : "",
        externalSession ? { durationMin, activityType } : { durationMin: session.durationMin },
      );
      toast.success(done ? "Wpis został zaktualizowany." : "Trening zapisany w historii.");
    } catch {
      toast.error("Nie udało się zapisać treningu. Spróbuj ponownie.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="soft-card p-4">
      <div className="flex items-center gap-2">
        <CheckCircle2 className={`h-4 w-4 ${done ? "text-primary" : "text-muted-foreground"}`} />
        <h3 className="text-sm font-semibold">
          {done ? "Sesja oznaczona jako wykonana" : "Oznacz sesję jako wykonaną"}
        </h3>
      </div>

      <div className="mt-3">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium">RPE (ciężkość) 0–10</span>
          <span className="text-muted-foreground">{rpe}/10</span>
        </div>
        <Slider min={0} max={10} step={1} value={[rpe]} onValueChange={(v) => setRpe(v[0])} />
      </div>

      {externalSession && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm font-medium">
            Dokładne minuty
            <Input
              type="number"
              min={0}
              max={300}
              value={durationMin}
              onChange={(event) =>
                setDurationMin(Math.max(0, Math.min(300, Number(event.target.value) || 0)))
              }
            />
          </label>
          <label className="space-y-1.5 text-sm font-medium">
            Charakter wysiłku
            <Select
              value={activityType}
              onValueChange={(value) => setActivityType(value as typeof activityType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="technical">Głównie z piłką</SelectItem>
                <SelectItem value="mixed">Mieszany</SelectItem>
                <SelectItem value="running_endurance">Głównie biegowy / wydolnościowy</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Minuty × RPE opisują rzeczywiste obciążenie. Rodzaj wysiłku pomaga nie dokładać
            podobnego mocnego bodźca.
          </p>
        </div>
      )}

      {healthPersonalizationEnabled && (
        <div className="mt-3 space-y-2">
          <LogField label="Ból 0–10" value={pain} onChange={setPain} />
          <LogField label="Zmęczenie nóg 0–10" value={legFatigue} onChange={setLegFatigue} />
        </div>
      )}

      {healthPersonalizationEnabled ? (
        <div className="mt-3 space-y-2">
          <span className="text-sm text-muted-foreground">Notatki po sesji</span>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Jak poszło? Sen, ból, dodatkowe uwagi…"
            rows={2}
          />
          <p className="text-xs text-muted-foreground">
            Notatka może zawierać dane o zdrowiu i jest zapisywana tylko przy aktywnej zgodzie
            zdrowotnej.
          </p>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          Notatki tekstowe są wyłączone bez opcjonalnej zgody zdrowotnej. RPE, czas i rodzaj wysiłku
          nadal zapisują się normalnie.
        </p>
      )}

      <button
        onClick={save}
        disabled={saving}
        className="mt-3 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {saving ? "Zapisywanie…" : done ? "Zaktualizuj wpis" : "Oznacz jako wykonane"}
      </button>
    </div>
  );
}

export function ClubMonitoring() {
  const { state } = useLoadwise();
  const healthPersonalizationEnabled = state.profile?.healthPersonalizationEnabled === true;
  const steps = healthPersonalizationEnabled
    ? [
        "Zrób trening z drużyną",
        "Po treningu wpisz RPE",
        "Opcjonalnie zaznacz ból lub zmęczenie",
        "Opcjonalnie zapisz krótki komentarz",
      ]
    : ["Zrób trening z drużyną", "Po treningu wpisz RPE", "Uzupełnij czas i charakter wysiłku"];
  return (
    <>
      <div className="soft-card p-4">
        <h3 className="text-sm font-semibold">Trening klubowy</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">To główne obciążenie dnia.</p>
        <ol className="mt-3 space-y-2">
          {steps.map((s, i) => (
            <li key={i} className="flex items-center gap-2.5 text-sm">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                {i + 1}
              </span>
              {s}
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}
