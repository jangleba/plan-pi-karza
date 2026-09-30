import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AudioLines, ChevronRight, Mic, ShoppingBag, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/loadwise/ui";
import { FuelAssistantSheet } from "@/components/fuel/FuelAssistantSheet";
import { StoreCheckSheet } from "@/components/fuel/StoreCheckSheet";
import {
  parseFuelIngredients,
  recommendFuelMeals,
  type FuelLoadBand,
  type FuelMealSuggestion,
  type FuelMoment,
} from "@/lib/fuel/assistant";
import { detectBarcodeFromImage } from "@/lib/fuel/barcode";
import {
  evaluateStoreProduct,
  lookupStoreProduct,
  productFromName,
  type StoreEvaluation,
  type StoreProduct,
} from "@/lib/fuel/storeCheck";
import { EMPTY_FUEL_SCHEDULE, findNextFuelSession } from "@/lib/fuel/schedule";
import type { FuelSessionInput } from "@/lib/fuel/types";
import { useAuth } from "@/lib/loadwise/auth";
import { resolveEffectivePlan } from "@/lib/loadwise/effectivePlan";
import { useLoadwise } from "@/lib/loadwise/store";
import "@/styles/fuel-v2.css";

export const Route = createFileRoute("/_tabs/fuel")({
  component: FuelScreen,
  head: () => ({
    meta: [
      { title: "Fuel – szybka decyzja żywieniowa | BallWise" },
      {
        name: "description",
        content:
          "Powiedz, co masz albo sprawdź produkt w sklepie. Fuel dopasuje jedną prostą decyzję do dzisiejszego planu.",
      },
    ],
  }),
});

type SpeechMode = "ingredients" | "store";
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

