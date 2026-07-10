import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useLoadwise } from "@/lib/loadwise/store";
import { AppHeader, Disclaimer } from "@/components/loadwise/ui";
import { POSITION_LABELS, LEVEL_LABELS } from "@/lib/loadwise/labels";
import {
  Eye,
  EyeOff,
  ShieldCheck,
  ShieldAlert,
  Telescope,
  Building2,
  ClipboardList,
  Bookmark,
  BadgeCheck,
  ListChecks,
  CircleDashed,
  Lock,
} from "lucide-react";

export const Route = createFileRoute("/_tabs/scouting")({
  component: ScoutingScreen,
});

function SectionTitle({
  icon: Icon,
  children,
}: {
  icon: typeof Eye;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <Icon className="h-3.5 w-3.5" /> {children}
    </div>
  );
}

/** Uniwersalny pusty stan bez atrap. */
function EmptyState({
  icon: Icon,
  text,
}: {
  icon: typeof Building2;
  text: string;
}) {
  return (
    <div className="mt-3 flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-4">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="text-xs text-muted-foreground">{text}</span>
    </div>
  );
}

function ScoutingScreen() {
  const { state } = useLoadwise();
  const p = state.profile;

  const completeness = useMemo(() => {
    if (!p) return { pct: 0, missing: [] as string[] };
    const checks: { ok: boolean; label: string }[] = [
      { ok: !!p.name, label: "Imię" },
      { ok: !!p.age, label: "Wiek" },
      { ok: !!p.position, label: "Pozycja" },
      { ok: !!p.level, label: "Poziom" },
      { ok: !!p.goal, label: "Cel rozwojowy" },
      { ok: state.tests.length > 0, label: "Testy (min. 1)" },
      { ok: Object.keys(state.completions).length > 0, label: "Zapisane treningi" },
    ];
    const done = checks.filter((c) => c.ok).length;
    return {
      pct: Math.round((done / checks.length) * 100),
      missing: checks.filter((c) => !c.ok).map((c) => c.label),
    };
  }, [p, state.tests, state.completions]);

  if (!p) return null;

  const isMinor = p.age >= 13 && p.age < 18;
  // Widoczność dla scoutów jest domyślnie prywatna i wymaga weryfikacji danych (Faza 2).
  const isVisible = false;
  const readyForScouts = completeness.pct >= 80;

  return (
    <div>
      <AppHeader
        title="Scouting"
        subtitle="Twoja widoczność, szanse i kontakt z klubami."
      />

      <div className="space-y-3 px-5">
        {/* Widoczność profilu */}
        <div className="soft-card p-4">
          <SectionTitle icon={isVisible ? Eye : EyeOff}>
            Widoczność profilu
          </SectionTitle>
          <div className="mt-3 flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                isVisible
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground"
              }`}
            >
              {isVisible ? <Eye className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
              {isVisible ? "Widoczny dla scoutów" : "Tryb prywatny"}
            </span>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Twój profil jest prywatny. Widoczność dla scoutów i klubów uruchomimy
            po weryfikacji danych{isMinor ? " i po zgodzie opiekuna" : ""}.
          </p>
        </div>

        {/* Kompletność / gotowość */}
        <div className="soft-card p-4">
          <SectionTitle icon={ListChecks}>Gotowość profilu</SectionTitle>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Kompletność</span>
            <span className="text-sm font-semibold text-foreground">
              {completeness.pct}%
            </span>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${completeness.pct}%` }}
            />
          </div>
          <div className="mt-3 flex items-center gap-2 text-sm">
            {readyForScouts ? (
              <>
                <ShieldCheck className="h-4 w-4 text-primary" />
                <span>Profil gotowy do prezentacji scoutom.</span>
              </>
            ) : (
              <>
                <ShieldAlert className="h-4 w-4 text-destructive" />
                <span>Uzupełnij profil, aby był gotowy dla scoutów.</span>
              </>
            )}
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            {p.age} lat · {POSITION_LABELS[p.position]} · {LEVEL_LABELS[p.level]}
          </div>
        </div>

        {/* Braki w profilu */}
        {completeness.missing.length > 0 && (
          <div className="soft-card p-4">
            <SectionTitle icon={CircleDashed}>Braki w profilu</SectionTitle>
            <ul className="mt-3 space-y-1.5">
              {completeness.missing.map((m) => (
                <li
                  key={m}
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <CircleDashed className="h-3.5 w-3.5" /> {m}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Zgody dla niepełnoletnich */}
        {isMinor && (
          <div className="soft-card p-4">
            <SectionTitle icon={ShieldCheck}>Wymagane zgody</SectionTitle>
            <p className="mt-3 text-sm text-muted-foreground">
              Jesteś niepełnoletni. Przed publiczną widocznością profilu, kontaktem
              scouta, zaproszeniem na testy i udostępnieniem wideo wymagana jest
              zgoda rodzica lub opiekuna.
            </p>
            <div className="mt-3 flex items-center gap-2 text-sm">
              {p.guardianConsent ? (
                <>
                  <ShieldCheck className="h-4 w-4 text-primary" /> Zgoda opiekuna
                  potwierdzona
                </>
              ) : (
                <>
                  <ShieldAlert className="h-4 w-4 text-destructive" /> Brak zgody
                  opiekuna
                </>
              )}
            </div>
          </div>
        )}

        {/* Club Needs */}
        <div className="soft-card p-4">
          <SectionTitle icon={Building2}>Zapotrzebowania klubów</SectionTitle>
          <EmptyState
            icon={Building2}
            text="Brak aktywnych zapotrzebowań scoutingowych w Twoim regionie."
          />
        </div>

        {/* Opportunities / zaproszenia */}
        <div className="soft-card p-4">
          <SectionTitle icon={Telescope}>Szanse i zaproszenia</SectionTitle>
          <EmptyState
            icon={Telescope}
            text="Brak zaproszeń na testy ani zainteresowania klubów. Pojawią się tutaj, gdy Twój profil będzie widoczny i zweryfikowany."
          />
        </div>

        {/* Scout Reports */}
        <div className="soft-card p-4">
          <SectionTitle icon={ClipboardList}>Raporty scoutów</SectionTitle>
          <EmptyState
            icon={ClipboardList}
            text="Nie masz jeszcze żadnych raportów od scoutów."
          />
        </div>

        {/* Watchlist */}
        <div className="soft-card p-4">
          <SectionTitle icon={Bookmark}>Zapisane kluby</SectionTitle>
          <EmptyState
            icon={Bookmark}
            text="Nie obserwujesz jeszcze żadnych klubów."
          />
        </div>

        {/* Verification */}
        <div className="soft-card p-4">
          <SectionTitle icon={BadgeCheck}>Weryfikacja danych</SectionTitle>
          <div className="mt-3 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
              <ShieldAlert className="h-3.5 w-3.5" /> Dane zgłoszone przez Ciebie
              (niepotwierdzone)
            </span>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Dane z Twojego profilu są oznaczone jako „self-reported". Weryfikacja
            przez klub, scouta lub administratora pojawi się w kolejnym etapie.
          </p>
        </div>
      </div>

      <Disclaimer />
    </div>
  );
}
