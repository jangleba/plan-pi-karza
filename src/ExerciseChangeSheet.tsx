import { useState } from "react";
import { Sheet } from "./Sheet";
import { VARIANTS, allItems, previewExerciseChange, qualify, selfConfirmable, swapCandidates } from "./engine";
import type { AthleteContext, GeneratedSession, Operation, Unlock } from "./engine";

export type ChangeMode = { kind: "item"; itemId: string } | { kind: "add" } | { kind: "omitted" };

interface Props {
  mode: ChangeMode;
  session: GeneratedSession;
  ctx: AthleteContext;
  /** Zwraca komunikat błędu albo null po powodzeniu. */
  onApply: (op: Operation, ack: boolean, remember: boolean) => string | null;
  onUnlock: (u: Unlock | Unlock[]) => void;
  onClose: () => void;
}

const SCOPE: Record<string, string> = { equivalent_for_slot: "Ten sam cel", changes_stimulus: "Zmienia bodziec", changes_session_goal: "Zmienia cel sesji" };

function UnlockButton({ u, onUnlock }: { u?: Unlock; onUnlock: (u: Unlock | Unlock[]) => void }) {
  if (!u) return null;
  const qualified = u.tokens.some((t) => t.startsWith("qualified_instruction"));
  const label = u.kind === "supervision" ? "Ćwiczę pod nadzorem trenera" : u.kind === "gear" ? "Mam ten sprzęt lub miejsce" : qualified ? "Mam przeszkolenie" : "Potwierdzam, że to umiem";
  return <button type="button" onClick={() => onUnlock(u)} className="mt-1.5 rounded-xl bg-card px-3 py-1.5 text-xs font-medium text-accent">{label}</button>;
}

