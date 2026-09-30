import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
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
      "Potwierdź, że dzisiejszy plan jest aktualny, albo wybierz zmianę. Check-in nie wymaga danych o zdrowiu. Po potwierdzeniu zobaczysz trening dopasowany do planu dnia.",
  },
  {
    question: "Co zrobić, gdy czuję ból?",
    answer:
      "Nie wykonuj ruchu, który nasila ból. Jeśli korzystasz z opcjonalnej personalizacji zdrowotnej, możesz zgłosić ból w profilu lub po sesji. BallWise może ograniczyć obciążenie, ale nie diagnozuje urazów. Przy ostrym, narastającym lub utrzymującym się bólu przerwij trening i skontaktuj się ze specjalistą.",
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
    <section className="bw-reading-page bw-page-content bw-stack">
      <Button type="button" variant="ghost" onClick={goBack} className="justify-self-start">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Wstecz
      </Button>

      <h1 className="bw-page-title">Pomoc i FAQ</h1>

      <Accordion type="single" collapsible className="space-y-3">
        {FAQ_ITEMS.map((item, index) => (
          <AccordionItem key={item.question} value={`item-${index}`}>
            <AccordionTrigger className="min-h-12 py-3 text-left text-base leading-6 hover:no-underline">
              {item.question}
            </AccordionTrigger>
            <AccordionContent className="pb-4 text-base leading-6 text-muted-foreground">
              {item.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
