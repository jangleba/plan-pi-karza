import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Check, Mic, RotateCcw, Square, X } from "lucide-react";
import {
  fuelProtocolProgress,
  type FuelProtocol,
  type FuelProtocolStage,
} from "@/lib/fuel/protocol";

type SpeechResultEvent = { results: ArrayLike<{ 0: { transcript: string } }> };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export function AdaptiveFuelProtocol({
  open,
  protocol,
  onClose,
  onComplete,
  onMessage,
  onReset,
}: {
  open: boolean;
  protocol: FuelProtocol | null;
  onClose: () => void;
  onComplete: (id: FuelProtocolStage) => void;
  onMessage: (message: string) => void;
  onReset: () => void;
}) {
  const [message, setMessage] = useState("");
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(
    () => () => {
      recognitionRef.current?.stop();
    },
    [],
  );

  const progress = useMemo(
    () => (protocol ? fuelProtocolProgress(protocol) : { done: 0, total: 4 }),
    [protocol],
  );

  if (!protocol) return null;
  const progressPercent = Math.round((progress.done / progress.total) * 100);

  function submit() {
    const value = message.trim();
    if (!value) return;
    onMessage(value);
    setMessage("");
  }

  function toggleVoice() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const browserWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition;
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.lang = "pl-PL";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) setMessage(transcript);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  return (
    <div className={`fixed inset-0 z-[68] ${open ? "pointer-events-auto" : "pointer-events-none"}`}>
      <button
        type="button"
        aria-label="Zamknij protokół"
        onClick={onClose}
        className={`absolute inset-0 bg-foreground/20 backdrop-blur-[2px] transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="fuel-protocol-title"
        className={`absolute inset-x-0 bottom-0 mx-auto max-h-[92vh] w-full max-w-[30rem] overflow-y-auto rounded-t-[2rem] border-t border-border/80 bg-background px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-3 shadow-2xl transition-transform duration-300 ${open ? "translate-y-0" : "translate-y-full"}`}
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-border" />

        <div className="mt-5 flex items-start gap-4">
          <div
            className="grid h-[4.5rem] w-[4.5rem] shrink-0 place-items-center rounded-full"
            style={{
              background: `conic-gradient(var(--color-primary) ${progressPercent}%, oklch(0.88 0.012 82) 0)`,
            }}
          >
            <div className="grid h-[3.75rem] w-[3.75rem] place-items-center rounded-full bg-background text-center">
              <span className="text-lg font-medium tracking-[-0.04em]">
                {progress.done}/{progress.total}
              </span>
            </div>
          </div>
          <div className="min-w-0 flex-1 pt-1">
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
              Adaptive Fuel Protocol
            </div>
            <h2
              id="fuel-protocol-title"
              className="mt-1 text-[22px] font-medium leading-tight tracking-[-0.04em]"
            >
              Plan, który reaguje
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Potwierdzaj kolejne kroki. Gdy coś się zmieni, Fuel przeliczy tylko to, co trzeba.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-card text-muted-foreground"
            aria-label="Zamknij"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative mt-7">
          <div
            className="absolute bottom-6 left-[0.68rem] top-6 w-px bg-border"
            aria-hidden="true"
          />
          <div className="space-y-1">
            {protocol.items.map((item) => {
              const active = item.status === "active" || item.status === "adjusted";
              const done = item.status === "done";
              return (
                <article key={item.id} className="relative grid grid-cols-[1.4rem_1fr] gap-3 py-3">
                  <span
                    className={`relative z-10 mt-0.5 grid h-[1.4rem] w-[1.4rem] place-items-center rounded-full border transition-colors ${
                      done
                        ? "border-primary bg-primary text-primary-foreground"
                        : active
                          ? "fuel-protocol-dot border-primary bg-background"
                          : "border-border bg-background"
                    }`}
                  >
                    {done && <Check className="h-3 w-3" strokeWidth={2.5} />}
                    {active && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                  </span>
                  <div
                    className={`rounded-[1.25rem] px-4 py-3.5 transition-colors ${
                      active
                        ? "border border-primary/20 bg-primary/[0.055]"
                        : "border border-transparent"
                    } ${done ? "opacity-55" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        {item.eyebrow}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{item.timeLabel}</span>
                    </div>
                    <h3 className="mt-1.5 text-[15px] font-medium leading-snug tracking-[-0.015em]">
                      {item.title}
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {item.detail}
                    </p>
                    {active && (
                      <button
                        type="button"
                        onClick={() => onComplete(item.id)}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground active:scale-95"
                      >
                        <Check className="h-3.5 w-3.5" /> Zrobione
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        {protocol.lastResponse && (
          <div className="mt-3 rounded-2xl border border-primary/15 bg-primary/[0.045] px-4 py-3 text-xs leading-relaxed text-foreground">
            {protocol.lastResponse}
          </div>
        )}

        <div className="mt-4 rounded-[1.35rem] border border-border bg-card/70 p-2 shadow-[0_16px_35px_-30px_oklch(0.18_0.03_160/0.5)]">
          <div className="flex items-center gap-2">
            <label htmlFor="fuel-protocol-message" className="sr-only">
              Powiedz, co się zmieniło
            </label>
            <input
              id="fuel-protocol-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && submit()}
              placeholder="Np. „Zjadłem tylko połowę”"
              className="h-10 min-w-0 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground/65"
            />
            <button
              type="button"
              onClick={toggleVoice}
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${listening ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
              aria-label={listening ? "Zatrzymaj nagrywanie" : "Powiedz, co się zmieniło"}
            >
              {listening ? (
                <Square className="h-3 w-3 fill-current" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!message.trim()}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground disabled:opacity-35"
              aria-label="Aktualizuj protokół"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 px-1">
          <span className="text-[10px] text-muted-foreground">
            Plan zapisuje się tylko na tym urządzeniu.
          </span>
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground"
          >
            <RotateCcw className="h-3 w-3" /> Zacznij od nowa
          </button>
        </div>
      </section>
    </div>
  );
}
