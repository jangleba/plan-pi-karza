import { useMemo, useState } from "react";
import {
  MATCH_TAGS, MAX_TAGS, POSITION_LABEL, TAG_LABEL, deleteMatch, localISO, matchSummary, newMatchId, normalizeMatch, resultOf, saveMatch, tagInsights,
} from "./engine";
import type { MatchEntry, MatchResult, MatchTag, Position, Profile } from "./engine";
import { Sheet } from "./Sheet";
import { Group, ListRow } from "./ui";
import { TrendChart } from "./progress/TrendChart";
import { TREND_HEX } from "./progress/trend";
import { shortDate } from "./progress/metrics";

const RES: Record<MatchResult, { letter: string; label: string; hex: string }> = {
  W: { letter: "Z", label: "Zwycięstwo", hex: TREND_HEX.green },
  D: { letter: "R", label: "Remis", hex: TREND_HEX.neutral },
  L: { letter: "P", label: "Porażka", hex: TREND_HEX.red },
};
const MINUTES = [90, 75, 60, 45, 30, 15, 0];
const POSITIONS = Object.keys(POSITION_LABEL) as Position[];

/** Znaczek wyniku: Z / R / P w pastelowym kółku. */
export function ResultDot({ r, size = 28 }: { r: MatchResult; size?: number }) {
  const c = RES[r];
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full text-xs font-semibold" aria-label={c.label}
      style={{ width: size, height: size, background: `${c.hex}26`, color: c.hex }}>{c.letter}</span>
  );
}

function Stepper({ label, value, onChange, max = 30 }: { label: string; value: number; onChange: (v: number) => void; max?: number }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-canvas px-2 py-1.5">
      <button onClick={() => onChange(Math.max(0, value - 1))} disabled={value <= 0} aria-label={`${label}: mniej`}
        className="h-10 w-10 rounded-xl bg-card text-xl disabled:opacity-30">−</button>
      <span className="text-2xl font-semibold tabular-nums" aria-label={label}>{value}</span>
      <button onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`${label}: więcej`}
        className="h-10 w-10 rounded-xl bg-card text-xl disabled:opacity-30">+</button>
    </div>
  );
}

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="mb-5"><div className="mb-2 text-sm text-muted">{label}</div>{children}</div>
);

const chip = (on: boolean) => `rounded-full px-3.5 py-2 text-sm ${on ? "bw-sel font-medium" : "bg-canvas text-ink"}`;

interface Draft {
  id: string; date: string; opponent: string; gf: number; ga: number; minutes: number; position: Position;
  rating: number | null; goals: number; assists: number; well: MatchTag[]; badly: MatchTag[];
}

const draftOf = (m: MatchEntry): Draft => ({ ...m, opponent: m.opponent ?? "", rating: m.rating });

function TagPicker({ chosen, blocked, onChange }: { chosen: MatchTag[]; blocked: MatchTag[]; onChange: (t: MatchTag[]) => void }) {
  const full = chosen.length >= MAX_TAGS;
  return (
    <div className="flex flex-wrap gap-2">
      {MATCH_TAGS.map(([k, t]) => {
        const on = chosen.includes(k);
        const off = !on && (full || blocked.includes(k));
        return (
          <button key={k} disabled={off} aria-pressed={on} onClick={() => onChange(on ? chosen.filter((x) => x !== k) : [...chosen, k])}
            className={`${chip(on)} ${off ? "opacity-35" : ""}`}>{t}</button>
        );
      })}
    </div>
  );
}

