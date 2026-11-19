import { useMemo, useState } from "react";
import { Empty } from "./Sketch";
import { Sheet } from "./Sheet";
import { Group, LargeTitle, ListRow, MiniRing } from "./ui";
import { localISO, SHOP, adviceAround, dailyTargets, hoursUntil, planForProfile, weekStartOf } from "./engine";
import type { ActivityKind, DayKind, Goal, Profile, Tip } from "./engine";

type Mode = "now" | "shop" | "log";
interface Meal { date: string; time: string; name: string; carb: number; protein: number }

const today = () => localISO();
const field = "w-full rounded-xl bg-canvas px-3 py-2.5 text-sm outline-none";

function load<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function save(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* brak pamięci */ }
}

function TipCard({ t }: { t: Tip }) {
  return (
    <div className="mb-2.5 rounded-2xl bg-card p-4 border border-hairline">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{t.title}</h3>
        {t.amount && <span className="rounded-full border border-hairline bg-canvas px-2.5 py-0.5 text-xs font-medium text-ink">{t.amount}</span>}
      </div>
      <p className="mt-1 text-sm text-muted">{t.body}</p>
      {t.amount && <p className="mt-1 text-[11px] text-muted">{t.uefa ? "Zalecenie UEFA dla piłkarzy" : "Orientacyjnie"}</p>}
    </div>
  );
}

function dayKindOf(profile: Profile): DayKind {
  const ws = weekStartOf(today());
  const plan = planForProfile(profile, ws);
  const d = plan.days.find((x) => x.date === today());
  if (!d) return "light";
  if (d.isMatch) return "match";
  if (d.phase === "MD-1") return "pre-match";
  const k = d.session?.kind;
  return k === "strength" || k === "run" || k === "sprint" || d.isClub ? "training" : "light";
}

