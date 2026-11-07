import type { JourneySession } from "./journeyTypes";

export const LIVE_BANK_VERSION = "2026-11-06.8";
export function lessonGoal(s: JourneySession) {
  if (s.definition.role === "wing" && s.definition.concept === "third-player")
    return "Pomóż ósemce wyjść spod nacisku. Przygotuj też możliwość kolejnego zagrania.";
  if (s.definition.concept === "press-cover")
    return "Ogranicz wyjście rywala do środka. Zachowaj osłonę, zanim ruszysz do piłki.";
  if (s.definition.concept === "overload-switch")
    return "Wyjdź z zatłoczonej strony. Po zmianie kierunku zapewnij odbiorcy dalszą opcję.";
  return "Przejdź poza pierwszy nacisk i przygotuj następne zagranie, zachowując wsparcie.";
}
export function lessonQuestion(s: JourneySession) {
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
