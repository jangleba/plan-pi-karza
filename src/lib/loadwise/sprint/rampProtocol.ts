import type { SprintBlock, SprintExercise } from "./types";

export const RAMP_EXERCISES: readonly SprintExercise[] = [
  {
    id: "ramp-jog",
    title: "Trucht progresywny",
    prescription: "90 s · odcinek 5–10 m",
    intent: "Stopniowo podnieś temperaturę bez zmęczenia.",
    howTo: ["Zacznij bardzo lekko.", "Co 30 sekund nieznacznie zwiększ tempo."],
    avoid: "Nie przyspieszaj jeszcze do sprintu.",
  },
  {
    id: "ramp-ankle",
    title: "Mobilizacja stawu skokowego",
    prescription: "6 na stronę",
    intent: "Kolano nad stopę, pięta przy ziemi.",
    howTo: ["Ustaw stopę płasko.", "Płynnie przesuń kolano do przodu i wróć."],
    avoid: "Nie odrywaj pięty i nie zapadaj kolana do środka.",
  },
  {
    id: "ramp-glute-march",
    title: "Glute bridge march",
    prescription: "6 na stronę",
    intent: "Utrzymaj biodra wysoko podczas zmiany nogi.",
    howTo: ["Dociśnij całą stopę do podłoża.", "Unoś nogę bez skręcania miednicy."],
    avoid: "Nie opuszczaj bioder przy zmianie strony.",
  },
  {
    id: "ramp-lunge-knee",
    title: "Wykrok w tył + kolano",
    prescription: "5 na stronę",
    intent: "Stabilny wykrok i płynne przejście do pozycji biegowej.",
    howTo: ["Cofnij nogę do krótkiego wykroku.", "Wstań i unieś kolano bez utraty równowagi."],
    avoid: "Nie pochylaj tułowia i nie zapadaj kolana podporowego.",
  },
  {
    id: "ramp-hamstring-sweep",
    title: "Hamstring sweep",
    prescription: "5 na stronę · 5–10 m",
    intent: "Dynamicznie przygotuj tylną taśmę bez długiego rozciągania.",
    howTo: ["Postaw piętę lekko przed sobą.", "Cofnij biodra i wykonaj płynny zamach dłoni."],
    avoid: "Nie zatrzymuj pozycji i nie zaokrąglaj mocno pleców.",
  },
  {
    id: "ramp-acceleration",
    title: "Przyspieszenia progresywne",
    prescription: "3 × 5–10 m · 60/70/80%",
    sets: 3,
    intent: "Każdy odcinek szybszy, ale nadal swobodny.",
    howTo: ["Narastaj płynnie od pierwszego kroku.", "Wróć marszem przed kolejnym odcinkiem."],
    avoid: "Nie wykonuj maksymalnego sprintu w rozgrzewce.",
  },
] as const;

export function createRampBlock(number = "01", id = "ramp"): SprintBlock {
  return {
    id,
    number,
    title: "Rozgrzewka sprintowa",
    estimatedMinutes: 8,
    exercises: RAMP_EXERCISES,
  };
}

