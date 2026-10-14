export interface ExerciseDisplayName {
  title: string;
  variant: string;
  fullName: string;
}

// Presentation only: keep the exercise's original name, ID and saved results intact.
// Match known full names exactly, so a custom movement never loses its qualifiers.
const SHORT_NAMES: Readonly<Record<string, readonly [string, string]>> = {
  "Przysiad wykroczny bez obciążenia": ["Przysiad wykroczny", "Bez obciążenia"],
  "Przysiad z masą własnego ciała": ["Przysiad", "Masa ciała"],
  "Przysiad goblet": ["Przysiad", "Goblet"],
  "Przysiad ze sztangą (back squat)": ["Przysiad", "Sztanga z tyłu"],
  "Przysiad przedni": ["Przysiad", "Sztanga z przodu"],
  "Przysiad bułgarski z obciążeniem": ["Przysiad bułgarski", "Z obciążeniem"],
  "Martwy ciąg klasyczny": ["Martwy ciąg", "Klasyczny"],
  "Martwy ciąg z trap barem": ["Martwy ciąg", "Trap bar"],
  "Martwy ciąg rumuński z hantlami": ["Martwy ciąg rumuński", "Hantle"],
  "Martwy ciąg rumuński ze sztangą": ["Martwy ciąg rumuński", "Sztanga"],
  "Martwy ciąg rumuński na jednej nodze": ["Martwy ciąg rumuński", "Jednonóż"],
  "Wypychanie bioder ze sztangą": ["Wypychanie bioder", "Sztanga"],
  "Wykrok w tył": ["Wykrok", "W tył"],
  "Wykrok boczny": ["Wykrok", "W bok"],
  "Wypychanie ciężaru na suwnicy": ["Wypychanie ciężaru", "Suwnica"],
  "Prostowanie nóg na maszynie": ["Prostowanie nóg", "Maszyna"],
  "Uginanie nóg siedząc": ["Uginanie nóg", "Siedząc"],
  "Uginanie nóg leżąc": ["Uginanie nóg", "Leżąc"],
  "Wspięcia na palce stojąc": ["Wspięcia na palce", "Stojąc"],
  "Wspięcia na palce siedząc": ["Wspięcia na palce", "Siedząc"],
  "Izometryczne wspięcie na mięsień płaszczkowaty": ["Wspięcie na palce", "Izometryczne · płaszczkowaty"],
  "Most hamstring izometryczny z długą dźwignią": ["Most na piętach", "Izometryczny · długa dźwignia"],
  "Zarzut siłowy z pozycji zwisu": ["Zarzut siłowy", "Z pozycji zwisu"],
  "Lądowanie po zejściu z podestu": ["Lądowanie", "Po zejściu z podestu"],
  "Skok z zamachem": ["Skok pionowy", "Z zamachem rąk"],
  "Wyskocz z przysiadu": ["Skok z przysiadu", ""],
  "Skok w dal z miejsca": ["Skok w dal", "Z miejsca"],
  "Powtarzane skoki w dal": ["Skoki w dal", "Powtarzane"],
  "Pogo obunóż": ["Pogo", "Obunóż"],
  "Pogo jednonóż": ["Pogo", "Jednonóż"],
  "Pogo boczne": ["Pogo", "W bok"],
  "Wyskoki z pozycji wykrocznej": ["Wyskoki", "Z pozycji wykrocznej"],
  "Wskok na skrzynię": ["Wskok", "Na skrzynię"],
  "Przeskoki przez płotki": ["Przeskoki", "Przez płotki"],
  "Skok boczny z zatrzymaniem": ["Skok boczny", "Z zatrzymaniem"],
  "Skok jednonóż z zatrzymaniem": ["Skok jednonóż", "Z zatrzymaniem"],
  "Skok diagonalny z zatrzymaniem": ["Skok diagonalny", "Z zatrzymaniem"],
  "Wyskoki z trap barem": ["Wyskoki", "Trap bar"],
  "Wyskoki z hantlami": ["Wyskoki", "Hantle"],
  "Wyskoki ze sztangą": ["Wyskoki", "Sztanga"],
  "Wymach kettlebell": ["Wymach", "Kettlebell"],
  "Wyciskanie sztangi z wybiciem nóg": ["Wyciskanie sztangi", "Z wybiciem nóg"],
  "Wyrzut piłki lekarskiej sprzed klatki": ["Wyrzut piłki", "Lekarska · sprzed klatki"],
  "Wyrzut piłki lekarskiej nad głową w tył": ["Wyrzut piłki", "Lekarska · nad głową w tył"],
  "Rotacyjny wyrzut piłki lekarskiej z dołu": ["Wyrzut piłki", "Lekarska · rotacyjnie z dołu"],
  "Uderzenie piłką lekarską o podłoże": ["Uderzenie piłką", "Lekarska · o podłoże"],
  "Skok z odciążeniem gumą": ["Skok", "Z odciążeniem gumą"],
  "Nordic hamstring wspomagany": ["Nordic hamstring", "Wspomagany"],
  "Nordic hamstring ekscentryczny": ["Nordic hamstring", "Ekscentryczny"],
  "Nordic hamstring pełny": ["Nordic hamstring", "Pełny"],
  "Uginanie nóg na ślizgach obunóż": ["Uginanie nóg", "Ślizgi · obunóż"],
  "Uginanie nogi na ślizgu jednonóż": ["Uginanie nogi", "Ślizg · jednonóż"],
  "Uginanie nóg na piłce szwajcarskiej obunóż": ["Uginanie nóg", "Piłka szwajcarska · obunóż"],
  "Uginanie nogi na piłce szwajcarskiej jednonóż": ["Uginanie nogi", "Piłka szwajcarska · jednonóż"],
  "Uginanie nóg leżąc z gumą": ["Uginanie nóg", "Leżąc · guma"],
};

export function exerciseDisplayName(fullName: string): ExerciseDisplayName {
  const name = fullName.trim();
  const known = Object.prototype.hasOwnProperty.call(SHORT_NAMES, name)
    ? SHORT_NAMES[name]
    : undefined;
  return {
    title: known?.[0] ?? name,
    variant: known?.[1] ?? "",
    fullName,
  };
}
