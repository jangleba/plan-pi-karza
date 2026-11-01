import {
  chooseJourney,
  createJourneyForRules,
  journeyChoice,
  journeyDeliveryLane,
  journeyStep,
} from "./journeyEngine";
import type { JourneyChoice, JourneyDecision, JourneySession } from "./journeyTypes";

export const IQ_COACHING_SOURCES = [
  {
    label: "FIFA: gra na trzeciego",
    url: "https://www.fifatrainingcentre.com/en/game/game-analysis/in-possession/third-player-combinations.php",
  },
  {
    label: "FIFA: tworzenie i wykorzystanie przewagi",
    url: "https://www.fifatrainingcentre.com/en/practice/elite-sessions/in-possession/creating-and-exploiting-overloads.php",
  },
  {
    label: "FIFA: pressing i zabezpieczenie przestrzeni",
    url: "https://www.fifatrainingcentre.com/en/practice/talent-coach-programme/block-and-prevent/3v3-plus-2-possession-game-pressing-when-outnumbered.php",
  },
];
type MatchRule = { signal: string; action: string; exception: string; reminder: string };
export type JourneyDebrief = {
  decisionIndex: number;
  moment: string;
  observation: string;
  consequence: string;
  comparison: string | null;
  rule: MatchRule;
  mission: string;
};
function ruleFor(session: JourneySession, decision: JourneyDecision): MatchRule {
  if (decision.why.toLowerCase().includes("spalon"))
    return {
      signal: "Podający podnosi głowę, a obrona wychodzi w górę.",
      action:
        "Sprawdź jednocześnie piłkę i przedostatniego rywala. Najpierw utrzymaj pozycję do zagrania, potem przyspiesz za linię; bieg po skosie może dać Ci czas bez przedwczesnego wyjścia.",
      exception:
        "Jeśli podający nadal jest pod naciskiem i nie może zagrać, nie zakładaj, że piłka ruszy zgodnie z Twoim pierwszym biegiem.",
      reminder: "Zobacz podającego, potem uruchom bieg.",
    };
  const concept =
    session.definition.concept ??
    (session.definition.pattern.includes("third")
      ? "third-player"
      : ["cover", "press", "recover", "defend-air"].includes(session.definition.pattern)
        ? "press-cover"
        : "overload-switch");
  if (concept === "third-player")
    return {
      signal: "Rywal zamyka bezpośrednie podanie i rusza za piłką do pierwszego odbiorcy.",
      action:
        "Po odegraniu wyjdź z cienia nacisku, tworząc linię dla kolejnego partnera. Przed powrotem piłki ponownie sprawdź obrońcę — pierwszy ruch rywala otwiera okno, ale jego partner może je od razu zamknąć.",
      exception:
        "Nie wymuszaj kombinacji, jeżeli trzeciego zawodnika zamknięto. Zostaw podanie wstecz i otwórz inny kąt.",
      reminder: "Zagraj, odczytaj doskok, pokaż drugi kąt.",
    };
  if (concept === "press-cover")
    return {
      signal: "Przeciwnik przyjmuje, a partner może osłonić przestrzeń za Twoim doskokiem.",
      action:
        "Podejdź od strony odcinającej grę do środka i kontroluj odbiorcę za plecami. Oceń osłonę partnera przed przyspieszeniem; sam dystans do piłki nie wystarcza do decyzji o pressingu.",
      exception:
        "Bez osłony lub przy otwartym podaniu za Tobą opóźnij atak i broń środka zamiast ścigać piłkę.",
      reminder: "Najpierw osłona, potem kierunek doskoku.",
    };
  return {
    signal: "Nacisk skupia się po stronie piłki, a dalszy partner zachowuje szerokość.",
    action:
      "Zanim przeniesiesz grę, sprawdź nie tylko wolnego odbiorcę, lecz także powrót dalszego pomocnika i kolejne podanie po przyjęciu. Przyciągnięcie ma sens, jeżeli faktycznie przesuwa obronę, a nie tylko wydłuża Twój kontakt z piłką.",
    exception:
      session.definition.context === 0
        ? "Przy prowadzeniu nie forsuj dalekiego zagrania, jeśli odbiorca straci miejsce przed przyjęciem lub z tyłu brakuje osłony. Utrzymaj piłkę i zbuduj nowy kąt."
        : "Jeżeli obrona zdążyła przesunąć, podanie przez partnera lub utrzymanie piłki może być lepsze niż natychmiastowy przerzut.",
    reminder: "Przyciągnij tylko po to, by uwolnić następne zagranie.",
  };
}
function observationAt(
  session: JourneySession,
  decision: JourneyDecision,
  choice: JourneyChoice | undefined,
) {
  const before = decision.before,
    you = before.positions.you;
  const playerNumber = (id: string) => session.players.find((p) => p.id === id)?.number;
  if (choice?.targetId) {
    const lane = journeyDeliveryLane(
      { ...session, world: before },
      you,
      choice.point,
      choice.delivery ?? "ground",
    );
    const receiver = playerNumber(choice.targetId);
    const pressure = session.players
      .filter((p) => p.team === "away" && !p.goalkeeper)
      .map((p) => ({
        number: p.number,
        gap: Math.hypot(
          before.positions[p.id].x - choice.point.x,
          before.positions[p.id].y - choice.point.y,
        ),
      }))
      .sort((a, b) => a.gap - b.gap)[0];
    return lane.distance < 5
      ? `Przy zagraniu do nr ${receiver} rywal nr ${playerNumber(lane.id)} ograniczał wybrany tor podania. Trzeba było ocenić linię zagrania, a nie tylko miejsce samego odbiorcy.`
      : pressure.gap < 8
        ? `Tor do nr ${receiver} był dostępny, ale rywal nr ${pressure.number} pozostawał blisko miejsca przyjęcia. Przestrzeń na podanie i czas na następne zagranie to dwie różne rzeczy.`
        : `Nr ${receiver} miał dostępny tor i przestrzeń na przyjęcie. Kluczowy był Twój następny kąt wsparcia, zanim obrona przesunęła się do piłki.`;
  }
  const cover = session.players.filter(
    (p) => p.team === "home" && p.id !== "you" && before.positions[p.id].y > you.y + 3,
  ).length;
  if (["press", "cover", "mark", "transition"].includes(decision.action))
    return cover
      ? `Za Twoją pozycją było ${cover} partnerów. Liczyło się jednak to, czy osłaniali korytarz za doskokiem; sama obecność zawodnika z tyłu nie zamyka podania do środka.`
      : "Za Twoją pozycją nie było partnera dającego prostą osłonę. Wyjście w stronę piłki mogło otworzyć korytarz do Twojej bramki.";
  const destination = choice?.point ?? decision.after.positions.you;
  return destination.y < you.y - 8
    ? "Ruch w przód zmieniał nie tylko wysokość Twojej pozycji, ale też kąt kolejnego podania i odległość powrotu po stracie. Trzeba było sprawdzić oba kierunki gry."
    : "Wybrana zmiana kąta dawała inny widok na piłkę i rywala. Ruch oceniany był przez nową linię podania i presję po reakcji obrony, nie przez sam pokonany dystans.";
}
export function journeyDebrief(session: JourneySession): JourneyDebrief | null {
  if (!session.outcome || !session.decisions.length) return null;
  const issue =
    session.decisions.findIndex((d) => d.quality === "error") >= 0
      ? session.decisions.findIndex((d) => d.quality === "error")
      : session.decisions.findIndex((d) => d.quality === "possible");
  const decisionIndex =
    issue >= 0
      ? issue
      : session.decisions.reduce((best, d, index) => {
          const value = (decision: JourneyDecision) =>
            Math.hypot(
              decision.after.positions.you.x - decision.before.positions.you.x,
              decision.after.positions.you.y - decision.before.positions.you.y,
            ) + (decision.action === "press" ? 10 : 0);
          return value(d) > value(session.decisions[best]) ? index : best;
        }, 0);
  const decision = session.decisions[decisionIndex];
  let before = createJourneyForRules(session.definition, session.rulesVersion ?? 3);
  for (const d of session.decisions.slice(0, decisionIndex))
    before = chooseJourney(before, d.choiceId, d.decisionSeconds);
  const choice = journeyChoice(before, decision.choiceId);
  const candidates = journeyStep(before).choices.filter(
    (c) =>
      c.id !== decision.choiceId &&
      (!choice?.delivery || !c.delivery || c.delivery === choice.delivery),
  );
  const viable = candidates
    .map((c) => ({ choice: c, next: chooseJourney(before, c.id, 0, false) }))
    .filter(
      ({ next }) =>
        !["loss", "blocked"].includes(next.outcome ?? "") &&
        next.decisions.at(-1)?.quality !== "error",
    );
  const alternative =
    viable.find(({ next }) => next.decisions.at(-1)?.quality === "good") ?? viable[0];
  const comparison = alternative
    ? `${alternative.choice.label}: ${alternative.next.decisions.at(-1)!.why}`
    : null;
  return {
    decisionIndex,
    moment: `Decyzja ${decisionIndex + 1}: ${decision.label}`,
    observation: observationAt(before, decision, choice),
    consequence: decision.why,
    comparison,
    rule: ruleFor(session, decision),
    mission:
      session.definition.concept === "press-cover"
        ? "W meczu przed pierwszym doskokiem znajdź partnera osłaniającego Twoje plecy i odbiorcę w środku. Sprawdź, czy po Twoim ruchu linia do niego rzeczywiście znika."
        : "W meczu po następnym odegraniu sprawdź reakcję najbliższego rywala i otwórz nowy kąt. Oceń, czy kolejne podanie stało się łatwiejsze — nie tylko czy sam ruszyłeś do przodu.",
  };
}
export function journeyDebriefText(session: JourneySession, report: JourneyDebrief) {
  return [
    `BallWise IQ — ${session.definition.title}`,
    session.definition.contextLabel,
    "",
    report.moment,
    report.observation,
    report.consequence,
    report.comparison ? `Inny wariant: ${report.comparison}` : "",
    "",
    "DO WYKORZYSTANIA W MECZU",
    `Sygnał: ${report.rule.signal}`,
    `Reakcja: ${report.rule.action}`,
    `Kiedy zmienić plan: ${report.rule.exception}`,
    `Zapamiętaj: ${report.rule.reminder}`,
    report.mission,
    "",
    "Ocena dotyczy modelowanej sytuacji, a nie wyniku przyszłego meczu.",
    ...IQ_COACHING_SOURCES.map((s) => `${s.label}: ${s.url}`),
  ]
    .filter(Boolean)
    .join("\n");
}
