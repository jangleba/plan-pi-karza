import { useState } from "react";
import { SHOP, adviceAround, hoursUntil } from "../engine";
import type { ActivityKind, Profile, Tip } from "../engine";

function TipCard({ t }: { t: Tip }) {
  return (
    <div className="mb-2.5 rounded-2xl border border-hairline bg-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{t.title}</h3>
        {t.amount && <span className="rounded-full border border-hairline bg-canvas px-2.5 py-0.5 text-xs font-medium text-ink">{t.amount}</span>}
      </div>
      <p className="mt-1 text-sm text-muted">{t.body}</p>
      {t.amount && <p className="mt-1 text-[11px] text-muted">{t.uefa ? "Zalecenie UEFA dla piłkarzy" : "Orientacyjnie"}</p>}
    </div>
  );
}

/** Narzędzie „co zjeść wokół wysiłku o dowolnej porze” (wcześniejszy ekran Fuel). */
export function Around({ profile }: { profile: Profile }) {
  const [kind, setKind] = useState<ActivityKind>("session");
  const [time, setTime] = useState("18:00");
  const [done, setDone] = useState(false);
  // „Przede mną”: najbliższa taka godzina (dziś lub jutro); „Już po”: ostatnia taka godzina.
  const raw = hoursUntil(time, new Date());
  const hours = done ? (raw > 0 ? raw - 24 : raw) : raw < 0 ? raw + 24 : raw;
  const tips = adviceAround(hours, kind, profile.weightKg);
  const label = hours >= 0 ? `Za ${hours.toFixed(1).replace(".", ",")} h` : `${(-hours).toFixed(1).replace(".", ",")} h temu`;
  return (
    <>
      <section className="mb-4 rounded-2xl border border-hairline bg-card p-4">
        <div className="mb-3 flex gap-1.5 rounded-xl bg-canvas p-1">
          {([["session", "Trening"], ["match", "Mecz"]] as Array<[ActivityKind, string]>).map(([k, t]) => (
            <button key={k} onClick={() => setKind(k)} className={`flex-1 rounded-lg py-1.5 text-sm ${kind === k ? "bg-card font-medium shadow-sm" : "text-muted"}`}>{t}</button>
          ))}
        </div>
        <div className="mb-3 flex gap-1.5 rounded-xl bg-canvas p-1">
          {([[false, "Przede mną"], [true, "Już po"]] as Array<[boolean, string]>).map(([d, t]) => (
            <button key={t} onClick={() => setDone(d)} className={`flex-1 rounded-lg py-1.5 text-sm ${done === d ? "bg-card font-medium shadow-sm" : "text-muted"}`}>{t}</button>
          ))}
        </div>
        <label className="flex items-center justify-between text-sm text-muted">
          Godzina startu
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="rounded-lg bg-canvas px-2 py-1 text-ink outline-none" />
        </label>
        <p className="mt-3 text-sm font-medium">{label}</p>
      </section>
      {tips.map((t) => <TipCard key={t.title} t={t} />)}
      {kind === "match" && hours > -2 && hours <= 1 && (
        <TipCard t={{ title: "W trakcie meczu", body: "Węglowodany w płynie lub żelu, regularnie.", amount: "30–60 g na godzinę", uefa: true }} />
      )}
    </>
  );
}

/** Wskazówki zakupowe (ogólne): czego unikać i szybkie opcje. */
export function ShopTips() {
  const block = (title: string, items: readonly string[]) => (
    <section className="mb-3 rounded-2xl border border-hairline bg-card p-4">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <ul className="list-disc pl-4 text-sm">{items.map((i) => <li key={i}>{i}</li>)}</ul>
    </section>
  );
  return (
    <>
      {block("Ogranicz", SHOP.limit)}
      {block("Mało czasu", SHOP.quick)}
      <p className="text-xs text-muted">{SHOP.note}</p>
    </>
  );
}
