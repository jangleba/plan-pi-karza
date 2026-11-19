import { describe, expect, it } from "vitest";
import { clearDirty, dueCount, dueIds, emptyDoc, lessonPath, mergeRemote, nextLesson, parseDoc, pendingRows, phraseIdsOf, setLevel, summarize, type EnglishDoc } from "./progress";
import { advance, answer, currentStep, finish, isFinished, restore, resumable, score, startLesson, startReview, type AnswerResult } from "./session";
import { LESSONS_META, lessonMeta } from "./meta";
import { addDays } from "./srs";

const D0 = "2026-11-19";
let t = 10_000;
const tick = () => ++t;
const meta = (id: string) => lessonMeta(id)!;

/** Przejście całej sesji; `wrongAt` – numery kroków (od 0), na które odpowiadamy błędnie. */
function run(doc: EnglishDoc, session: ReturnType<typeof startLesson>, day: string, wrongAt: number[] = []) {
  let s = session, d = doc;
  while (!isFinished(s)) {
    const st = currentStep(s)!;
    if (st.k !== "learn") {
      const r: AnswerResult = answer(d, s, !wrongAt.includes(s.idx), day, tick());
      s = r.session; d = r.doc;
    }
    const a = advance(d, s, tick()); s = a.session; d = a.doc;
  }
  return { doc: d, session: s };
}

describe("ścieżka nauki i karta", () => {
  it("pusty postęp: „Rozpocznij”, pierwsza lekcja, zero powtórek", () => {
    const s = summarize(emptyDoc(), D0);
    expect(s.primary).toBe("Rozpocznij");
    expect(s.next?.id).toBe("partners");
    expect(s).toMatchObject({ dueToday: 0, lessonsDone: 0, phrasesSeen: 0, phrasesMastered: 0, level: null, resuming: false });
  });
  it("poziom ustawia kolejność lekcji (nie blokuje żadnej): 1 → podstawowe najpierw, 2 → średnie, 3 → zaawansowane; zmiana poziomu możliwa w każdej chwili", () => {
    const first = (l: 1 | 2 | 3) => lessonPath(l).slice(0, 4).map((x) => x.id);
    expect(first(1)).toEqual(["partners", "coach", "roles", "training"]);
    expect(first(2)).toEqual(["pressing", "build-up", "movement", "intro"]);
    expect(first(3)).toEqual(["trials", "expectations", "my-role", "application"]);
    for (const l of [1, 2, 3] as const) expect(lessonPath(l).map((x) => x.id).sort()).toEqual(LESSONS_META.map((x) => x.id).sort());
    let d = setLevel(emptyDoc(), 3, tick());
    expect(nextLesson(d)?.id).toBe("trials");
    d = setLevel(d, 1, tick());
    expect(nextLesson(d)?.id).toBe("partners");
    expect(d.dirty).toContain("level");
  });
  it("identyfikatory zwrotów lekcji wynikają ze spisu", () => {
    expect(phraseIdsOf(meta("coach"))).toEqual(["coach-01", "coach-02", "coach-03", "coach-04", "coach-05", "coach-06"]);
  });
});

