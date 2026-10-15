import type { Profile, TrainingExercise } from "@/lib/loadwise/types";
import { resolveDefinitionForExercise } from "@/lib/loadwise/sessionPresentation";
import { resolveQuickGuide } from "@/lib/courseMeasure/quickGuide";
import { hintKey, TECHNIQUE_HINTS, type TechniqueHint } from "./knowledge";

export function techniqueHint(exercise: TrainingExercise): TechniqueHint {
  const def = resolveDefinitionForExercise(exercise);
  const key = hintKey(def?.id ?? exercise.exerciseId ?? "", exercise.name, def?.movementPattern);
  if (key) {
    const hint = TECHNIQUE_HINTS[key];
    const phases = exercise.tempo?.trim().split(/\s*[-–—]\s*/);
    // An explicit slow concentric prescription overrides the generic fast-up cue.
    if (phases?.length === 4 && /^\d+(?:[.,]\d+)?$/.test(phases[2]) && Number(phases[2].replace(",", ".")) > 0)
      return { ...hint, intent: `Utrzymuj rytm zapisany w tej sesji: ${exercise.tempo}.` };
    return hint;
  }
  const guide = resolveQuickGuide(exercise, def);
  return {
    intent: guide.focus ?? exercise.purpose ?? "Utrzymuj kontrolę ruchu zgodnie z zadaniem.",
    action: guide.action ?? guide.setup ?? "Wykonaj wariant i dawkę zapisane w planie.",
    avoid: guide.error ?? "Nie kontynuuj powtórzeń po utracie kontroli ruchu.",
  };
}

export interface CoachReply {
  source: "guide" | "ai";
  text: string;
  needsTrainer?: boolean;
}

function normalize(text: string) {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l");
}

export function localCoachReply(question: string, exercise: TrainingExercise, profile?: Profile | null): CoachReply | null {
  const q = normalize(question);
  const hint = techniqueHint(exercise);
  const reply = (text: string, needsTrainer = false): CoachReply => ({ source: "guide", text, needsTrainer });
  if (/boli|bol |bole|bolu|kontuz|uraz|dretw|omdlen|zawrot|klatk.{0,8}piersi/.test(q))
    return reply("Przerwij to ćwiczenie. Z nagrania ani rozmowy nie ustalimy przyczyny objawu. Omów go z lekarzem lub fizjoterapeutą; przy silnym, nagłym objawie szukaj pilnej pomocy.", true);
  if (/bezpiecz|dla mnie|czy moge.{0,20}(?:cwiczyc|trenowac|to robic)|czy mam (?:to|tego) (?:robic|unikac)/.test(q)) {
    const young = profile?.age == null || profile.age < 18;
    return reply(young
      ? "Sama odpowiedź ani nagranie nie potwierdzą, że ten wariant jest dla Ciebie odpowiedni. Pierwszą próbę wymagającego ćwiczenia wykonaj z trenerem. Dobór wariantu zależy od doświadczenia i kontroli ruchu."
      : "Sprawdź wariant, doświadczenie i wymagany nadzór. Jeśli nie znasz tego ruchu, zacznij od nauki z trenerem; sam opis nie potwierdza gotowości do danego ciężaru.", true);
  }
  if (/ciezar|kilogram|\bkg\b|obciazen|dokladac|progres/.test(q))
    return reply(`Zalecenie tej serii: ${exercise.loadTarget || exercise.rir || "dobierz lekki opór do nauki ruchu"}. Zapas oznacza powtórzenia możliwe do wykonania z tą samą techniką. Samo zaliczenie serii nie jest powodem do dokładania ciężaru.`);
  if (!/przerw|odpocz|rest/.test(q) && /tempo|opuszcz|sekund|szybk|woln|ekscentr|koncentr/.test(q))
    return reply(exercise.tempo
      ? `Tempo w tej sesji: ${exercise.tempo}. ${hint.action} Nie przyspieszaj kosztem utraty ustawienia.`
      : `${hint.intent} ${hint.action} W tej sesji nie zapisano dokładnego tempa w sekundach.`);
  if (/przerw|odpocz|rest/.test(q))
    return reply(exercise.restAfterPair
      ? `Przerwa po parze: ${exercise.restAfterPair}. Wykonuj ćwiczenia pary w kolejności z planu.`
      : exercise.restAfterExercise ? `Przerwa po ćwiczeniu: ${exercise.restAfterExercise}.`
      : "Sprawdź przerwę zapisaną przy bloku lub parze. To ćwiczenie nie ma osobnej przerwy w danych sesji.");
  if (/powtorz|serie|serii|ile razy/.test(q))
    return reply(`Planowana dawka: ${[exercise.sets && `${exercise.sets} serie`, exercise.reps && `${exercise.reps} powtórzeń`, exercise.duration].filter(Boolean).join(" · ") || "według bloku sesji"}. Nie dokładaj powtórzeń kosztem techniki.`);
  if (/sprzet|hantl|sztang|lawk|gumy|gume|zamien/.test(q))
    return reply("Użyj opcji zmiany sprzętu przy ćwiczeniu. Zamiennik musi zachować cel i otrzymać własną dawkę; nie przenoś automatycznie ciężaru z poprzedniego wariantu.");
  if (/jak|technik|intenc|wykon|biodr|kolan|plec|stop|lok/.test(q))
    return reply(`${hint.intent} ${hint.action} Unikaj: ${hint.avoid}`);
  return null;
}

/** Minimal context, no name, account ID, health log or full training plan. */
export function coachRequest(question: string, exercise: TrainingExercise) {
  const def = resolveDefinitionForExercise(exercise);
  return {
    question: question.trim().slice(0, 600),
    exercise: {
      id: def?.id ?? exercise.exerciseId ?? "unknown", name: def?.displayNamePl ?? exercise.name,
      guideKey: hintKey(def?.id ?? exercise.exerciseId ?? "", exercise.name, def?.movementPattern),
      sets: exercise.sets?.slice(0, 40) ?? null, reps: exercise.reps?.slice(0, 60) ?? null,
      tempo: exercise.tempo?.slice(0, 60) ?? null,
      rest: (exercise.restAfterPair ?? exercise.restAfterExercise)?.slice(0, 60) ?? null,
    },
  };
}
