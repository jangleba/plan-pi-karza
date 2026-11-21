import { useMemo, useState } from "react";
import { buildIcs, drillById, inviteText, inviteUrl, placeLabel, PLACES, replyText, toLocalInput, whenLabel, LIMITS, type Answer, type Drill, type Invite, type PlaceKind } from "./engine";
import { HalfPitchView } from "./HalfPitch";
import { copyText, shareOrCopy } from "./lib/share";
import { Sheet } from "./Sheet";

const field = "w-full rounded-2xl border border-hairline bg-card px-4 py-3 text-base outline-none transition focus:border-accent";
const chip = (on: boolean) => `rounded-full border px-3.5 py-2 text-sm ${on ? "bw-sel font-medium" : "border-hairline bg-canvas"}`;

const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return toLocalInput(d).slice(0, 10); };
const todayInput = () => toLocalInput(new Date()).slice(0, 10);

/** Zasady bezpieczeństwa przy umawianiu się na trening (krótko, bez straszenia). */
function SafetyNote({ minor }: { minor: boolean }) {
  return (
    <div className="mt-4 rounded-2xl bg-canvas p-3 text-xs leading-snug text-muted">
      <p className="font-medium text-ink/80">Bezpiecznie</p>
      <ul className="mt-1 list-disc pl-4">
        <li>Wysyłaj zaproszenie tylko osobom, które znasz.</li>
        <li>Wybierz miejsce publiczne i napisz komuś bliskiemu, gdzie i z kim trenujesz.</li>
        {minor && <li>Masz mniej niż 18 lat: powiedz o treningu opiekunowi.</li>}
        <li>To zwykły link: aplikacja nie wysyła Twojej lokalizacji ani danych na serwer.</li>
      </ul>
    </div>
  );
}

/** Tworzenie zaproszenia: termin, miejsce, opcjonalnie imię i notatka; wysłanie przez „Udostępnij” albo skopiowanie. */
export function InviteComposer({ drill, name, age, onClose }: { drill: Drill; name?: string; age?: number; onClose: () => void }) {
  const [date, setDate] = useState(tomorrow);
  const [time, setTime] = useState("17:00");
  const [place, setPlace] = useState<PlaceKind>("public");
  const [where, setWhere] = useState("");
  const [note, setNote] = useState("");
  const [withName, setWithName] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(time) && date >= todayInput();
  const invite = useMemo<Invite>(() => ({
    v: 1, drill: drill.id, at: `${date}T${time}`, place,
    ...(where.trim() ? { where: where.trim().slice(0, LIMITS.where) } : {}),
    ...(withName && name ? { from: name.slice(0, LIMITS.from) } : {}),
    ...(note.trim() ? { note: note.trim().slice(0, LIMITS.note) } : {}),
  }), [drill.id, date, time, place, where, note, withName, name]);
  const url = inviteUrl(window.location.origin + window.location.pathname, invite);
  const text = inviteText(invite, drill.title, url);

  const send = async () => {
    const r = await shareOrCopy(text, "Zaproszenie na trening");
    setMsg(r === "shared" ? "Wysłano. Czekaj na odpowiedź od znajomego." : r === "copied" ? "Skopiowano wiadomość z linkiem. Wklej ją w komunikatorze lub SMS-ie." : r === "failed" ? "Nie udało się skopiować. Zaznacz tekst poniżej i skopiuj go ręcznie." : null);
  };
  const copyLink = async () => setMsg((await copyText(url)) ? "Skopiowano sam link." : "Nie udało się skopiować. Zaznacz tekst poniżej i skopiuj go ręcznie.");

  return (
    <Sheet title="Zaproś partnera do treningu" onClose={onClose}>
      <p className="text-sm text-muted">Wyślij znajomemu lub koledze z drużyny link do tego ćwiczenia. Otworzy się u niego z ułożeniem stożków na połowie boiska i Twoim terminem.</p>
      <div className="mt-4 rounded-2xl bg-canvas px-4 py-3"><p className="text-xs text-muted">Ćwiczenie</p><p className="text-[15px] font-medium">{drill.title}</p></div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="block"><span className="mb-1 block text-xs text-muted">Dzień</span><input type="date" value={date} min={todayInput()} onChange={(e) => setDate(e.target.value)} className={field} /></label>
        <label className="block"><span className="mb-1 block text-xs text-muted">Godzina</span><input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={field} /></label>
      </div>
      {!valid && <p className="mt-1 text-xs text-red-ink" role="alert">Wybierz dzień (od dziś) i godzinę.</p>}

      <p className="mb-2 mt-5 text-xs uppercase tracking-wide text-muted">Gdzie</p>
      <div className="flex flex-wrap gap-2">{PLACES.map(([k, t]) => <button key={k} onClick={() => setPlace(k)} className={chip(place === k)}>{t}</button>)}</div>
      <input value={where} onChange={(e) => setWhere(e.target.value)} maxLength={LIMITS.where} placeholder="Nazwa miejsca (opcjonalnie), np. przy ul. Szkolnej" aria-label="Nazwa miejsca" className={`mt-2 ${field}`} />
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={LIMITS.note} placeholder="Krótka notatka (opcjonalnie)" aria-label="Notatka" className={`mt-2 ${field}`} />
      {name && (
        <label className="mt-3 flex items-center gap-3 text-sm">
          <input type="checkbox" checked={withName} onChange={(e) => setWithName(e.target.checked)} className="h-5 w-5 accent-[var(--color-accent)]" />
          Dodaj moje imię ({name}) do zaproszenia
        </label>
      )}

      <p className="mb-1 mt-5 text-xs uppercase tracking-wide text-muted">Tak zobaczy to znajomy</p>
      <textarea readOnly value={text} rows={6} aria-label="Treść zaproszenia" className="w-full resize-none rounded-2xl border border-hairline bg-canvas px-4 py-3 text-sm leading-snug text-ink/85" />

      <button onClick={() => void send()} disabled={!valid} className="bw-grad mt-4 w-full rounded-2xl py-4 text-base font-medium disabled:opacity-40">Wyślij zaproszenie</button>
      <button onClick={() => void copyLink()} disabled={!valid} className="mt-2 w-full rounded-2xl py-3 text-sm text-accent disabled:opacity-40">Skopiuj sam link</button>
      {msg && <p className="mt-2 text-sm text-ink/80" role="status">{msg}</p>}
      <SafetyNote minor={age !== undefined && age < 18} />
    </Sheet>
  );
}

