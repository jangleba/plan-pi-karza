import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { formatDate } from "@/lib/loadwise/labels";
import {
  VERIFIED_OPPORTUNITIES,
  matchOpportunities,
  countdownDays,
  useOpportunityStore,
  type Opportunity,
  type OpportunityFilters,
} from "@/lib/progress/opportunities";
import {
  Phone,
  Mail,
  ExternalLink,
  BookmarkPlus,
  BellRing,
  CalendarPlus,
  ShieldCheck,
} from "lucide-react";

export function ProgressOpportunities({
  defaults,
  todayIso,
}: {
  defaults: OpportunityFilters;
  todayIso: string;
}) {
  const store = useOpportunityStore(defaults);
  const [radius, setRadius] = useState(store.filters.radiusKm);

  const matched = useMemo(
    () => matchOpportunities(VERIFIED_OPPORTUNITIES, store.filters, todayIso),
    [store.filters, todayIso],
  );

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Filtry dopasowania */}
      <section className="soft-card space-y-3 p-4">
        <h2 className="text-sm font-semibold">Dopasowane do Ciebie</h2>
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={store.filters.city}
            onChange={(e) => store.setFilters({ city: e.target.value })}
            placeholder="Miasto / region"
          />
          <select
            value={store.filters.gender}
            onChange={(e) =>
              store.setFilters({ gender: e.target.value as OpportunityFilters["gender"] })
            }
            className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
          >
            <option value="any">Płeć: dowolna</option>
            <option value="male">Chłopcy / mężczyźni</option>
            <option value="female">Dziewczęta / kobiety</option>
          </select>
        </div>
        <div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Promień</span>
            <span>{radius} km</span>
          </div>
          <input
            type="range"
            min={5}
            max={200}
            step={5}
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            onPointerUp={() => store.setFilters({ radiusKm: radius })}
            className="w-full accent-[var(--color-brand)]"
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Dopasowanie po wieku {store.filters.age ?? "—"}, pozycji{" "}
          {store.filters.position ?? "—"} i poziomie z Twojego profilu.
        </p>
      </section>

      {/* Lista ofert */}
      {matched.length === 0 ? (
        <div className="soft-card space-y-2 px-4 py-6 text-center">
          <ShieldCheck className="mx-auto h-5 w-5 text-primary" />
          <p className="text-sm font-medium">Brak zweryfikowanych ogłoszeń</p>
          <p className="text-xs leading-snug text-muted-foreground">
            Pokazujemy wyłącznie realne nabory i testy z oficjalnych, publicznych źródeł,
            z datą weryfikacji i kontaktem klubu. Nie tworzymy przykładowych ofert. Włącz
            powiadomienia poniżej, aby dostać sygnał, gdy pojawi się dopasowana szansa.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {matched.map((o) => (
            <OpportunityCard
              key={o.id}
              o={o}
              todayIso={todayIso}
              saved={store.saved.some((s) => s.id === o.id)}
              onSave={() =>
                store.save({
                  id: o.id,
                  club: o.club,
                  title: o.title,
                  dateIso: o.dateIso,
                  city: o.city,
                  sourceUrl: o.sourceUrl,
                })
              }
            />
          ))}
        </div>
      )}

      {/* Zapisane + odliczanie */}
      {store.saved.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-sm font-semibold">Zapisane terminy</h2>
          {store.saved.map((s) => {
            const days = countdownDays(s.dateIso, todayIso);
            return (
              <div key={s.id} className="soft-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{s.club}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.title} · {formatDate(s.dateIso)}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-primary">
                    {days >= 0 ? `za ${days} dni` : "termin minął"}
                  </span>
                </div>
                <button
                  onClick={() => store.update(s.id, { addedToPlan: !s.addedToPlan })}
                  className={`mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold transition-transform duration-200 active:scale-[0.98] ${
                    s.addedToPlan
                      ? "bg-accent text-primary"
                      : "bg-primary text-primary-foreground"
                  }`}
                >
                  <CalendarPlus className="h-4 w-4" />
                  {s.addedToPlan
                    ? "Oznaczone jako ważne wydarzenie"
                    : "Dodaj do planu jako ważne wydarzenie"}
                </button>
                {s.addedToPlan && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Termin jest oznaczony dla LoadWise. Plan zmieni się dopiero po Twoim
                    potwierdzeniu w zakładce Plan.
                  </p>
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* Powiadomienia */}
      <section className="soft-card space-y-3 p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <BellRing className="h-4 w-4 text-primary" /> Powiadomienia
        </h2>
        <Toggle
          label="Zgoda na powiadomienia"
          checked={store.prefs.enabled}
          onChange={(v) =>
            store.setPrefs(
              v
                ? { enabled: true }
                : { enabled: false, newMatches: false, deadlineEnding: false, reminder48h: false },
            )
          }
        />
        <Toggle
          label="Nowa dopasowana szansa"
          disabled={!store.prefs.enabled}
          checked={store.prefs.newMatches}
          onChange={(v) => store.setPrefs({ newMatches: v })}
        />
        <Toggle
          label="Koniec zgłoszeń"
          disabled={!store.prefs.enabled}
          checked={store.prefs.deadlineEnding}
          onChange={(v) => store.setPrefs({ deadlineEnding: v })}
        />
        <Toggle
          label="Przypomnienie 48 h przed testem"
          disabled={!store.prefs.enabled}
          checked={store.prefs.reminder48h}
          onChange={(v) => store.setPrefs({ reminder48h: v })}
        />
      </section>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 ${disabled ? "opacity-50" : ""}`}
    >
      <span className="text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

function OpportunityCard({
  o,
  todayIso,
  saved,
  onSave,
}: {
  o: Opportunity;
  todayIso: string;
  saved: boolean;
  onSave: () => void;
}) {
  const days = countdownDays(o.dateIso, todayIso);
  const [open, setOpen] = useState(false);
  return (
    <div className="soft-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{o.club}</div>
          <div className="text-xs text-muted-foreground">
            {o.title} · {o.city} · {formatDate(o.dateIso)}
          </div>
        </div>
        {days <= 7 && (
          <span className="shrink-0 animate-pulse rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-primary">
            wkrótce
          </span>
        )}
      </div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="mt-2 text-xs font-medium text-primary"
      >
        {open ? "Ukryj szczegóły" : "Szczegóły i wymagania"}
      </button>
      <div
        className="grid transition-all duration-[220ms] ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <p className="pt-2 text-xs leading-snug text-muted-foreground">
            {o.requirements} · Wiek {o.ageMin}–{o.ageMax}. Weryfikacja:{" "}
            {formatDate(o.verifiedAtIso)}.
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {o.phone && <Action href={`tel:${o.phone}`} icon={Phone} label="Zadzwoń" />}
        {o.email && <Action href={`mailto:${o.email}`} icon={Mail} label="Napisz" />}
        <Action href={o.sourceUrl} icon={ExternalLink} label="Otwórz źródło" external />
        <button
          onClick={onSave}
          disabled={saved}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          <BookmarkPlus className="h-3.5 w-3.5" /> {saved ? "Zapisano" : "Zapisz"}
        </button>
      </div>
    </div>
  );
}

function Action({
  href,
  icon: Icon,
  label,
  external,
}: {
  href: string;
  icon: typeof Phone;
  label: string;
  external?: boolean;
}) {
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs font-medium"
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </a>
  );
}