function Now({ profile }: { profile: Profile }) {
  const [kind, setKind] = useState<ActivityKind>("session");
  const [time, setTime] = useState("18:00");
  const [done, setDone] = useState(false);
  // „Przede mną": najbliższa taka godzina (dziś lub jutro); „Już po": ostatnia taka godzina.
  const raw = hoursUntil(time, new Date());
  const hours = done ? (raw > 0 ? raw - 24 : raw) : raw < 0 ? raw + 24 : raw;
  const tips = adviceAround(hours, kind, profile.weightKg);
  const label = hours >= 0 ? `Za ${hours.toFixed(1).replace(".", ",")} h` : `${(-hours).toFixed(1).replace(".", ",")} h temu`;
  return (
    <>
      <section className="mb-4 rounded-2xl bg-card p-4 border border-hairline">
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

function Shop() {
  const block = (title: string, items: readonly string[]) => (
    <section className="mb-3 rounded-2xl bg-card p-4 border border-hairline">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <ul className="list-disc pl-4 text-sm">{items.map((i) => <li key={i}>{i}</li>)}</ul>
    </section>
  );
  return (
    <>
      {block("Kup", SHOP.buy)}
      {block("Ogranicz", SHOP.limit)}
      {block("Mało czasu", SHOP.quick)}
      <p className="text-xs text-muted">{SHOP.note}</p>
    </>
  );
}

function Log({ profile, onChange }: { profile: Profile; onChange: () => void }) {
  const [goal, setGoalState] = useState<Goal>(() => load<Goal>("fuelGoal", "maintain"));
  const [meals, setMeals] = useState<Meal[]>(() => load<Meal[]>("meals", []));
  const [name, setName] = useState(""); const [carb, setCarb] = useState(""); const [protein, setProtein] = useState("");
  const day = useMemo(() => dayKindOf(profile), [profile]);
  const targets = dailyTargets(profile.weightKg, day, goal);
  const todays = meals.filter((m) => m.date === today());
  const sum = (k: "carb" | "protein") => todays.reduce((a, m) => a + m[k], 0);

  const setGoal = (g: Goal) => { setGoalState(g); save("fuelGoal", g); onChange(); };
  const add = () => {
    if (!name.trim()) return;
    const now = new Date();
    const next = [...meals, { date: today(), time: now.toTimeString().slice(0, 5), name: name.trim(), carb: Number(carb.replace(",", ".")) || 0, protein: Number(protein.replace(",", ".")) || 0 }];
    setMeals(next); save("meals", next); setName(""); setCarb(""); setProtein(""); onChange();
  };
  const bar = (label: string, v: number, [lo, hi]: [number, number]) => (
    <div className="mb-3">
      <div className="mb-1 flex justify-between text-xs text-muted"><span>{label}</span><span>{v} / {lo}–{hi} g</span></div>
      <div className="h-1.5 rounded-full bg-canvas"><div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, (v / hi) * 100)}%`, background: "var(--color-accent)" }} /></div>
    </div>
  );
  return (
    <>
      <section className="mb-4 rounded-2xl bg-card p-4 border border-hairline">
        <div className="mb-3 flex gap-1.5 rounded-xl bg-canvas p-1">
          {([["maintain", "Utrzymanie"], ["gain", "Masa"], ["lose", "Redukcja"]] as Array<[Goal, string]>).map(([g, t]) => (
            <button key={g} onClick={() => setGoal(g)} className={`flex-1 rounded-lg py-1.5 text-sm ${goal === g ? "bg-card font-medium shadow-sm" : "text-muted"}`}>{t}</button>
          ))}
        </div>
        {bar("Węglowodany", sum("carb"), targets.carbG)}
        {bar("Białko", sum("protein"), targets.proteinG)}
        <p className="text-xs text-muted">Białko 1,6–2,2 g/kg dziennie w 3–4 posiłkach (UEFA).</p>
      </section>
      <section className="mb-4 rounded-2xl bg-card p-4 border border-hairline">
        <h3 className="mb-3 text-sm font-semibold">Dodaj posiłek</h3>
        <input className={`${field} mb-2`} placeholder="Co zjadłeś" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="mb-3 flex gap-2">
          <input className={field} inputMode="decimal" placeholder="Węgle (g)" value={carb} onChange={(e) => setCarb(e.target.value)} />
          <input className={field} inputMode="decimal" placeholder="Białko (g)" value={protein} onChange={(e) => setProtein(e.target.value)} />
        </div>
        <button onClick={add} className="w-full rounded-xl bg-ink py-2.5 text-sm font-medium text-white">Dodaj</button>
      </section>
      {todays.length === 0 && <Empty kind="fuel">Dziś nic jeszcze nie dodano.</Empty>}
      {todays.length > 0 && (
        <ul className="rounded-2xl bg-card p-4 text-sm border border-hairline">
          {todays.map((m, i) => (
            <li key={i} className="flex justify-between py-1"><span>{m.time} · {m.name}</span><span className="text-muted">{m.carb} / {m.protein} g</span></li>
          ))}
        </ul>
      )}
    </>
  );
}

export function Fuel({ profile }: { profile: Profile }) {
  const [sheet, setSheet] = useState<Mode | null>(null);
  const [tick, setTick] = useState(0);
  void tick;
  const day = dayKindOf(profile);
  const targets = dailyTargets(profile.weightKg, day, load<Goal>("fuelGoal", "maintain"));
  const todays = load<Meal[]>("meals", []).filter((m) => m.date === today());
  const sum = (k: "carb" | "protein") => todays.reduce((a, m) => a + m[k], 0);
  const carb = sum("carb"), protein = sum("protein");

  return (
    <main className="mx-auto max-w-md px-5 pb-28 pt-14">
      <LargeTitle kind="fuel" title="Fuel" sub="Dziś" />
      <div className="bw-rise mb-8 flex justify-center gap-10">
        <MiniRing value={carb / targets.carbG[0]} label="Węglowodany" center={<>{carb}<span className="text-xs text-muted">g</span></>} />
        <MiniRing value={protein / targets.proteinG[0]} label="Białko" center={<>{protein}<span className="text-xs text-muted">g</span></>} />
      </div>
      <Group>
        <ListRow index={1} title="Przed i po wysiłku" sub="Co zjeść teraz" onTap={() => setSheet("now")} />
        <ListRow index={2} title="Dziennik" detail={`${todays.length} ${todays.length === 1 ? "posiłek" : "posiłki"}`} onTap={() => setSheet("log")} />
        <ListRow index={3} title="Zakupy" sub="Co kupić, czego unikać" onTap={() => setSheet("shop")} />
      </Group>
      <p className="px-1 text-xs text-muted">Cel dzienny: {targets.carbG[0]}–{targets.carbG[1]} g węglowodanów, {targets.proteinG[0]}–{targets.proteinG[1]} g białka.</p>

      {sheet === "now" && <Sheet title="Przed i po wysiłku" onClose={() => setSheet(null)}><Now profile={profile} /></Sheet>}
      {sheet === "log" && <Sheet title="Dziennik" onClose={() => setSheet(null)}><Log profile={profile} onChange={() => setTick((t) => t + 1)} /></Sheet>}
      {sheet === "shop" && <Sheet title="Zakupy" onClose={() => setSheet(null)}><Shop /></Sheet>}
    </main>
  );
}