function Form({ draft, today, editing, onChange, onSave, onDelete, onBack }: {
  draft: Draft; today: string; editing: boolean; onChange: (d: Draft) => void; onSave: () => void; onDelete: () => void; onBack: () => void;
}) {
  const [sure, setSure] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => onChange({ ...draft, [k]: v });
  const r = RES[resultOf(draft)];
  const minutes = MINUTES.includes(draft.minutes) ? MINUTES : [...MINUTES, draft.minutes].sort((a, b) => b - a);
  return (
    <>
      <button onClick={onBack} className="mb-4 text-sm text-accent">‹ Dziennik</button>

      <Field label="Data">
        <input type="date" value={draft.date} max={today} onChange={(e) => e.target.value && set("date", e.target.value)}
          className="w-full rounded-2xl bg-canvas px-4 py-3 text-base" aria-label="Data meczu" />
      </Field>

      <Field label="Wynik">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <Stepper label="Moja drużyna" value={draft.gf} onChange={(v) => set("gf", v)} />
          <span className="text-lg text-muted">:</span>
          <Stepper label="Rywal" value={draft.ga} onChange={(v) => set("ga", v)} />
        </div>
        <p className="mt-2 text-center text-sm font-medium" style={{ color: r.hex }}>{r.label}</p>
      </Field>

      <Field label="Przeciwnik">
        <input value={draft.opponent} onChange={(e) => set("opponent", e.target.value)} maxLength={40} placeholder="Opcjonalnie"
          className="w-full rounded-2xl bg-canvas px-4 py-3 text-base placeholder:text-muted/70" aria-label="Przeciwnik" />
      </Field>

      <Field label="Minuty">
        <div className="flex flex-wrap gap-2">
          {minutes.map((mi) => (
            <button key={mi} onClick={() => set("minutes", mi)} aria-pressed={draft.minutes === mi} className={chip(draft.minutes === mi)}>
              {mi === 0 ? "Ławka" : `${mi}′`}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Pozycja">
        <div className="flex flex-wrap gap-2">
          {POSITIONS.map((p) => (
            <button key={p} onClick={() => set("position", p)} aria-pressed={draft.position === p} className={chip(draft.position === p)}>{POSITION_LABEL[p]}</button>
          ))}
        </div>
      </Field>

      <Field label="Ocena meczu (1–10)">
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button key={n} onClick={() => set("rating", n)} aria-pressed={draft.rating === n} aria-label={`Ocena ${n}`}
              className={`rounded-2xl py-3 text-base tabular-nums ${draft.rating === n ? "bw-sel font-semibold" : "bg-canvas text-ink"}`}>{n}</button>
          ))}
        </div>
      </Field>

      <div className="mb-5 grid grid-cols-2 gap-3">
        <div><div className="mb-2 text-sm text-muted">Gole</div><Stepper label="Gole" value={draft.goals} onChange={(v) => set("goals", v)} max={20} /></div>
        <div><div className="mb-2 text-sm text-muted">Asysty</div><Stepper label="Asysty" value={draft.assists} onChange={(v) => set("assists", v)} max={20} /></div>
      </div>

      <Field label="Poszło dobrze (maks. 3)">
        <TagPicker chosen={draft.well} blocked={draft.badly} onChange={(t) => set("well", t)} />
      </Field>
      <Field label="Do poprawy (maks. 3)">
        <TagPicker chosen={draft.badly} blocked={draft.well} onChange={(t) => set("badly", t)} />
      </Field>

      <button onClick={onSave} disabled={draft.rating === null} className="bw-grad w-full rounded-2xl py-4 text-base font-medium disabled:opacity-40">
        {draft.rating === null ? "Wybierz ocenę" : "Zapisz"}
      </button>
      {editing && (
        <button onClick={() => (sure ? onDelete() : setSure(true))} className="mt-3 w-full rounded-2xl py-3 text-sm text-muted">
          {sure ? "Na pewno usunąć? Dotknij jeszcze raz" : "Usuń mecz"}
        </button>
      )}
    </>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-canvas px-2 py-3 text-center">
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

/** Dziennik meczów: forma sezonu, lista i formularz w jednej karcie (widok listy ↔ formularz). */
export function MatchLog({ profile, matches, startDate, onChange, onClose }: {
  profile: Profile; matches: MatchEntry[]; /** Otwiera od razu formularz z tą datą. */ startDate?: string;
  onChange: (m: MatchEntry[]) => void; onClose: () => void;
}) {
  const today = localISO();
  const blank = (date: string): Draft => ({
    id: newMatchId(), date, opponent: "", gf: 0, ga: 0, minutes: 90, position: profile.position, rating: null, goals: 0, assists: 0, well: [], badly: [],
  });
  const [draft, setDraft] = useState<Draft | null>(startDate ? blank(startDate) : null);
  const [editing, setEditing] = useState(false);
  const s = useMemo(() => matchSummary(matches, today), [matches, today]);
  const insights = useMemo(() => tagInsights(matches, today), [matches, today]);
  const list = useMemo(() => [...matches].reverse().slice(0, 30), [matches]);

  const save = () => {
    if (!draft || draft.rating === null) return;
    const entry = normalizeMatch({ ...draft, rating: draft.rating, opponent: draft.opponent });
    onChange(saveMatch(entry));
    setDraft(null);
  };
  const remove = () => {
    if (!draft) return;
    onChange(deleteMatch(draft.id));
    setDraft(null);
  };

  return (
    <Sheet title={draft ? (editing ? "Edytuj mecz" : "Nowy mecz") : "Dziennik meczów"} onClose={onClose}>
      {draft ? (
        <Form draft={draft} today={today} editing={editing} onChange={setDraft} onSave={save} onDelete={remove} onBack={() => setDraft(null)} />
      ) : (
        <>
          {s.count > 0 && (
            <>
              <div className="mb-4 grid grid-cols-4 gap-2">
                <Stat value={String(s.count)} label="Mecze" />
                <Stat value={String(s.minutes)} label="Minuty" />
                <Stat value={`${s.goals}+${s.assists}`} label="Gole+as." />
                <Stat value={s.avgRating === null ? "–" : String(s.avgRating).replace(".", ",")} label="Ocena" />
              </div>
              <div className="mb-5 flex items-center justify-between">
                <div className="flex gap-1.5" aria-label="Ostatnie wyniki">{s.form.map((r, i) => <ResultDot key={i} r={r} />)}</div>
                <span className="text-sm tabular-nums text-muted">{s.wins} Z · {s.draws} R · {s.losses} P</span>
              </div>
              {s.trend.length >= 2 && (
                <div className="mb-5">
                  <TrendChart points={s.trend} tone={s.tone} dec={1} />
                  <p className="mt-1 text-xs text-muted">Ocena własna, 1–10 – nie statystyka meczowa.</p>
                </div>
              )}
              {insights.length > 0 && (
                <div className="mb-5 flex flex-col gap-2">
                  {insights.map((i) => (
                    <div key={i.kind} className="flex items-center gap-3 rounded-2xl bg-canvas px-4 py-3 text-sm">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: i.kind === "badly" ? TREND_HEX.orange : TREND_HEX.green }} />
                      <span className="min-w-0 flex-1"><span className="font-medium">{TAG_LABEL[i.tag]}</span>
                        <span className="text-muted"> – {i.kind === "badly" ? "do poprawy" : "mocna strona"}</span></span>
                      <span className="shrink-0 tabular-nums text-muted">{i.n} z {i.of}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <button onClick={() => { setEditing(false); setDraft(blank(today)); }} className="bw-grad mb-5 w-full rounded-2xl py-4 text-base font-medium">Dodaj mecz</button>

          {list.length > 0 ? (
            <Group label="Mecze">
              {list.map((m, i) => (
                <ListRow key={m.id} index={i}
                  lead={<ResultDot r={resultOf(m)} size={32} />}
                  title={`${m.gf}:${m.ga}${m.opponent ? ` · ${m.opponent}` : ""}`}
                  sub={[shortDate(m.date), POSITION_LABEL[m.position].toLowerCase(), m.minutes ? `${m.minutes}′` : "ławka", m.goals ? `${m.goals} gol` : "", m.assists ? `${m.assists} as.` : ""].filter(Boolean).join(" · ")}
                  detail={<span className="tabular-nums font-semibold text-ink">{m.rating}</span>}
                  onTap={() => { setEditing(true); setDraft(draftOf(m)); }} />
              ))}
            </Group>
          ) : (
            <p className="mb-2 text-center text-sm text-muted">Zapisz pierwszy mecz – zobaczysz formę sezonu.</p>
          )}
        </>
      )}
    </Sheet>
  );
}