function FuelScreen() {
  const { user } = useAuth();
  const { state, todayIso } = useLoadwise();
  const effectivePlan = useMemo(
    () => resolveEffectivePlan(state.plan, state.modifications),
    [state.plan, state.modifications],
  );
  const session = useMemo(
    () =>
      findNextFuelSession({
        plan: effectivePlan,
        todayIso,
        now: new Date(),
        preferences: EMPTY_FUEL_SCHEDULE,
        completions: state.completions,
      }),
    [effectivePlan, state.completions, todayIso],
  );
  const load = loadBand(session);

  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantText, setAssistantText] = useState("");
  const [moment, setMoment] = useState<FuelMoment>(session.kind === "none" ? "ordinary" : "before");
  const [removedIngredientIds, setRemovedIngredientIds] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<FuelMealSuggestion[]>([]);
  const [suggestionIndex, setSuggestionIndex] = useState(0);

  const [storeOpen, setStoreOpen] = useState(false);
  const [storeName, setStoreName] = useState("");
  const [storeBarcode, setStoreBarcode] = useState("");
  const [storeProduct, setStoreProduct] = useState<StoreProduct | null>(null);
  const [storeEvaluation, setStoreEvaluation] = useState<StoreEvaluation | null>(null);
  const [storeLoading, setStoreLoading] = useState(false);

  const [speechMode, setSpeechMode] = useState<SpeechMode | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const lookupAbortRef = useRef<AbortController | null>(null);

  const parsed = useMemo(() => parseFuelIngredients(assistantText), [assistantText]);
  const activeIngredients = useMemo(
    () => parsed.items.filter((item) => !removedIngredientIds.includes(item.id)),
    [parsed.items, removedIngredientIds],
  );

  useEffect(() => {
    setMoment(session.kind === "none" ? "ordinary" : "before");
  }, [session.scheduleKey, session.kind]);

  useEffect(
    () => () => {
      recognitionRef.current?.stop();
      lookupAbortRef.current?.abort();
    },
    [],
  );

  function changeAssistantText(value: string) {
    setAssistantText(value);
    setRemovedIngredientIds([]);
    setSuggestions([]);
    setSuggestionIndex(0);
  }

  function startSpeech(mode: SpeechMode) {
    if (speechMode) {
      recognitionRef.current?.stop();
      return;
    }
    const browserWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition = browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition;
    if (!Recognition) {
      toast.info("Na tym urządzeniu użyj pola tekstowego.");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "pl-PL";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (!transcript) return;
      if (mode === "ingredients") changeAssistantText(transcript);
      else setStoreName(transcript);
    };
    recognition.onerror = () => {
      toast.error("Nie udało się rozpoznać głosu. Możesz wpisać tekst.");
      setSpeechMode(null);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setSpeechMode(null);
    };
    recognitionRef.current = recognition;
    setSpeechMode(mode);
    recognition.start();
  }

  function openVoiceAssistant() {
    setAssistantOpen(true);
    window.setTimeout(() => startSpeech("ingredients"), 80);
  }

  function generateSuggestion() {
    const next = recommendFuelMeals({ ingredients: activeIngredients, moment, load });
    if (next.length === 0) {
      toast.info("Powiedz przynajmniej jeden rozpoznawalny składnik.");
      return;
    }
    setSuggestions(next);
    setSuggestionIndex(0);
  }

  function acceptSuggestion() {
    const selected = suggestions[suggestionIndex];
    if (!selected) return;
    try {
      window.localStorage.setItem(
        `ballwise:fuel:last-choice:${user?.id ?? "guest"}`,
        JSON.stringify({ suggestionId: selected.id, moment, acceptedAt: new Date().toISOString() }),
      );
    } catch {
      // Brak pamięci urządzenia nie blokuje decyzji.
    }
    setAssistantOpen(false);
    toast.success("Gotowe — wybór zapisany bez kalorii i dziennika.");
  }

  function resetAssistant() {
    setSuggestions([]);
    setSuggestionIndex(0);
  }

  function resetStore() {
    lookupAbortRef.current?.abort();
    setStoreName("");
    setStoreBarcode("");
    setStoreProduct(null);
    setStoreEvaluation(null);
    setStoreLoading(false);
  }

  function evaluateNamedProduct() {
    const name = storeName.trim();
    if (name.length < 3) return;
    const product = productFromName(name);
    setStoreProduct(product);
    setStoreEvaluation(evaluateStoreProduct({ product, moment, load }));
  }

  async function checkBarcode(code = storeBarcode) {
    const clean = code.replace(/\D/g, "");
    if (clean.length < 8) {
      toast.info("Kod powinien mieć co najmniej 8 cyfr.");
      return;
    }
    lookupAbortRef.current?.abort();
    const controller = new AbortController();
    lookupAbortRef.current = controller;
    setStoreLoading(true);
    try {
      const product = await lookupStoreProduct(clean, controller.signal);
      if (!product) {
        setStoreBarcode(clean);
        toast.info("Nie znalazłem produktu po kodzie. Powiedz albo wpisz jego nazwę.");
        return;
      }
      setStoreBarcode(clean);
      setStoreProduct(product);
      setStoreName(product.name);
      setStoreEvaluation(evaluateStoreProduct({ product, moment, load }));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error(error instanceof Error ? error.message : "Nie udało się sprawdzić produktu.");
    } finally {
      if (lookupAbortRef.current === controller) setStoreLoading(false);
    }
  }

  async function scanBarcode(file: File | undefined) {
    if (!file) return;
    setStoreLoading(true);
    try {
      const detected = await detectBarcodeFromImage(file);
      if (!detected) {
        toast.info("Nie odczytałem kodu. Zrób wyraźniejsze zdjęcie albo podaj nazwę.");
        return;
      }
      setStoreBarcode(detected);
      await checkBarcode(detected);
    } catch (error) {
      toast.info(error instanceof Error ? error.message : "Nie udało się odczytać kodu.");
    } finally {
      setStoreLoading(false);
    }
  }

  function changeMoment(next: FuelMoment) {
    setMoment(next);
    setSuggestions([]);
    setSuggestionIndex(0);
    if (storeProduct)
      setStoreEvaluation(evaluateStoreProduct({ product: storeProduct, moment: next, load }));
  }

  return (
    <div className="premium-flow pb-[calc(env(safe-area-inset-bottom)+7.5rem)]">
      <AppHeader title="Fuel" subtitle="Jedna szybka decyzja pod dzisiejszy plan." />
      <main className="space-y-3 px-5">
        <section
          className="flex min-h-12 items-center gap-2 rounded-full border border-border/75 bg-card/75 px-4 text-xs font-semibold text-muted-foreground shadow-[var(--bw-shadow-card)]"
          aria-label="Kontekst planu"
        >
          <Sparkles className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate">{contextLabel(session, load)}</span>
        </section>

        <section className="overflow-hidden rounded-[1.8rem] border border-border/80 bg-card px-5 pb-6 pt-7 text-center shadow-[var(--bw-shadow-card)]">
          <h2 className="text-[28px] font-semibold leading-tight tracking-[-0.045em]">
            Co masz pod ręką?
          </h2>
          <p className="mx-auto mt-2 max-w-[30ch] text-sm leading-relaxed text-muted-foreground">
            Powiedz składniki, a dopasuję prosty posiłek do Planu.
          </p>
          <button
            type="button"
            onClick={openVoiceAssistant}
            className="fuel-mic mx-auto mt-7 grid h-28 w-28 place-items-center rounded-full bg-primary text-primary-foreground transition active:scale-[0.97]"
            aria-label="Powiedz, co masz"
          >
            <Mic className="h-9 w-9" />
          </button>
          <div className="mt-3 text-sm font-semibold">Mów</div>
          <button
            type="button"
            onClick={() => setAssistantOpen(true)}
            className="mx-auto mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-border bg-background px-5 text-sm font-semibold text-muted-foreground transition active:scale-[0.98]"
          >
            <AudioLines className="h-4 w-4" /> Wpisz
          </button>
          <p className="mt-6 text-xs text-muted-foreground">Np. ryż, jajka, skyr i banan</p>
        </section>

        <button
          type="button"
          onClick={() => setStoreOpen(true)}
          className="flex min-h-[5.25rem] w-full items-center gap-3 rounded-[1.35rem] border border-border/80 bg-card px-4 py-3.5 text-left shadow-[var(--bw-shadow-card)] transition active:scale-[0.99]"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/[0.075] text-primary">
            <ShoppingBag className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold tracking-[-0.015em]">W sklepie?</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Sprawdź produkt przed zakupem
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>

        <p className="px-2 pt-2 text-center text-[11px] leading-relaxed text-muted-foreground">
          Bez liczenia kalorii. Bez dziennika. Fuel ocenia dopasowanie do aktywności, nie to, czy
          produkt jest ogólnie „dobry” lub „zły”.
        </p>
      </main>

      <FuelAssistantSheet
        open={assistantOpen}
        text={assistantText}
        ingredients={activeIngredients}
        unknown={parsed.unknown}
        moment={moment}
        listening={speechMode === "ingredients"}
        suggestions={suggestions}
        selectedIndex={suggestionIndex}
        onClose={() => setAssistantOpen(false)}
        onTextChange={changeAssistantText}
        onMomentChange={changeMoment}
        onToggleVoice={() => startSpeech("ingredients")}
        onRemoveIngredient={(id) => {
          setRemovedIngredientIds((current) => [...current, id]);
          setSuggestions([]);
        }}
        onGenerate={generateSuggestion}
        onAlternative={() => setSuggestionIndex((index) => (index + 1) % suggestions.length)}
        onAccept={acceptSuggestion}
        onReset={resetAssistant}
      />

      <StoreCheckSheet
        open={storeOpen}
        productName={storeName}
        barcode={storeBarcode}
        product={storeProduct}
        evaluation={storeEvaluation}
        moment={moment}
        listening={speechMode === "store"}
        loading={storeLoading}
        onClose={() => setStoreOpen(false)}
        onProductNameChange={(value) => {
          setStoreName(value);
          setStoreProduct(null);
          setStoreEvaluation(null);
        }}
        onBarcodeChange={setStoreBarcode}
        onMomentChange={changeMoment}
        onToggleVoice={() => startSpeech("store")}
        onImage={scanBarcode}
        onCheckName={evaluateNamedProduct}
        onCheckBarcode={() => void checkBarcode()}
        onReset={resetStore}
      />
    </div>
  );
}

function loadBand(session: FuelSessionInput): FuelLoadBand {
  if (session.kind === "match" || session.intensity === "wysoka") return "high";
  if (session.kind === "recovery" || session.kind === "none" || session.intensity === "niska")
    return "low";
  return "moderate";
}

function contextLabel(session: FuelSessionInput, load: FuelLoadBand): string {
  if (session.kind === "none") return "Dziś • dzień bez zaplanowanej sesji";
  const loadLabel = load === "high" ? "mocne" : load === "moderate" ? "umiarkowane" : "lekkie";
  return `Dziś • ${sessionLabel(session.kind)} • ${loadLabel} obciążenie`;
}

function sessionLabel(kind: FuelSessionInput["kind"]): string {
  const labels: Record<FuelSessionInput["kind"], string> = {
    match: "mecz",
    football: "trening piłkarski",
    speed: "sprint",
    endurance: "wydolność",
    strength: "siła",
    recovery: "regeneracja",
    none: "bez sesji",
  };
  return labels[kind];
}
