/** Reviewed technique cues shared by the client and the optional AI endpoint. No secrets. */
export interface TechniqueHint {
  intent: string;
  action: string;
  avoid: string;
}

export const TECHNIQUE_HINTS: Record<string, TechniqueHint> = {
  deadlift: {
    intent: "Odepchnij podłogę i wstań zdecydowanie.",
    action: "Najpierw zbuduj napięcie, prowadź ciężar blisko ciała i odłóż go pod kontrolą.",
    avoid: "Szarpnięcie z luźnej pozycji i odchylanie tułowia na górze.",
  },
  rdl: {
    intent: "Cofaj biodra, utrzymując ciężar blisko nóg.",
    action: "Kontroluj opuszczanie. Zakończ zakres, zanim stracisz ustawienie tułowia i miednicy.",
    avoid: "Sięganie do podłogi kosztem pozycji pleców.",
  },
  squat: {
    intent: "Odepchnij podłoże i wstań zdecydowanie.",
    action: "Utrzymuj podparcie całej stopy. Kontroluj zejście, kolana prowadź zgodnie z kierunkiem stóp.",
    avoid: "Wymuszanie pionowych piszczeli i odrywanie pięt.",
  },
  split: {
    intent: "Odepchnij podłoże nogą pracującą.",
    action: "Utrzymuj stabilne podparcie i miednicę. Dobierz zakres, który kontrolujesz.",
    avoid: "Odbijanie się w dole i uciekanie z równowagi.",
  },
  nordic: {
    intent: "Hamuj opadanie przez kontrolowany zakres.",
    action: "Stopy stabilnie zakotwiczone; kolana, biodra i barki w linii. Powrót wykonaj z pomocą, jeśli plan przewiduje ekscentryk.",
    avoid: "Łamanie się w biodrach i wypychanie ich kosztem przeprostu lędźwi.",
  },
  full_nordic: {
    intent: "Kontroluj opuszczanie i powrót pracą zginaczy kolana.",
    action: "Utrzymuj linię kolana–biodra–barki. Jeśli nie kontrolujesz powrotu, wybierz wersję wspomaganą.",
    avoid: "Wymuszanie powrotu zgięciem bioder lub szarpnięciem.",
  },
  copenhagen: {
    intent: "Unieś miednicę i utrzymuj stabilną linię tułowia.",
    action: "Użyj dźwigni zapisanej w planie. Utrzymuj podpór barku i kontrolę miednicy.",
    avoid: "Zapadanie się w barku i obracanie tułowia.",
  },
  bridge: {
    intent: "Unieś biodra pracą pośladków.",
    action: "Utrzymuj napięty brzuch i spokojnie wróć do pozycji startowej.",
    avoid: "Zastępowanie wyprostu bioder przeprostem lędźwi.",
  },
  curl: {
    intent: "Zginaj kolana, utrzymując kontrolę miednicy.",
    action: "Dobierz zakres i opór, przy których kontrolujesz także powrót.",
    avoid: "Szarpanie i skracanie ruchu pod wpływem zmęczenia.",
  },
  push: {
    intent: "Odepchnij podłoże lub ciężar od siebie.",
    action: "Utrzymuj stabilny tułów i kontroluj opuszczanie.",
    avoid: "Odbijanie ciężaru i tracenie ustawienia tułowia.",
  },
  pull: {
    intent: "Przyciągnij ciężar w kontrolowanym torze.",
    action: "Utrzymuj stabilny tułów; prowadź łokcie zgodnie z wariantem ćwiczenia.",
    avoid: "Zamach tułowiem zastępujący pracę ramion i grzbietu.",
  },
  brace: {
    intent: "Utrzymuj pozycję mimo ruchu lub obciążenia.",
    action: "Oddychaj spokojnie i dobierz dźwignię, przy której zachowujesz ustawienie.",
    avoid: "Wydłużanie serii kosztem utraty pozycji.",
  },
  iso: {
    intent: "Utrzymuj napięcie w pozycji zapisanej w planie.",
    action: "Pracuj przez zaplanowany czas; zachowaj ustawienie i spokojny oddech.",
    avoid: "Zmiana kąta stawu, aby tylko przedłużyć serię.",
  },
  landing: {
    intent: "Wyląduj cicho i zatrzymaj stabilną pozycję.",
    action: "Przyjmij ciężar całym ciałem i utrzymaj kontrolę kolan oraz stóp.",
    avoid: "Natychmiastowe odbicie, jeśli zadaniem jest zatrzymanie lądowania.",
  },
  jump: {
    intent: "Odepchnij podłoże i skocz zdecydowanie.",
    action: "Każde powtórzenie wykonuj z dobrą jakością. Przygotuj miejsce na kontrolowane lądowanie.",
    avoid: "Dokładanie powtórzeń, gdy spada jakość odbicia i lądowania.",
  },
  reactive: {
    intent: "Odbij się sprężyście w kierunku zadania.",
    action: "Utrzymuj rytm i kontrolę kontaktów; przerwij serię przy utracie jakości.",
    avoid: "Celowo wolne zejście właściwe dla innych ćwiczeń siłowych.",
  },
  acceleration: {
    intent: "Odepchnij podłoże za siebie.",
    action: "Rozpędzaj się płynnie i prostuj stopniowo. Zostaw miejsce na wyhamowanie.",
    avoid: "Sięganie pierwszymi krokami daleko przed ciało.",
  },
  max_speed: {
    intent: "Biegnij wysoko i swobodnie.",
    action: "Wykonaj rozbieg, szybki odcinek i stopniowe wyhamowanie zgodnie z planem.",
    avoid: "Usztywnianie barków i wymuszanie długiego kroku.",
  },
  skip: {
    intent: "Pracuj rytmicznie, sprowadzaj stopę pod biodro.",
    action: "Utrzymuj stabilny tułów i wykonuj sekwencję właściwą dla tego skipu.",
    avoid: "Odchylanie tułowia, żeby sztucznie podnieść kolano wyżej.",
  },
};

export function hintKey(id: string, name = "", pattern = ""): string | null {
  const text = `${id} ${name}`.toLowerCase();
  if (/copenhagen/.test(text)) return "copenhagen";
  if (pattern === "isometric" || /\biso\b|isometr|izometr|plank|deska/.test(text)) return "iso";
  if (/full_nordic/.test(text)) return "full_nordic";
  if (/nordic/.test(text)) return "nordic";
  if (/flying|prędkość maks|lotny/.test(text)) return "max_speed";
  if (/skip/.test(text)) return "skip";
  if (/falling_start|split_stance_start|acceleration|przyspieszen/.test(text)) return "acceleration";
  if (/rdl|romanian|rumuński|rumunski|good.morning/.test(text)) return "rdl";
  if (/deadlift|martwy ciąg|martwy ciag|trap.bar/.test(text)) return "deadlift";
  if (/curl|uginanie|slider|swiss.ball/.test(text)) return "curl";
  if (/bridge|thrust|most biodrow/.test(text)) return "bridge";
  if (/drop.landing|depth.drop|stick|lądowan|ladowan/.test(text)) return "landing";
  if (/pogo|rebound|depth.jump|reactive/.test(text)) return "reactive";
  if (pattern === "jump" || /jump|skok|wyskok/.test(text)) return "jump";
  if (pattern === "lunge" || /split.squat|bułgars|bulgar|wykrok/.test(text)) return "split";
  if (pattern === "squat" || /squat|przysiad/.test(text)) return "squat";
  if (pattern === "push") return "push";
  if (pattern === "pull") return "pull";
  if (pattern === "brace" || /dead.bug|bird.dog/.test(text)) return "brace";
  return null;
}
