import { useEffect, useRef, useState } from "react";
import { Mic, Send, Video, X } from "lucide-react";
import type { TrainingExercise } from "@/lib/loadwise/types";
import { useLoadwise } from "@/lib/loadwise/store";
import { useAuth } from "@/lib/loadwise/auth";
import { localCoachReply, type CoachReply } from "@/lib/trainingCoach/coach";
import { askTrainingCoach } from "@/lib/trainingCoach/transport";
import { resolveTechniqueLesson } from "@/lib/trainingCoach/biomechanics";
import "./training-coach.css";

type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null; onend: (() => void) | null;
  start: () => void; stop: () => void; abort: () => void;
};

function TechniqueRecording() {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return <div className="bw-coach-recording">
    <p>Nagraj 2–3 lekkie powtórzenia, z całą sylwetką i sprzętem w kadrze. Wybierz fragment do 30 sekund i 40 MB.</p>
    <label className="bw-coach-record-button">
      <Video size={16} aria-hidden="true" /> Nagraj i obejrzyj
      <input type="file" accept="video/*" aria-label="Wybierz lub nagraj film techniki"
        onChange={event => {
          const file = event.target.files?.[0]; event.target.value = "";
          setError(null);
          if (!file) return;
          if (file.size > 40 * 1024 * 1024 || file.size === 0 || !file.type.startsWith("video/")) {
            setError("Wybierz krótki film do 40 MB."); return;
          }
          setUrl(URL.createObjectURL(file));
        }} />
    </label>
    {url && <>
      <p>Film jest dostępny tylko tutaj; nie jest wysyłany do AI.</p>
      <video ref={video} src={url} controls playsInline preload="metadata"
        aria-label="Twoje nagranie techniki"
        onError={() => { setError("Nie można odtworzyć tego formatu. Wybierz MP4 lub nagraj film ponownie."); setUrl(null); }}
        onLoadedMetadata={() => {
          if (!video.current || !Number.isFinite(video.current.duration) || video.current.duration > 30) {
            setError("Wybierz fragment do 30 sekund."); setUrl(null);
          }
        }} />
      <div className="bw-coach-actions">
        <button type="button" onClick={() => { if (video.current) video.current.playbackRate = 0.5; }}>Wolniej · 0,5×</button>
        <button type="button" onClick={() => { if (video.current) video.current.playbackRate = 1; }}>1×</button>
        <button type="button" onClick={() => setUrl(null)}><X size={14} aria-hidden="true" /> Usuń film</button>
      </div>
      <p>Porównaj ruch ze wskazówką powyżej. Ten podgląd nie ocenia automatycznie techniki ani bezpieczeństwa.</p>
    </>}
    {error && <p role="alert">{error}</p>}
  </div>;
}