describe("lekcja: karta → lekcja → odpowiedzi → wynik → zapis → powtórki", () => {
  it("lekcja ma 18 kroków (6 × poznaj, sprawdź, ułóż); jedno zadanie na ekranie", () => {
    const s = startLesson(meta("partners"), D0);
    expect(s.steps.map((x) => x.k)).toEqual([...Array(6).fill("learn"), ...Array(6).fill("check"), ...Array(6).fill("build")]);
    expect(new Set(s.steps.filter((x) => x.k === "check").map((x) => x.p)).size).toBe(6);
  });
  it("poprawne odpowiedzi: lekcja ukończona, zwroty w utrwalaniu (etap 1, powtórka jutro), ale jeszcze NIE utrwalone", () => {
    const r = run(emptyDoc(), startLesson(meta("partners"), D0), D0);
    expect(score(r.session)).toMatchObject({ right: 12, total: 12, ratio: 1 });
    const done = finish(r.doc, r.session, D0, tick());
    const sum = summarize(done, D0);
    expect(sum.lessonsDone).toBe(1);
    expect(done.lessons.partners).toMatchObject({ completedAt: D0, completions: 1, firstTry: 1 });
    expect(Object.values(done.phrases).every((p) => p.stage === 1 && p.due === addDays(D0, 1))).toBe(true); // check i build tego samego dnia przesuwają tylko raz
    expect(sum).toMatchObject({ phrasesSeen: 6, phrasesLearning: 6, phrasesMastered: 0, dueToday: 0 }); // ukończenie lekcji ≠ utrwalenie
    expect(done.resume?.session).toBeNull();
    expect(nextLesson(done)?.id).toBe("coach");
    expect(sum.primary).toBe("Kontynuuj");
  });
  it("następnego dnia 6 zwrotów czeka na powtórkę; poprawna powtórka daje etap 2 i odstęp 3 dni, a pozostałe odpowiedzi tego dnia nie przesuwają dalej", () => {
    const done = finish(run(emptyDoc(), startLesson(meta("partners"), D0), D0).doc, run(emptyDoc(), startLesson(meta("partners"), D0), D0).session, D0, tick());
    const D1 = addDays(D0, 1);
    expect(dueCount(done, D0)).toBe(0);
    expect(dueCount(done, D1)).toBe(6);
    expect(startReview(done, D0)).toBeNull();
    const review = startReview(done, D1)!;
    expect(review.steps).toHaveLength(6);
    const rr = run(done, review, D1);
    expect(Object.values(rr.doc.phrases).every((p) => p.stage === 2 && p.due === addDays(D1, 3))).toBe(true);
    // ponowna sesja tego samego dnia nic nie zmienia (nic nie jest „na terminie”)
    expect(startReview(finish(rr.doc, rr.session, D1, tick()), D1)).toBeNull();
  });
  it("błąd: zwrot wraca do ćwiczenia w tej samej lekcji (jeden krok powtórzenia), stopień cofnięty, powtórka jutro; pierwsze podejście liczy się do wyniku", () => {
    const s0 = startLesson(meta("roles"), D0);
    const r = run(emptyDoc(), s0, D0, [6]); // pierwszy krok „check” – błąd
    const wrongPhrase = s0.steps[6]!.p;
    expect(r.session.steps).toHaveLength(19);
    expect(r.session.steps.at(-1)).toEqual({ k: "check", p: wrongPhrase, retry: true });
    expect(score(r.session)).toMatchObject({ right: 11, total: 12 });
    expect(r.doc.phrases[wrongPhrase]).toMatchObject({ stage: 0, due: addDays(D0, 1), wrong: 1 });
    const other = s0.steps[0]!.p === wrongPhrase ? s0.steps[1]!.p : s0.steps[0]!.p;
    expect(r.doc.phrases[other]!.stage).toBe(1);
  });
  it("błąd w układance po poprawnym pytaniu tego samego dnia też kieruje zwrot na jutro (jeden błąd unieważnia postęp dnia)", () => {
    const s0 = startLesson(meta("roles"), D0);
    const r = run(emptyDoc(), s0, D0, [12]); // pierwsza układanka błędnie
    const p = s0.steps[12]!.p;
    expect(r.doc.phrases[p]).toMatchObject({ stage: 0, due: addDays(D0, 1) });
  });
  it("podwójne kliknięcie i odpowiedź bez przejścia dalej nie liczą się dwa razy; nie można pominąć zadania bez odpowiedzi", () => {
    let s = startLesson(meta("coach"), D0), d = emptyDoc();
    for (let i = 0; i < 6; i++) { const a = advance(d, s, tick()); s = a.session; d = a.doc; }
    expect(currentStep(s)!.k).toBe("check");
    const blocked = advance(d, s, tick());
    expect(blocked.session.idx).toBe(s.idx); // bez odpowiedzi nie ma przejścia
    const r1 = answer(d, s, true, D0, tick());
    const r2 = answer(r1.doc, r1.session, false, D0, tick()); // drugie kliknięcie (np. inny przycisk) – ignorowane
    expect(r2.applied).toBe(false);
    expect(r2.doc).toBe(r1.doc);
    expect(r2.session.steps).toHaveLength(r1.session.steps.length);
    expect(r1.doc.phrases[currentStep(s)!.p]).toMatchObject({ seen: 1, correct: 1, wrong: 0 });
  });
  it("odpowiedź na krok „poznaj” nie jest oceniana", () => {
    const s = startLesson(meta("coach"), D0);
    const r = answer(emptyDoc(), s, false, D0, tick());
    expect(r.applied).toBe(false);
  });
});

describe("wznawianie i zmiana dnia", () => {
  it("miejsce przerwania zapisuje się po każdym kroku; po ponownym otwarciu wracamy do następnego, niewykonanego kroku (także następnego dnia)", () => {
    let s = startLesson(meta("training"), D0), d = emptyDoc();
    for (let i = 0; i < 8; i++) {
      if (currentStep(s)!.k !== "learn") { const r = answer(d, s, true, D0, tick()); s = r.session; d = r.doc; }
      const a = advance(d, s, tick()); s = a.session; d = a.doc;
    }
    expect(s.idx).toBe(8);
    const reopened = restore(parseDoc(JSON.parse(JSON.stringify(d))), addDays(D0, 3))!;
    expect(reopened.kind).toBe("lesson");
    expect(reopened.idx).toBe(8);
    expect(nextLesson(d)?.id).toBe("training");
    expect(summarize(d, D0)).toMatchObject({ resuming: true, primary: "Kontynuuj" });
  });
  it("po udzielonej odpowiedzi (bez kliknięcia „Dalej”) wznawiamy od następnego kroku, a nie od tego samego", () => {
    let s = startLesson(meta("training"), D0), d = emptyDoc();
    for (let i = 0; i < 6; i++) { const a = advance(d, s, tick()); s = a.session; d = a.doc; }
    const r = answer(d, s, true, D0, tick());
    expect(r.doc.resume!.session!.idx).toBe(7);
    expect(resumable(r.session).idx).toBe(7);
  });
  it("powtórka zapisana poprzedniego dnia nie jest wznawiana (lista zwrotów na terminie się zmieniła); lekcja – tak", () => {
    const done = finish(run(emptyDoc(), startLesson(meta("partners"), D0), D0).doc, run(emptyDoc(), startLesson(meta("partners"), D0), D0).session, D0, tick());
    const D1 = addDays(D0, 1);
    const review = startReview(done, D1)!;
    const a = advance(done, review, tick()); // zapis stanu (bez odpowiedzi nie ma przejścia – więc najpierw odpowiedź)
    void a;
    const r = answer(done, review, true, D1, tick());
    expect(restore(r.doc, D1)).not.toBeNull();
    expect(restore(r.doc, addDays(D1, 1))).toBeNull();
  });
  it("zakończona sesja czyści miejsce przerwania", () => {
    const r = run(emptyDoc(), startLesson(meta("intro"), D0), D0);
    const d = finish(r.doc, r.session, D0, tick());
    expect(d.resume?.session).toBeNull();
    expect(restore(d, D0)).toBeNull();
  });
});