/** Zmiana ćwiczenia w sesji: zamiana (tylko zatwierdzone relacje), usunięcie, dodanie i lista pominiętych z powodami. */
export function ExerciseChangeSheet({ mode, session, ctx, onApply, onUnlock, onClose }: Props) {
  const [remember, setRemember] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const run = (op: Operation, ack: boolean) => { const e = onApply(op, ack, remember); if (e) setMsg(e); else onClose(); };

  if (mode.kind === "omitted") {
    // jedno dotknięcie na to, co zawodnik może sam potwierdzić; nadzór i przeszkolenie specjalisty zostają osobno
    const bulk = selfConfirmable(session.omitted.map((o) => o.unlock));
    return (
      <Sheet title="Pominięte ćwiczenia" onClose={onClose}>
        <p className="mb-3 text-sm text-muted">Tych ćwiczeń nie ma w planie, bo nie spełniają wymagań. Jeśli to prawda, że możesz je wykonać, potwierdź to poniżej.</p>
        {bulk.length > 1 && (
          <button type="button" onClick={() => onUnlock(bulk)} className="mb-3 w-full rounded-2xl bw-grad py-3 text-sm font-medium">Potwierdzam wszystko z listy ({bulk.length}) – umiem to i mam sprzęt</button>
        )}
        {session.omitted.length === 0 && <p className="text-sm text-muted">Nic nie pominięto.</p>}
        {session.omitted.map((o) => (
          <div key={o.itemId + o.code} className="mb-2 rounded-2xl bg-canvas p-3">
            <div className="text-sm font-medium">{VARIANTS[o.plannedVariantId]?.namePl ?? o.plannedVariantId}</div>
            <div className="text-xs text-muted">{o.messagePl}</div>
            <UnlockButton u={o.unlock} onUnlock={onUnlock} />
          </div>
        ))}
      </Sheet>
    );
  }

  if (mode.kind === "add") {
    const inSession = new Set(allItems(session).map((i) => i.variantId));
    const strengthSession = session.module === "strength";
    const rows = Object.values(VARIANTS)
      .filter((v) => !inSession.has(v.id) && v.movementPatterns.some((p) => (strengthSession ? ["squat", "hinge", "push", "pull", "core", "calf", "hipflexor"] : ["sprint", "cod", "drill"]).includes(p)))
      .map((v) => ({ v, q: qualify(v, ctx) }));
    const ok = rows.filter((r) => r.q.ok);
    return (
      <Sheet title="Dodaj ćwiczenie" onClose={onClose}>
        <p className="mb-3 text-sm text-muted">Pokazujemy tylko ćwiczenia, które spełniają Twoje wymagania. Dodanie sprawdza czas sesji z odpoczynkiem.</p>
        {msg && <p className="mb-2 rounded-xl border border-hairline bg-canvas px-3 py-2 text-sm">{msg}</p>}
        {ok.length === 0 && <p className="text-sm text-muted">Brak dostępnych ćwiczeń. Sprawdź „Pominięte ćwiczenia”, żeby uzupełnić dane.</p>}
        {ok.map(({ v }) => (
          <button key={v.id} type="button" onClick={() => run({ kind: "add", variantId: v.id }, false)} className="mb-2 block w-full rounded-2xl bg-canvas p-3 text-left text-sm font-medium">{v.namePl}</button>
        ))}
      </Sheet>
    );
  }

  const cur = allItems(session).find((i) => i.itemId === mode.itemId);
  if (!cur) return <Sheet title="Zmień ćwiczenie" onClose={onClose}><p className="text-sm text-muted">Tego ćwiczenia nie ma już w sesji.</p></Sheet>;
  const cands = swapCandidates(session, cur.itemId, ctx);
  return (
    <Sheet title={VARIANTS[cur.variantId]?.namePl ?? cur.variantId} onClose={onClose}>
      {msg && <p className="mb-2 rounded-xl border border-hairline bg-canvas px-3 py-2 text-sm">{msg}</p>}
      <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">Zamień na</h3>
      {cands.length === 0 && <p className="mb-2 text-sm text-muted">Brak zatwierdzonych zamienników. Możesz usunąć ćwiczenie albo zostawić je w planie.</p>}
      {cands.map(({ relation, variant, q }) => {
        const op: Operation = { kind: "swap", itemId: cur.itemId, toVariantId: variant.id };
        const prev = q.ok ? previewExerciseChange(session, op, ctx) : null;
        return (
          <div key={variant.id} className="mb-2 rounded-2xl bg-canvas p-3">
            <div className="text-sm font-medium">{variant.namePl}</div>
            <div className="text-xs text-muted">{SCOPE[relation.scope]} · {relation.rationalePl}</div>
            {!q.ok && <><div className="mt-1 text-xs text-muted">{q.messagePl}</div><UnlockButton u={q.unlock} onUnlock={onUnlock} /></>}
            {prev && !prev.ok && <div className="mt-1 text-xs text-muted">{prev.reasons[0]?.messagePl}</div>}
            {prev?.ok && (
              <>
                {prev.warnings.map((w) => <div key={w} className="mt-1 text-xs text-ink/80">{w}</div>)}
                <div className="mt-1 text-xs text-muted">Dawkę dobierzemy od nowa – kg i powtórzenia z poprzedniego ćwiczenia nie przechodzą.</div>
                {prev.requiresAck && pending !== variant.id ? (
                  <button type="button" onClick={() => setPending(variant.id)} className="mt-2 rounded-xl bg-card px-3 py-1.5 text-sm font-medium">Zmień cel tego miejsca…</button>
                ) : (
                  <button type="button" onClick={() => run(op, prev.requiresAck)} className="mt-2 rounded-xl bw-grad px-3 py-1.5 text-sm font-medium">{prev.requiresAck ? "Potwierdzam zmianę celu" : "Zamień"}</button>
                )}
              </>
            )}
          </div>
        );
      })}
      <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />Zapamiętaj na przyszłe sesje (nadal sprawdzimy wymagania)</label>
      <button type="button" onClick={() => run({ kind: "remove", itemId: cur.itemId }, false)} className="mt-4 w-full rounded-2xl bg-canvas py-3 text-sm text-ink">Usuń z dzisiejszej sesji</button>
    </Sheet>
  );
}