/** Odbiór zaproszenia: szczegóły, układ ćwiczenia na połowie boiska, odpowiedź i dodanie do kalendarza. */
export function InviteReceiver({ invite, age, onClose }: { invite: Invite; age?: number; onClose: () => void }) {
  const drill = drillById(invite.drill)!;
  const [msg, setMsg] = useState<string | null>(null);
  const past = new Date(invite.at).getTime() < Date.now() - 3_600_000;

  const reply = async (a: Answer) => {
    const r = await shareOrCopy(replyText(a, invite, drill.title), "Odpowiedź na zaproszenie");
    setMsg(r === "shared" ? "Odpowiedź wysłana." : r === "copied" ? "Skopiowano odpowiedź. Wklej ją w rozmowie z osobą, która zaprosiła." : r === "failed" ? "Nie udało się skopiować odpowiedzi." : null);
  };
  const toCalendar = () => {
    const url = URL.createObjectURL(new Blob([buildIcs(invite, drill.title)], { type: "text/calendar;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = "trening.ics"; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <Sheet title="Zaproszenie na trening" onClose={onClose}>
      <p className="text-[15px]">{invite.from ? <><b>{invite.from}</b> zaprasza Cię na trening z piłką.</> : "Ktoś zaprasza Cię na trening z piłką."}</p>
      <div className="mt-3 divide-y divide-hairline rounded-2xl border border-hairline bg-card text-sm">
        {[["Ćwiczenie", drill.title], ["Termin", whenLabel(invite.at)], ["Miejsce", placeLabel(invite)], ...(invite.note ? [["Notatka", invite.note]] : [])].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 px-4 py-2.5"><span className="text-muted">{k}</span><span className="text-right font-medium">{v}</span></div>
        ))}
      </div>
      {past && <p className="mt-2 text-xs text-yellow-ink" role="status">Ten termin już minął. Możesz ustalić nowy z osobą, która zaprosiła.</p>}

      <p className="mb-2 mt-5 text-xs uppercase tracking-wide text-muted">Układ ćwiczenia</p>
      <HalfPitchView drill={drill} />
      <p className="mt-3 text-sm font-medium">Cel</p>
      <p className="text-sm text-ink/85">{drill.goal}</p>
      <p className="mt-1 text-xs text-muted">{drill.dose}</p>

      <div className="mt-5 grid grid-cols-2 gap-2">
        <button onClick={() => void reply("yes")} className="bw-grad rounded-2xl py-3.5 text-base font-medium">Będę</button>
        <button onClick={() => void reply("no")} className="rounded-2xl border border-hairline bg-card py-3.5 text-base">Nie dam rady</button>
      </div>
      <button onClick={toCalendar} className="mt-2 w-full rounded-2xl py-3 text-sm text-accent">Dodaj do kalendarza</button>
      {msg && <p className="mt-2 text-sm text-ink/80" role="status">{msg}</p>}
      <div className="mt-4 rounded-2xl bg-canvas p-3 text-xs leading-snug text-muted">
        To zwykły link od osoby, która go wysłała. Nie znasz jej? Zamknij to okno i nie umawiaj się. Na trening wybierz miejsce publiczne i powiedz komuś bliskiemu, gdzie jesteś{age !== undefined && age < 18 ? "; masz mniej niż 18 lat, więc powiedz o tym opiekunowi" : ""}.
      </div>
    </Sheet>
  );
}
