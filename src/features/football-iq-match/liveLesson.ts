import type { JourneySession } from "./journeyTypes";
import { situationFor } from "./situationBank";

/** Rules v9 revision 2: partners cross, switch and chip; headers. */
export const ATTACK_BANK_VERSION = "2026-11-09.10";
/** Rules v9 before revision 2 (all partner passes on the ground). Still replayed. */
export const ATTACK_BANK_VERSION_V9 = "2026-11-07.9";
/** Every saved attack version that still replays. */
export const ATTACK_BANK_VERSIONS: readonly string[] = [
  ATTACK_BANK_VERSION,
  ATTACK_BANK_VERSION_V9,
];
export const LIVE_BANK_VERSION = "2026-11-06.8";
export function lessonGoal(s: JourneySession) {
  const situation = situationFor(s.definition);
  if (situation) return situation.goal;
  if (s.rulesVersion === 9)
    return s.definition.concept === "press-cover"
      ? "Odbierz piłkę, zbuduj atak i doprowadź do gola."
      : "Zbuduj całą akcję: wyjdź spod nacisku, stwórz szansę i zdobądź gola.";
  if (s.definition.role === "wing" && s.definition.concept === "third-player")
    return "Pomóż ósemce wyjść spod nacisku. Przygotuj też możliwość kolejnego zagrania.";
  if (s.definition.concept === "press-cover")
    return "Ogranicz wyjście rywala do środka. Zachowaj osłonę, zanim ruszysz do piłki.";
  if (s.definition.concept === "overload-switch")
    return "Wyjdź z zatłoczonej strony. Po zmianie kierunku zapewnij odbiorcy dalszą opcję.";
  return "Przejdź poza pierwszy nacisk i przygotuj następne zagranie, zachowując wsparcie.";
}
export function lessonQuestion(s: JourneySession) {
  if (s.rulesVersion === 9) {
    if (s.world.looseBall)
      return "Piłka jest wolna. Jak dojdziesz do niej przed rywalem?";
    if (s.players.find((p) => p.id === s.world.carrierId)?.team === "away")
      return "Strata to część akcji. Gdzie zamkniesz wyjście rywala i odzyskasz piłkę?";
    if (s.world.positions[s.world.carrierId].y < 32)
      return "Strzał czy dodatkowe podanie? Sprawdź bramkarza i obrońcę.";
    if (s.step > 2)
      return "Akcja trwa. Jak przesuniesz grę bliżej bramki i przygotujesz kolejne zagranie?";
  }
  if (s.step === 0)
    return s.world.carrierId === "you"
      ? "Gdzie będzie miejsce, gdy rywal ruszy do piłki?"
      : "Co Twój ruch zmieni dla partnera z piłką?";
  if (s.step === 1)
    return "Układ się zmienił. Co teraz pozwoli kontynuować grę?";
  return "Pomyśl o następnej akcji. Jak zachowasz wsparcie i osłonę?";
}
export function lessonHint(s: JourneySession) {
  return s.definition.concept === "press-cover"
    ? "Sprawdź piłkę, odbiorcę za Twoimi plecami i osłonę partnera. Sam doskok nie wystarczy."
    : "Porównaj dwie przestrzenie. Który rywal może zamknąć podanie i co zostawi za sobą?";
}
export function lessonTakeaway(s: JourneySession) {
  if (s.attack?.finish === "goal")
    return s.attack.home
      ? "Gol zamyka całą akcję. W powtórce sprawdź, który ruch otworzył podanie i skąd pojawiła się okazja do strzału."
      : "Gol rywali. W powtórce znajdź stratę i moment, w którym zabrakło osłony.";
  if (s.attack?.finish === "miss")
    return "Niecelny strzał kończy akcję. Porównaj kąt uderzenia, ustawienie bramkarza i dostępną opcję podania.";
  if (s.attack?.finish === "stopped")
    return "Przerwano bardzo długą akcję bez rozstrzygnięcia. Nie zdobyto gola. Spróbuj zmienić kierunek gry zamiast powtarzać te same ruchy.";
  const movedRival = s.beats
    .flatMap((b) => b.events ?? [])
    .find((e) => /kryjąc|za Twoim/.test(e.text));
  if (s.outcome === "loss" || s.outcome === "blocked")
    return "Sprawdź ponownie tor i nacisk przy przyjęciu. Miejsce wolne przy kopnięciu może zniknąć przed dojściem piłki.";
  if (s.definition.concept === "press-cover")
    return "Gdy wychodzisz do piłki, sprawdzaj osłonę za sobą. Po odbiorze szukaj bezpiecznego pierwszego podania.";
  return movedRival
    ? "Jeśli obrońca idzie za Twoim ruchem, szukaj uwolnionej linii dla partnera. Jeśli zostaje, sprawdź własne przyjęcie."
    : "Po zagraniu lub ruchu sprawdź nowy układ. Odbiorca potrzebuje kolejnej opcji, a drużyna osłony straty.";
}
