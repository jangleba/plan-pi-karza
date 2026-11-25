import { useState } from "react";
import { Sheet } from "../Sheet";
import { scoped } from "../lib/store";
import { installSteps, type InstallContext } from "./platform";
import { applyUpdate, promptInstall, useInstallContext, useUpdateReady } from "./register";

const HIDE_KEY = "installCardHiddenUntil";
const TITLE: Record<InstallContext, string> = {
  installed: "",
  "ios-safari": "Dodaj BallWise do ekranu początkowego",
  "ios-other": "Dodaj BallWise do ekranu początkowego",
  "in-app": "Otwórz BallWise w przeglądarce",
  "android-prompt": "Zainstaluj BallWise",
  "android-manual": "Dodaj BallWise do ekranu głównego",
  desktop: "BallWise na komputerze",
};

function Steps({ ctx }: { ctx: InstallContext }) {
  return (
    <ol className="mt-3 space-y-2.5">
      {installSteps(ctx).map((s, i) => (
        <li key={i} className="flex gap-3 text-[15px] leading-snug">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent">{i + 1}</span>
          <span className="pt-0.5">{s}</span>
        </li>
      ))}
    </ol>
  );
}

function InstallButton({ ctx }: { ctx: InstallContext }) {
  if (ctx !== "android-prompt") return null;
  return <button onClick={() => void promptInstall()} className="bw-grad mt-4 w-full rounded-2xl py-4 text-base font-medium">Zainstaluj</button>;
}

/** Karta na ekranie „Dziś”: widoczna na telefonie, dopóki BallWise nie jest otwierany z ikony; można ją ukryć na 14 dni. */
export function InstallCard() {
  const ctx = useInstallContext();
  const [hidden, setHidden] = useState(() => Number(scoped.getItem(HIDE_KEY) ?? 0) > Date.now());
  if (hidden || ctx === "installed" || ctx === "desktop") return null;
  const hide = () => { scoped.setItem(HIDE_KEY, String(Date.now() + 14 * 86_400_000)); setHidden(true); };
  return (
    <section className="bw-rise mb-3 rounded-3xl border border-hairline bg-card p-4" aria-label="Instalacja aplikacji">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[17px] font-semibold leading-tight">{TITLE[ctx]}</p>
          <p className="mt-1 text-[13px] text-muted">Jedno dotknięcie ikony i jesteś na ekranie „Dziś”, zalogowany.</p>
        </div>
        <button onClick={hide} className="-mr-1 -mt-1 rounded-full px-2 py-1 text-sm text-muted" aria-label="Ukryj na 14 dni">Później</button>
      </div>
      <Steps ctx={ctx} />
      <InstallButton ctx={ctx} />
    </section>
  );
}

/** Pełna instrukcja (z Ustawień): pokazuje też wersję dla drugiego systemu, np. gdy trener wysyła link zawodnikowi. */
export function InstallSheet({ onClose }: { onClose: () => void }) {
  const ctx = useInstallContext();
  const [other, setOther] = useState<InstallContext | null>(null);
  const shown = other ?? (ctx === "installed" ? null : ctx);
  return (
    <Sheet title="Ikona na ekranie głównym" onClose={onClose}>
      {ctx === "installed" && !other && <p className="rounded-2xl bg-mint px-4 py-3 text-sm text-mint-ink">BallWise jest już otwarty z ikony. Gotowe.</p>}
      {shown && <><p className="text-[17px] font-semibold">{TITLE[shown]}</p><Steps ctx={shown} /><InstallButton ctx={shown} /></>}
      <div className="mt-6 grid grid-cols-2 gap-2">
        <button onClick={() => setOther("ios-safari")} className={`rounded-2xl py-3 text-sm font-medium ${other === "ios-safari" ? "bw-sel" : "bg-canvas"}`}>iPhone / iPad</button>
        <button onClick={() => setOther("android-manual")} className={`rounded-2xl py-3 text-sm font-medium ${other === "android-manual" ? "bw-sel" : "bg-canvas"}`}>Android</button>
      </div>
      <p className="mt-4 text-xs text-muted">Bez sklepu z aplikacjami. Po dodaniu ikony zaloguj się raz w aplikacji – na iPhonie ikona ma osobne logowanie niż Safari.</p>
    </Sheet>
  );
}

/** Pasek „Nowa wersja”: aktualizacja dopiero po dotknięciu, żeby nie przerwać treningu. */
export function UpdateBanner({ busy }: { busy?: boolean }) {
  const ready = useUpdateReady();
  if (!ready) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-40 px-3 pt-[max(0.5rem,env(safe-area-inset-top))]" role="status">
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-hairline bg-card/95 px-4 py-3 shadow-lg backdrop-blur">
        <p className="flex-1 text-sm">{busy ? "Nowa wersja czeka – zaktualizujesz po treningu." : "Jest nowa wersja BallWise."}</p>
        {!busy && <button onClick={applyUpdate} className="rounded-xl bg-btn px-3 py-2 text-sm font-medium text-btn-ink">Odśwież</button>}
      </div>
    </div>
  );
}