export function ExerciseCoach({ exercise }: { exercise: TrainingExercise }) {
  const store = useLoadwise();
  const { user } = useAuth();
  const profile = store.state?.profile;
  const lesson = resolveTechniqueLesson(exercise);
  const questions = ["Jak to wykonać?", ...(lesson ? ["Jaki kąt w kolanie?"] : []), "Jakie tempo?", "Ile przerwy?",
    ...(!lesson || ["squat", "rdl", "singleLegRdl", "deadlift", "split", "elevatedSplit", "iso"].includes(lesson.id) ? ["Jaki ciężar?"] : [])];
  const [question, setQuestion] = useState("");
  const [reply, setReply] = useState<CoachReply | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const request = useRef<AbortController | null>(null);
  const requestTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const text = useRef<HTMLTextAreaElement>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const pause = () => {
      if (document.hidden) { recognition.current?.abort(); request.current?.abort(); }
    };
    document.addEventListener("visibilitychange", pause);
    return () => {
      mounted.current = false; recognition.current?.abort(); request.current?.abort();
      if (timeout.current) clearTimeout(timeout.current);
      if (requestTimeout.current) clearTimeout(requestTimeout.current);
      document.removeEventListener("visibilitychange", pause);
    };
  }, []);
  function answer(value = question) {
    if (!value.trim()) return;
    setQuestion(value); setNotice(null);
    const next = localCoachReply(value, exercise, profile);
    setReply(next);
    if (!next)
      setNotice("Nie mam gotowej odpowiedzi na to pytanie. Możesz je doprecyzować albo zapytać AI.");
  }
  function dictate() {
    if (listening) { recognition.current?.stop(); return; }
    const w = window as typeof window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Constructor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Constructor) { setNotice("Wpisz pytanie lub użyj mikrofonu na klawiaturze telefonu."); text.current?.focus(); return; }
    recognition.current?.abort();
    const instance = new Constructor(); recognition.current = instance;
    instance.lang = "pl-PL"; instance.continuous = false; instance.interimResults = false;
    instance.onresult = event => {
      if (!mounted.current) return;
      const transcript = Array.from(event.results).map(part => part[0]?.transcript ?? "").join(" ");
      setQuestion(transcript.slice(0, 600));
    };
    instance.onerror = () => {
      if (timeout.current) clearTimeout(timeout.current);
      if (mounted.current) { setListening(false); setNotice("Nie udało się rozpoznać mowy. Możesz wpisać pytanie."); }
    };
    instance.onend = () => { if (timeout.current) clearTimeout(timeout.current); if (mounted.current) setListening(false); };
    try {
      instance.start(); setListening(true); setNotice("Dyktuj pytanie. Przed wysłaniem możesz poprawić tekst.");
      timeout.current = setTimeout(() => instance.stop(), 30_000);
    } catch { setListening(false); setNotice("Mikrofon jest niedostępny. Wpisz pytanie lub użyj mikrofonu klawiatury."); }
  }
  async function askAI() {
    if (!consent || !user || !question.trim() || busy) return;
    const deterministic = localCoachReply(question, exercise, profile);
    // Questions about pain and suitability never bypass the deterministic boundary.
    if (deterministic?.needsTrainer) { setReply(deterministic); return; }
    const controller = new AbortController(); request.current?.abort(); request.current = controller;
    requestTimeout.current = setTimeout(() => controller.abort(), 20_000);
    setBusy(true); setNotice(null);
    try {
      const next = await askTrainingCoach(question, exercise, controller.signal);
      if (mounted.current && !controller.signal.aborted) setReply(next);
    } catch (error) {
      if (mounted.current) setNotice(error instanceof Error ? error.message : "AI jest teraz niedostępne.");
    } finally {
      if (requestTimeout.current) clearTimeout(requestTimeout.current);
      requestTimeout.current = null;
      if (mounted.current) setBusy(false);
    }
  }
  return <section className="bw-exercise-coach" aria-label="Pomoc do ćwiczenia">
    <div className="bw-coach-chips">
      {questions.map(label =>
        <button type="button" key={label} onClick={() => answer(label)}>{label}</button>)}
    </div>
    <label className="bw-coach-question-label">Zapytaj o to ćwiczenie
      <textarea ref={text} rows={2} maxLength={600} value={question} disabled={busy}
        placeholder="Np. czy mam wolno wracać?" onChange={e => setQuestion(e.target.value)} />
    </label>
    <div className="bw-coach-actions">
      <button type="button" onClick={dictate} disabled={busy} aria-label={listening ? "Zatrzymaj dyktowanie" : "Podyktuj pytanie"}>
        <Mic size={16} aria-hidden="true" /> {listening ? "Zatrzymaj" : "Dyktuj"}
      </button>
      <button type="button" onClick={() => answer()} disabled={busy || !question.trim()}>
        <Send size={15} aria-hidden="true" /> Odpowiedz
      </button>
    </div>
    {reply && <div className="bw-coach-answer" role="status"><p>{reply.text}</p>
      <small>{reply.source === "guide" ? "Instrukcja ćwiczenia" : "Odpowiedź AI · wskazówka edukacyjna"}</small></div>}
    {notice && <p className="bw-coach-notice" role="status">{notice}</p>}
    <details className="bw-coach-ai"><summary>Dopytaj AI</summary>
      <p>Wyślemy treść pytania i parametry tego ćwiczenia do usługi AI. Rozmowa nie zmienia planu.</p>
      <label><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /> Chcę wysłać to pytanie do AI.</label>
      <button type="button" disabled={!consent || !user || !question.trim() || busy} onClick={() => void askAI()}>
        {busy ? "Przygotowuję odpowiedź…" : "Zapytaj AI"}
      </button>
    </details>
    <TechniqueRecording />
  </section>;
}
