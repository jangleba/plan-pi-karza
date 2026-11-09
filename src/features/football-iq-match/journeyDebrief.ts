import { planLabels, reactionLabels, forecastReflection } from "./tacticalForecast";
import {
  chooseJourney,
  createJourneyForRules,
  journeyChoice,
  journeyDeliveryLane,
  journeyStep,
} from "./journeyEngine";
import type { JourneyChoice, JourneyDecision, JourneySession } from "./journeyTypes";
import { sameRevision } from "./liveLesson";
import { controlTacticalActor, tacticalGroup, tacticalAlternatives } from "./tacticalJourney";

export const IQ_COACHING_SOURCES = [
  {
    label: "FIFA: ruch bez piłki i tworzenie przestrzeni",
    url: "https://www.fifatrainingcentre.com/en/game/performance-analysis/football-language-analysis/movement-to-receive.php",
  },
  {
    label: "FIFA: prowadzenie na obrońcę i ruch partnerów",
    url: "https://www.fifatrainingcentre.com/en/practice/talent-coach-programme/sessions/movement-to-attack-the-space-in-behind.php",
  },
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
  teamDecisions?: string[];
};
function ruleFor(
  session: JourneySession,
  decision: JourneyDecision,
  choice?: JourneyChoice,
): MatchRule {
  if (
    session.rulesVersion === 7 &&
    session.players.find((p) => p.id === decision.before.carrierId)?.team === "away" &&
    ["move", "wait", "cover", "mark", "press"].includes(choice?.intent ?? "")
  )
    return {
      signal: "Rywal ma piłkę, a jego partner szuka odbioru między Tobą a bramką.",
      action:
        "Porównaj doskok z zamknięciem groźnego podania. Zanim przyspieszysz, znajdź bliskiego partnera z pola w osłonie. Gdy osłony brakuje, opóźnij grę i utrzymuj pozycję ograniczającą drogę do bramki; sama bliskość piłki nie wystarcza.",
      exception:
        "Jeżeli partner już wyszedł do piłki albo rywal przeniósł grę na drugą stronę, zabezpiecz odsłonięty korytarz i ponownie sprawdź odbiorcę za plecami.",
      reminder: "Zamknij groźną linię, sprawdź osłonę, wybierz moment doskoku.",
    };
  if (decision.why.toLowerCase().includes("spalon"))
    return {
      signal: "Podający podnosi głowę, a obrona wychodzi w górę.",
      action:
        "Sprawdź jednocześnie piłkę i przedostatniego rywala. Najpierw utrzymaj pozycję do zagrania, potem przyspiesz za linię; bieg po skosie może dać Ci czas bez przedwczesnego wyjścia.",
      exception:
        "Jeśli podający nadal jest pod naciskiem i nie może zagrać, nie zakładaj, że piłka ruszy zgodnie z Twoim pierwszym biegiem.",
      reminder: "Zobacz podającego, potem uruchom bieg.",
    };
  if ((session.rulesVersion === 6 || session.rulesVersion === 7) && choice?.intent === "carry")
    return {
      signal:
        "Obrońca skraca dystans lub przenosi ciężar ciała, a za nim pojawia się wolne wyjście.",
      action:
        choice.style === "shield"
          ? "Ustaw ciało między rywalem a piłką i obserwuj drugą stronę. Osłona ma kupić czas na kolejne zagranie, a nie zastępować ocenę partnerów."
          : "Dobierz stronę i zmianę tempa do doskoku. Po minięciu pierwszego rywala ponownie sprawdź osłonę: prowadzenie może przyciągnąć drugiego obrońcę i uwolnić partnera do podania.",
      exception:
        "Jeśli drugi rywal zamyka wyjście albo partner ma lepszą linię, przerwij pojedynek: odegraj, osłoń piłkę lub zawróć. Sam zwód nie tworzy jeszcze przewagi.",
      reminder: "Miń nacisk, zobacz drugiego rywala i partnera.",
    };
  if (
    (session.rulesVersion === 6 || session.rulesVersion === 7) &&
    ["decoy", "move", "wait"].includes(choice?.intent ?? "")
  )
    return {
      signal: "Partner ma piłkę, a rywal wybiera między kryciem Ciebie a zamknięciem innej linii.",
      action:
        "Obserwuj reakcję krycia po swoim ruchu. Jeżeli rywal idzie za Tobą, wolne miejsce może wykorzystać inny partner. Zachowaj nowy kąt i osłonę zamiast od razu wracać po piłkę.",
      exception:
        "Jeśli krycie nie podąża albo partner jest już pod naciskiem, skróć wsparcie lub utrzymaj szerokość. Bieg bez dostępnego kolejnego zagrania może jedynie ścisnąć przestrzeń.",
      reminder: "Twórz opcję dla akcji, nie tylko podanie do siebie.",
    };
  if ((session.rulesVersion === 6 || session.rulesVersion === 7) && choice?.intent === "hold")
    return {
      signal:
        "Linia jest chwilowo zamknięta, lecz partnerzy zmieniają pozycje i masz odstęp od nacisku.",
      action:
        "Przytrzymaj tylko tyle, by zobaczyć nową linię. Porównaj podanie, zmianę strony i prowadzenie po przesunięciu pierwszego obrońcy.",
      exception:
        "Gdy rywal skraca odstęp albo tracisz osłonę, zakończ czekanie. Wcześniej bezpieczne utrzymanie może stać się stratą.",
      reminder: "Czekaj na zmianę, nie na zamknięcie wszystkich opcji.",
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
    you = before.positions[decision.actorId ?? "you"];
  const playerNumber = (id: string) => session.players.find((p) => p.id === id)?.number;
  if ((session.rulesVersion === 6 || session.rulesVersion === 7) && choice?.intent === "shoot")
    return "Wybrałeś próbę zakończenia zamiast kontynuacji akcji. Oceniaj dostępny tor i pozycję partnerów; wynik strzału nie przesądza o jakości całej decyzji.";
  if ((session.rulesVersion === 6 || session.rulesVersion === 7) && choice?.intent === "carry")
    return `${choice.label}. ${choice.why} ${choice.timing === "delay" ? "Przed działaniem rywale mieli czas na przesunięcie." : "Ruch rozpoczął się od razu."}`;
  if ((session.rulesVersion === 6 || session.rulesVersion === 7) && choice?.intent === "decoy")
    return "Twój bieg był ruchem dla dalszej gry zespołu. Sprawdź w odtworzeniu, kto poszedł za Tobą i jaką linię wybrał zawodnik z piłką; otrzymanie podania nie jest warunkiem powodzenia takiego ruchu.";
  if (
    (session.rulesVersion === 6 || session.rulesVersion === 7) &&
    ["hold", "wait"].includes(choice?.intent ?? "")
  )
    return `Wybrałeś pozostanie w pozycji. ${decision.before.carrierId === "you" ? "Partnerzy szukali linii, a rywale mogli skrócić odstęp." : "Piłka pozostała w grze innych zawodników; Twój brak biegu również zmienił dostępne im opcje."}`;
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
    (p) =>
      p.team === "home" &&
      p.id !== "you" &&
      (session.rulesVersion !== 7 ||
        (!p.goalkeeper &&
          Math.hypot(before.positions[p.id].x - you.x, before.positions[p.id].y - you.y) < 30)) &&
      before.positions[p.id].y > you.y + 3,
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
  let before = sameRevision(
    createJourneyForRules(session.definition, session.rulesVersion ?? 3),
    session,
  );
  for (const d of session.decisions.slice(0, decisionIndex))
    before = chooseJourney(before, d.choiceId, d.decisionSeconds);
  if (
    (session.rulesVersion === 6 || session.rulesVersion === 7) &&
    decision.actorId &&
    decision.actorId !== "you"
  )
    before = controlTacticalActor(before, decision.actorId);
  const choice = journeyChoice(before, decision.choiceId);
  const candidates =
    session.rulesVersion === 7 && choice
      ? tacticalAlternatives(before, choice)
      : journeyStep(before)
          .choices.filter(
            (c) =>
              c.id !== decision.choiceId &&
              (!choice?.delivery || !c.delivery || c.delivery === choice.delivery) &&
              (session.rulesVersion !== 6 || !choice || tacticalGroup(c) === tacticalGroup(choice)),
          )
          .slice(0, session.rulesVersion === 6 || session.rulesVersion === 7 ? 6 : undefined);
  const viable = candidates
    .map((c) => ({ choice: c, next: chooseJourney(before, c.id, 0, false) }))
    .filter(
      ({ next }) =>
        (session.rulesVersion === 7 || !["loss", "blocked"].includes(next.outcome ?? "")) &&
        next.decisions.at(-1)?.quality !== "error",
    );
  const alternative =
    viable.find(({ next }) => next.decisions.at(-1)?.quality === "good") ?? viable[0];
  const comparison = alternative
    ? `${alternative.choice.label}: ${alternative.next.decisions.at(-1)!.why}`
    : null;
  return {
    decisionIndex,
    moment: `Decyzja ${decisionIndex + 1}${decision.actorId && decision.actorId !== "you" ? ` za partnera nr ${session.players.find((p) => p.id === decision.actorId)!.number}` : ""}: ${decision.label}`,
    observation: observationAt(before, decision, choice),
    consequence: decision.why,
    comparison,
    rule: ruleFor(session, decision, choice),
    ...(session.rulesVersion === 6 || session.rulesVersion === 7
      ? {
          teamDecisions: [
            ...new Set(
              session.beats
                .filter((b) => b.autonomous)
                .map((b) => {
                  const p = session.players.find((p) => p.id === b.actorId)!;
                  return `${p.team === "home" ? "Partner" : "Rywal"} nr ${p.number}: ${b.text}`;
                }),
            ),
          ].slice(0, 4),
        }
      : {}),
    mission:
      session.rulesVersion === 7
        ? matchMission(session, choice, decision)
        : session.rulesVersion === 6
          ? "W następnym meczu sprawdź jedną akcję, w której pomagasz partnerowi bez otrzymania piłki, i jedną, w której po przyciągnięciu nacisku wybierasz nowe zagranie. Obserwuj reakcję rywala, nie odtwarzaj schematu na pamięć."
          : session.definition.concept === "press-cover"
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
    ...(report.teamDecisions?.length ? ["DECYZJE INNYCH ZAWODNIKÓW", ...report.teamDecisions] : []),
    "",
    ...(session.forecasts ?? []).flatMap((f) => [
      `PROGNOZA — DECYZJA ${f.decisionIndex + 1}`,
      `Przewidywanie: ${reactionLabels[f.predicted]}. ${forecastReflection(f).reaction}`,
      f.plan ? `Plan: ${planLabels[f.plan]}. ${forecastReflection(f).plan}` : "",
      "",
    ]),
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

function matchMission(
  s: JourneySession,
  choice: JourneyChoice | undefined,
  decision: JourneyDecision,
) {
  const defending = s.players.find((p) => p.id === decision.before.carrierId)?.team === "away";
  const roleCue = defending
    ? {
        gk: "Jako bramkarz sprawdź przestrzeń za obroną i możliwość asekuracji",
        cb: "Jako środkowy obrońca sprawdź napastnika i odległość partnera obok",
        fb: "Jako boczny obrońca sprawdź skrzydłowego i korytarz do środka",
        six: "Jako szóstka sprawdź odbiorcę między liniami i drogę podania do niego",
        eight: "Jako ósemka sprawdź doskok partnera i odsłonięty korytarz",
        ten: "Jako dziesiątka sprawdź pomocnika rywali za pierwszą linią nacisku",
        wing: "Jako skrzydłowy sprawdź bocznego obrońcę rywali i podanie do środka",
        nine: "Jako napastnik sprawdź kierunek pierwszego podania i osłonę pomocnika",
      }[s.definition.role]
    : {
        gk: "Jako bramkarz przed przyjęciem sprawdź obie strony pierwszej linii nacisku",
        cb: "Jako środkowy obrońca sprawdź linię do pomocnika oraz partnera za naciskiem",
        fb: "Jako boczny obrońca sprawdź skrzydło i zabezpieczenie środka",
        six: "Jako szóstka sprawdź przestrzeń za plecami przed pokazaniem się między liniami",
        eight: "Jako ósemka porównaj wsparcie pod piłką z ruchem za pomocnika rywali",
        ten: "Jako dziesiątka sprawdź cień krycia i możliwość gry przez trzeciego",
        wing: "Jako skrzydłowy sprawdź drugiego obrońcę i partnera w półprzestrzeni",
        nine: "Jako napastnik sprawdź podającego i reakcję środkowego obrońcy",
      }[s.definition.role];
  const task =
    s.players.find((p) => p.id === decision.before.carrierId)?.team === "away" ||
    ["press", "cover", "mark"].includes(choice?.intent ?? "")
      ? "Przed doskokiem wskaż sobie partnera z pola w osłonie i odbiorcę, którego odcinasz. Po ruchu rywala sprawdź, czy korytarz rzeczywiście pozostał zamknięty."
      : choice?.intent === "carry"
        ? "Przed pojedynkiem nazwij sobie wyjście po zwodzie i podanie awaryjne. Po pierwszej reakcji obrońcy porównaj je ponownie; nie kończ zwodu za wszelką cenę."
        : "Przed ruchem przewidź reakcję jednego rywala i wybierz następny kąt wsparcia. Po jego reakcji sprawdź, czy plan nadal pomaga akcji, nawet jeśli piłkę dostał ktoś inny.";
  const context =
    s.definition.context === 0
      ? "Przy prowadzeniu uwzględnij koszt straty."
      : s.definition.context === 2
        ? "Przy niekorzystnym wyniku szukaj postępu, ale porównaj go z ryzykiem kontry."
        : "Zachowaj możliwość wyjścia z nacisku przez drugą stronę.";
  return `${roleCue}. ${task} ${context}`;
}