describe("serializacja i łączenie zmian z kilku urządzeń", () => {
  const sample = () => { const r = run(emptyDoc(), startLesson(meta("partners"), D0), D0, [6]); return finish(setLevel(r.doc, 2, tick()), r.session, D0, tick()); };
  it("zapis i odczyt zachowują dokument (łącznie z listą oczekujących zmian)", () => {
    const d = sample();
    expect(parseDoc(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });
  it("uszkodzone lub obce elementy są pomijane, a nie psują postępu", () => {
    const d = sample();
    const raw = JSON.parse(JSON.stringify(d));
    raw.phrases["nie-ma-takiego-01"] = raw.phrases["partners-01"];
    raw.phrases["partners-02"] = { stage: "x" };
    raw.lessons["nieznana"] = raw.lessons.partners;
    raw.level = { value: 9, ts: 1 };
    raw.resume = { ts: 1, session: { kind: "lesson", steps: [], idx: 0, day: D0 } };
    const p = parseDoc(raw);
    expect(Object.keys(p.phrases)).not.toContain("nie-ma-takiego-01");
    expect(p.phrases["partners-02"]).toBeUndefined();
    expect(p.lessons.nieznana).toBeUndefined();
    expect(p.level).toBeNull();
    expect(p.lessons.partners).toBeDefined();
    expect(parseDoc("śmieci")).toEqual(emptyDoc());
    expect(parseDoc({ v: 2 })).toEqual(emptyDoc());
  });
  it("łączenie z kontem: nowszy znacznik czasu wygrywa; lokalne nowsze zmiany zostają i czekają na wysłanie", () => {
    const local = sample();
    const rowOf = (key: string, patch: Record<string, unknown>) => ({ item: key, data: { ...(local.phrases["partners-01"] as object), ...patch } });
    const older = mergeRemote(local, [rowOf("phrase:partners-01", { stage: 5, ts: 1 })]);
    expect(older.changed).toBe(false);
    expect(older.doc.phrases["partners-01"]!.stage).toBe(local.phrases["partners-01"]!.stage);
    const newer = mergeRemote(local, [rowOf("phrase:partners-01", { stage: 4, ts: 9_999_999 })]);
    expect(newer.changed).toBe(true);
    expect(newer.doc.phrases["partners-01"]!.stage).toBe(4);
    expect(newer.doc.dirty).not.toContain("phrase:partners-01");
    const unknown = mergeRemote(local, [{ item: "phrase:../../x", data: {} }, { item: "phrase:partners-01", data: "zły" }]);
    expect(unknown.changed).toBe(false);
  });
  it("wysyłane są tylko oczekujące elementy; po potwierdzeniu czyścimy te, które nie zmieniły się w międzyczasie", () => {
    const d = sample();
    const rows = pendingRows(d);
    expect(rows.length).toBe(d.dirty.length);
    expect(rows.every((r) => /^(level|resume|lesson:|phrase:)/.test(r.item))).toBe(true);
    const sent = Object.fromEntries(rows.map((r) => [r.item, r.data.ts as number]));
    // zmiana jednego elementu po wysłaniu: zostaje oczekujący
    const changed = { ...d, phrases: { ...d.phrases, "partners-01": { ...d.phrases["partners-01"]!, ts: 99_999_999 } } };
    const after = clearDirty(changed, sent);
    expect(after.dirty).toEqual(["phrase:partners-01"]);
    expect(clearDirty(d, sent).dirty).toEqual([]);
  });
  it("dueIds: najpierw najbardziej spóźnione, limit sesji", () => {
    let d = emptyDoc();
    for (const [i, id] of phraseIdsOf(meta("partners")).entries()) d = { ...d, phrases: { ...d.phrases, [id]: { stage: 1, due: addDays(D0, -i), lastDay: D0, dayOk: true, seen: 1, correct: 1, wrong: 0, ts: 1 } } };
    expect(dueIds(d, D0, 3)).toEqual(["partners-06", "partners-05", "partners-04"]);
  });
});
