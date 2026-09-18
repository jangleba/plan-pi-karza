import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, MessageCircleQuestion } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useInstantBack } from "@/lib/loadwise/uiHooks";

export const Route = createFileRoute("/faq")({
  component: FaqScreen,
});

const FAQ_ITEMS = [
  {
    question: "Dlaczego mój plan zmienił się w trakcie tygodnia?",
    answer:
      "BallWise dopasowuje obciążenie do meczu, treningów klubowych, dostępności oraz Twojego check-inu. Zmiana ma chronić jakość najważniejszych jednostek, a nie dokładać trening za wszelką cenę.",
  },
  {
    question: "Czy trening klubowy zastępuje trening BallWise?",
    answer:
      "Trening klubowy liczy się do całkowitego obciążenia, ale zwykle nie zastępuje pracy indywidualnej. W bardzo obciążonym tygodniu aplikacja może ograniczyć lub zmienić sesję, aby zachować bezpieczny odstęp od meczu.",
  },
  {
    question: "Co oznacza check-in przed treningiem?",
    answer:
      "To krótka ocena snu, energii, zmęczenia i ewentualnego bólu. Na jej podstawie BallWise może zostawić plan, obniżyć jego trudność albo zaproponować bezpieczniejszy wariant.",
  },
  {
    question: "Co zrobić, gdy czuję ból?",
    answer:
      "Zaznacz ból w check-inie i nie wykonuj ruchu, który go nasila. BallWise może ograniczyć obciążenie, ale nie diagnozuje urazów. Przy ostrym, narastającym lub utrzymującym się bólu przerwij trening i skontaktuj się ze specjalistą.",
  },
  {
    question: "Nie mam sprzętu do ćwiczenia — co dalej?",
    answer:
      "Wybierz opcję „Nie mam…” przy ćwiczeniu. Jeśli istnieje bezpieczny zamiennik zgodny z celem sesji, aplikacja podmieni ruch bez przebudowywania całego treningu.",
  },
  {
    question: "Jak działa sesja sprintu?",
    answer:
      "Przechodź blok po bloku i oznaczaj wykonane ćwiczenia. Wbudowany czas odpoczynku pomaga zachować jakość powtórzeń. Postęp sesji jest zapisywany, więc po przypadkowym wyjściu możesz wrócić do ostatniego miejsca.",
  },
  {
    question: "Czy mogę wykonać dwie sesje jednego dnia?",
    answer:
      "Tak, jeśli plan je przewiduje. Każda sesja ma osobny zapis i nie powinna być uruchamiana drugi raz jako duplikat. Zawsze kieruj się kolejnością i intensywnością pokazaną w planie.",
  },
  {
    question: "Co dzieje się bez internetu?",
    answer:
      "Najważniejsze zmiany są najpierw zapisywane na urządzeniu i synchronizowane po odzyskaniu połączenia. Nie zamykaj aplikacji od razu po treningu, jeśli widzisz informację o oczekującej synchronizacji.",
  },
  {
    question: "Czy wskazówki Fuel są dokładnym jadłospisem?",
    answer:
      "Nie. Fuel podaje praktyczne zakresy i przykłady zależne od dnia treningowego. Nie zastępuje indywidualnej porady dietetycznej ani medycznej, szczególnie przy alergiach, chorobach lub specjalnych potrzebach żywieniowych.",
  },
  {
    question: "Jak działa Football IQ?",
    answer:
      "Zadania uczą rozpoznawania sytuacji boiskowych i wyboru decyzji. Wynik opisuje odpowiedź w danym scenariuszu — nie jest pomiarem refleksu ani diagnozą umiejętności zawodnika.",
  },
  {
    question: "Dlaczego w Postępie nie widzę jeszcze trendu?",
    answer:
      "Trend potrzebuje kilku regularnie ukończonych sesji i check-inów. Na początku brak wykresu jest prawidłowy; aplikacja nie tworzy sztucznego wyniku bez wystarczających danych.",
  },
  {
    question: "Gdzie mogę pobrać lub usunąć swoje dane?",
    answer:
      "W Profilu otwórz „Moje dane i prawa (RODO)”. Znajdziesz tam eksport danych, zarządzanie zgodami oraz trwałe usunięcie konta.",
  },
] as const;

function FaqScreen() {
  const goBack = useInstantBack("/");

  return (
    <main className="app-shell premium-flow min-h-screen px-5 pb-16 pt-6">
      <button
        type="button"
        onClick={goBack}
        className="mb-4 inline-flex min-h-11 items-center gap-1 rounded-full border border-border px-3 text-sm text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Wstecz
      </button>

      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <MessageCircleQuestion className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-[24px] font-medium tracking-[-0.03em]">Pomoc i FAQ</h1>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Najważniejsze odpowiedzi o planie, treningu i Twoich danych.
          </p>
        </div>
      </div>

      <Accordion type="single" collapsible className="mt-6 soft-card px-4">
        {FAQ_ITEMS.map((item, index) => (
          <AccordionItem key={item.question} value={`item-${index}`}>
            <AccordionTrigger className="min-h-14 py-3 text-left text-sm leading-snug hover:no-underline">
              {item.question}
            </AccordionTrigger>
            <AccordionContent className="pb-4 text-sm leading-relaxed text-muted-foreground">
              {item.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      <p className="mt-4 px-1 text-xs leading-relaxed text-muted-foreground">
        BallWise wspiera planowanie treningu, ale nie zastępuje trenera, lekarza, fizjoterapeuty ani
        dietetyka.
      </p>
    </main>
  );
}
