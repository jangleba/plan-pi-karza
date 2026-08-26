import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { formatDate } from "@/lib/loadwise/labels";
import { useCareerJournal } from "@/lib/progress/careerJournal";
import {
  TRACKER_LABELS,
  TRACKER_STAGES,
  useClubProfile,
  useOpportunityStore,
  type OpportunityFilters,
  type TrackerStage,
} from "@/lib/progress/opportunities";
import type { CompletedSessionEntry } from "@/lib/progress/progress";
import type { TestSummaryRow } from "@/lib/progress/center";
import { Plus, Share2, Trash2, BellRing } from "lucide-react";

interface TimelineItem {
  date: string;
  kind: string;
  title: string;
  detail: string;
}

export function ProgressCareer({
  history,
  tests,
  filters,
}: {
  history: CompletedSessionEntry[];
  tests: TestSummaryRow[];
  filters: OpportunityFilters;
}) {
  const journal = useCareerJournal();
  const store = useOpportunityStore(filters);
  const club = useClubProfile();
  const [form, setForm] = useState({
    club: "",
    date: "",
    stage: "",
    outcome: "",
    nextStep: "",
  });
  const [showForm, setShowForm] = useState(false);

  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];
    for (const e of journal.entries)
      items.push({
        date: e.date,
        kind: e.stage || "Wydarzenie",
        title: e.club,
        detail: e.outcome || e.nextStep,
      });
    for (const t of tests)
      if (t.isPersonalBest)
        items.push({
          date: t.change.latest.date,
          kind: "Rekord",
          title: t.series.label,
          detail: `${t.change.latest.value} ${t.series.unit}`,
        });
    for (const h of history.filter((x) => x.category === "match").slice(0, 12))
      items.push({
        date: h.date,
        kind: "Mecz",
        title: h.title,
        detail: `${h.durationMin} min${h.rpe != null ? ` · RPE ${h.rpe}` : ""}`,
      });
    for (const s of store.saved)
      items.push({
        date: s.dateIso,
        kind: "Test klubowy",
        title: s.club,
        detail: TRACKER_LABELS[s.stage],
      });
    return items.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 40);
  }, [journal.entries, tests, history, store.saved]);

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Oś kariery */}
      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold">Oś kariery</h2>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary"
          >
            <Plus className="h-3.5 w-3.5" /> Dodaj wpis
          </button>
        </div>

        <div
          className="grid transition-all duration-[240ms] ease-out"
          style={{ gridTemplateRows: showForm ? "1fr" : "0fr" }}
        >
          <div className="overflow-hidden">
            <div className="soft-card space-y-2 p-4">
              <Input
                placeholder="Klub / wydarzenie"
                value={form.club}
                onChange={(e) => setForm({ ...form, club: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
                <Input
                  placeholder="Rodzaj (test, obóz…)"
                  value={form.stage}
                  onChange={(e) => setForm({ ...form, stage: e.target.value })}
                />
              </div>
              <Textarea
                placeholder="Notatka po teście / wynik"
                value={form.outcome}
                onChange={(e) => setForm({ ...form, outcome: e.target.value })}
                rows={2}
              />
              <Input
                placeholder="Następny krok"
                value={form.nextStep}
                onChange={(e) => setForm({ ...form, nextStep: e.target.value })}
              />
              <button
                disabled={!form.club || !form.date}
                onClick={() => {
                  journal.addEntry(form);
                  setForm({ club: "", date: "", stage: "", outcome: "", nextStep: "" });
                  setShowForm(false);
                }}
                className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                Zapisz wpis
              </button>
            </div>
          </div>
        </div>

        {timeline.length === 0 ? (
          <div className="soft-card px-4 py-6 text-center text-sm text-muted-foreground">
            Brak wydarzeń. Dodaj test klubowy, obóz lub mecz, aby zbudować oś kariery.
          </div>
        ) : (
          <div className="soft-card p-4">
            <ol className="relative space-y-3 border-l border-border pl-4">
              {timeline.map((t, i) => (
                <li
                  key={`${t.date}-${i}`}
                  className="animate-fade-in"
                  style={{ animationDelay: `${i * 30}ms`, animationFillMode: "backwards" }}
                >
                  <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {formatDate(t.date)} · {t.kind}
                  </div>
                  <div className="text-sm font-medium leading-snug">{t.title}</div>
                  {t.detail && (
                    <div className="text-xs text-muted-foreground">{t.detail}</div>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>

      {/* Tracker zgłoszeń */}
      <section className="space-y-2">
        <h2 className="px-1 text-sm font-semibold">Tracker zgłoszeń</h2>
        {store.saved.length === 0 ? (
          <div className="soft-card px-4 py-6 text-center text-sm text-muted-foreground">
            Zapisz szansę w zakładce SZANSE, aby śledzić kontakt i zgłoszenie.
          </div>
        ) : (
          store.saved.map((s) => (
            <div key={s.id} className="soft-card space-y-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{s.club}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.title} · {formatDate(s.dateIso)}
                  </div>
                </div>
                <button
                  onClick={() => store.remove(s.id)}
                  aria-label="Usuń"
                  className="text-muted-foreground"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1">
                {TRACKER_STAGES.map((st: TrackerStage) => (
                  <button
                    key={st}
                    onClick={() => store.update(s.id, { stage: st })}
                    className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors duration-200 ${
                      s.stage === st
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {TRACKER_LABELS[st]}
                  </button>
                ))}
              </div>
              <Textarea
                rows={2}
                placeholder="Notatka po teście"
                value={s.note}
                onChange={(e) => store.update(s.id, { note: e.target.value })}
              />
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <BellRing className="h-3.5 w-3.5 text-primary" />
                Przypomnienie o ponownym kontakcie
                <input
                  type="date"
                  value={s.followUpIso ?? ""}
                  onChange={(e) =>
                    store.update(s.id, { followUpIso: e.target.value || null })
                  }
                  className="ml-auto rounded-lg border border-input bg-background px-2 py-1 text-xs"
                />
              </label>
            </div>
          ))
        )}
      </section>

      {/* Profil zawodnika dla klubu */}
      <section className="soft-card space-y-3 p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Share2 className="h-4 w-4 text-primary" /> Profil zawodnika dla klubu
        </h2>
        <p className="text-xs text-muted-foreground">
          Sam decydujesz, co udostępniasz. Profil nie jest publikowany automatycznie.
        </p>
        <ShareToggle
          label="Wiek"
          checked={club.prefs.shareAge}
          onChange={(v) => club.update({ shareAge: v })}
        />
        <ShareToggle
          label="Pozycja"
          checked={club.prefs.sharePosition}
          onChange={(v) => club.update({ sharePosition: v })}
        />
        <ShareToggle
          label="Noga dominująca"
          checked={club.prefs.shareFoot}
          onChange={(v) => club.update({ shareFoot: v })}
        />
        <ShareToggle
          label="Lokalizacja"
          checked={club.prefs.shareLocation}
          onChange={(v) => club.update({ shareLocation: v })}
        />
        <ShareToggle
          label="Wyniki testów"
          checked={club.prefs.shareTests}
          onChange={(v) => club.update({ shareTests: v })}
        />
        <ShareToggle
          label="Osiągnięcia"
          checked={club.prefs.shareAchievements}
          onChange={(v) => club.update({ shareAchievements: v })}
        />
        <Input
          placeholder="Noga dominująca"
          value={club.prefs.dominantFoot}
          onChange={(e) => club.update({ dominantFoot: e.target.value })}
        />
        <Input
          placeholder="Miasto"
          value={club.prefs.city}
          onChange={(e) => club.update({ city: e.target.value })}
        />
        <Textarea
          rows={2}
          placeholder="Osiągnięcia"
          value={club.prefs.achievements}
          onChange={(e) => club.update({ achievements: e.target.value })}
        />
        <Input
          placeholder="Link do materiału wideo"
          value={club.prefs.videoUrl}
          onChange={(e) => club.update({ videoUrl: e.target.value })}
        />
      </section>
    </div>
  );
}

function ShareToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
