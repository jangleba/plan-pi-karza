/** Specific Polish execution steps for established gym exercises. These replace
 * generic family instructions; they do not verify an athlete's technique. */
export const GYM_EXECUTION_GUIDES: Record<string, string[]> = {
  med_ball_throw: [
    "Użyj wyznaczonej strefy rzutów i piłki przeznaczonej do danego podłoża lub ściany. Sprawdź, czy nikt nie wejdzie w tor lotu ani odbicia.",
    "Trzymaj piłkę przy klatce piersiowej, napnij tułów i wyrzuć ją zdecydowanie oburącz w wyznaczony cel.",
    "Poczekaj na zatrzymanie piłki, podnieś ją i ustaw się ponownie. Nie chwytaj ciężkiej odbijającej się piłki; przerwij serię przy wyraźnym spowolnieniu.",
  ],

  front_squat: [
    "Ustaw stojaki i belki asekuracyjne. Oprzyj sztangę na przedniej części barków, z łokciami wysoko i chwytem pozwalającym utrzymać tę pozycję.",
    "Napnij tułów, postaw całe stopy na podłożu i zejdź do głębokości, na której zachowujesz ustawienie sztangi oraz kolan.",
    "Wstań zdecydowanie bez zapadania łokci i tułowia. Zachowaj zapisany zapas; odłóż sztangę na oba haki.",
  ],
  trap_bar_deadlift: [
    "Stań pośrodku trap bara, ustaw stopy stabilnie i wybierz uchwyty pozwalające utrzymać kontrolowany tułów. Sprawdź symetrię obciążenia i zamki.",
    "Złap oba uchwyty, napnij tułów i wyciśnij podłoże stopami, prostując biodra oraz kolana bez szarpnięcia.",
    "Stań prosto bez odchylania pleców, po czym opuść trap bar pod kontrolą. Przed następnym powtórzeniem ustaw go nieruchomo i odtwórz napięcie.",
  ],
  barbell_deadlift: [
    "Ustaw sztangę nad środkiem stóp. Cofnij biodra, złap sztangę tuż poza nogami i napnij tułów, utrzymując ją blisko goleni.",
    "Odepchnij podłoże, prowadząc sztangę blisko ciała. Biodra i barki unoszą się pod kontrolą, bez nagłego szarpnięcia plecami.",
    "Zakończ w staniu bez przeprostu lędźwi. Cofnij biodra i opuść sztangę; ustaw się ponownie przed kolejną próbą.",
  ],
  barbell_romanian_deadlift: [
    "Stań ze sztangą przy udach, kolanami lekko ugiętymi i napiętym tułowiem. Utrzymuj ciężar blisko nóg.",
    "Cofaj biodra, pochylając tułów bez zmiany ustawienia kręgosłupa. Zatrzymaj zejście, zanim dalszy ruch wymaga zaokrąglenia pleców.",
    "Wyprostuj biodra, wracając do stania. Nie musisz dotykać sztangą podłoża i nie kończ ruchem przeprostu pleców.",
  ],
  romanian_deadlift_db: [
    "Trzymaj hantle przed udami, ugnij lekko kolana i napnij tułów. Stopy pozostają w pełnym kontakcie z podłożem.",
    "Cofaj biodra i prowadź hantle blisko nóg, aż osiągniesz kontrolowany zakres bez zaokrąglania pleców.",
    "Wróć przez wyprost bioder, bez odchylania tułowia w tył. Utrzymuj podobny zakres w każdym powtórzeniu.",
  ],
  single_leg_romanian_deadlift: [
    "Stań na jednej nodze z lekko ugiętym kolanem; trzymaj hantel w dłoni przeciwnej do nogi podporowej. Wybierz obciążenie pozwalające utrzymać równowagę.",
    "Cofnij biodra, pochylając tułów i kierując drugą nogę w tył. Utrzymuj miednicę możliwie równo, bez otwierania jej na bok.",
    "Wróć do stania przez wyprost biodra nogi podporowej. Odzyskaj równowagę przed następnym powtórzeniem; wykonaj obie strony.",
  ],
  bulgarian_split_squat: [
    "Oprzyj tylną stopę na stabilnej ławce i ustaw przednią w odległości pozwalającej kontrolować pełny ruch. Trzymaj hantle przy tułowiu.",
    "Opuść biodra pod kontrolą, utrzymując przednią stopę podpartą, miednicę stabilną i kolano zgodnie z kierunkiem stopy.",
    "Wstań, odpychając się głównie przednią nogą. Zachowaj zapisany zapas i ten sam zakres; dopiero potem zmień stronę.",
  ],
  reverse_lunge: [
    "Stań stabilnie z hantlami przy tułowiu i napnij brzuch. Pozostaw wolne miejsce za sobą.",
    "Zrób kontrolowany krok w tył i opuść tylne kolano w stronę podłoża, utrzymując przednią stopę w pełnym podparciu.",
    "Wróć do stania przez pracę przedniej nogi, bez zamachu tułowiem. Wykonaj zapisaną liczbę na stronę.",
  ],
  bodyweight_split_squat: [
    "Ustaw stopy w wykroku na szerokość pozwalającą zachować równowagę. Tułów pozostaje napięty, a przednia stopa w pełnym podparciu.",
    "Opuść biodra pionowo, uginając oba kolana. Przednie kolano prowadź zgodnie z kierunkiem stopy.",
    "Wstań, dociskając przednią stopę do podłoża. Utrzymuj kontrolowany zakres i wykonaj obie strony.",
  ],
  medicine_ball_rotational_scoop_toss: [
    "Ustaw się bokiem do celu w zabezpieczonej strefie rzutów. Wybierz lekką piłkę odpowiednią do ściany lub podłoża; sprawdź tor lotu i odbicia.",
    "Cofnij piłkę przy biodrze, a następnie połącz obrót stóp i bioder z dynamicznym wyrzutem oburącz. Nie wymuszaj skrętu samym odcinkiem lędźwiowym.",
    "Pozwól piłce się zatrzymać, podnieś ją i ustaw się ponownie. Wykonaj obie strony; nie chwytaj ciężkiego odbicia.",
  ],
  medicine_ball_slam: [
    "Sprawdź wolne miejsce nad głową i przed stopami. Użyj piłki przeznaczonej do rzutów o podłoże, z kontrolowanym lub zerowym odbiciem.",
    "Unieś piłkę nad głowę bez przeprostu pleców, następnie wyrzuć ją zdecydowanie w podłoże przed sobą, uginając biodra i kolana.",
    "Poczekaj na zatrzymanie piłki i podnieś ją z kontrolą tułowia. Każdy rzut rozpocznij osobno; zakończ serię przy spowolnieniu.",
  ],
  plank: [
    "Oprzyj przedramiona pod barkami i stopy na podłożu. Ustaw ciało w prostej linii od głowy do pięt.",
    "Napnij brzuch i pośladki, utrzymując miednicę bez opadania ani unoszenia wysoko. Oddychaj swobodnie.",
    "Utrzymaj pozycję przez czas z sesji; zakończ wcześniej, gdy nie utrzymujesz ustawienia. Odpocznij przed kolejną serią.",
  ],
  side_plank: [
    "Oprzyj przedramię pod barkiem i ułóż nogi jedna na drugiej lub z niewielkim rozstawieniem dla równowagi.",
    "Unieś biodra, utrzymując tułów i miednicę w jednej linii, bez obracania klatki w stronę podłoża.",
    "Oddychaj spokojnie przez zapisany czas, następnie opuść biodra pod kontrolą. Powtórz na drugą stronę.",
  ],
  pull_up: [
    "Złap stabilny drążek chwytem umożliwiającym kontrolowany ruch. Zacznij z napiętym tułowiem i spokojnym ustawieniem barków.",
    "Przyciągnij ciało w stronę drążka bez kopania nogami i kołysania. Utrzymuj podobny zakres w kolejnych powtórzeniach.",
    "Opuść się pod kontrolą do wygodnego wyprostu ramion. Zachowaj zapisany zapas; gdy nie utrzymujesz zakresu, wybierz ułatwiony wariant.",
  ],
  drop_landing: [
    "Ustaw niski, stabilny podest i wolną, nieśliską strefę lądowania. Wysokość dobierz do kontroli, bez podnoszenia jej kosztem techniki.",
    "Zejdź z podestu bez wyskoku. Wyląduj obunóż, amortyzując biodrami, kolanami i stawami skokowymi.",
    "Zatrzymaj pozycję na 2 sekundy, bez kolejnego odbicia. Wyjdź z lądowania, wróć na podest i ustaw się ponownie.",
  ],
};
