import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useLoadwise } from "@/lib/loadwise/store";
import { AppHeader, Disclaimer } from "@/components/loadwise/ui";
import { formatDate } from "@/lib/loadwise/labels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { TestResult } from "@/lib/loadwise/types";
import { Timer, ArrowUp, MoveHorizontal, Video, Plus, Info } from "lucide-react";

export const Route = createFileRoute("/_tabs/aparat")({
  component: AparatScreen,
});

const tests: {
  type: TestResult["type"];
  label: string;
  unit: string;
  icon: typeof Timer;
  placeholder: string;
}[] = [
  { type: "sprint", label: "Test sprintu", unit: "s", icon: Timer, placeholder: "np. 4.2 (30 m)" },
  { type: "vertical", label: "Wyskok dosiężny", unit: "cm", icon: ArrowUp, placeholder: "np. 48" },
  { type: "broad", label: "Skok w dal z miejsca", unit: "cm", icon: MoveHorizontal, placeholder: "np. 215" },
  { type: "technique", label: "Wideo techniki biegu", unit: "", icon: Video, placeholder: "np. opis nagrania" },
];

function AddResult({
  type,
  label,
  placeholder,
}: {
  type: TestResult["type"];
  label: string;
  placeholder: string;
}) {
  const { addTest } = useLoadwise();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");

  function save() {
    if (!value.trim()) {
      toast.error("Wpisz wynik.");
      return;
    }
    addTest({
      id: crypto.randomUUID(),
      type,
      date: new Date().toISOString().slice(0, 10),
      value: value.trim(),
      note: note.trim(),
    });
    setValue("");
    setNote("");
    setOpen(false);
    toast.success("Zapisano wynik.");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <Plus className="h-4 w-4" /> Dodaj
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Wynik</Label>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
            />
          </div>
          <div className="space-y-2">
            <Label>Notatka (opcjonalnie)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Warunki, samopoczucie, dystans…"
            />
          </div>
          <Button className="w-full" onClick={save}>
            Zapisz wynik
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AparatScreen() {
  const { state } = useLoadwise();

  return (
    <div>
      <AppHeader
        title="AI Aparat"
        subtitle="Testy sprawności — na razie ręczne wpisywanie wyników."
      />

      <div className="px-5">
        <div className="soft-card mb-4 flex gap-2.5 bg-muted/50 p-4">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Analiza nagrań przez kamerę AI pojawi się w przyszłości. Teraz
            zapisuj wyniki ręcznie i śledź postępy w historii.
          </p>
        </div>

        <div className="space-y-3">
          {tests.map((t) => {
            const history = state.tests.filter((r) => r.type === t.type);
            const Icon = t.icon;
            return (
              <div key={t.type} className="soft-card p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary text-secondary-foreground">
                      <Icon className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{t.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {history.length
                          ? `${history.length} wpis(ów)`
                          : "Brak wyników"}
                      </div>
                    </div>
                  </div>
                  <AddResult type={t.type} label={t.label} placeholder={t.placeholder} />
                </div>

                {history.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {history.slice(0, 3).map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-xs"
                      >
                        <span className="font-medium">
                          {r.value} {t.unit}
                        </span>
                        <span className="text-muted-foreground">
                          {formatDate(r.date)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <Disclaimer />
    </div>
  );
}
