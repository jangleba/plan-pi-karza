import { Button } from "@/components/ui/button";

type Props = { step: number; onNext: () => void; onClose: () => void };
const steps = [
  {
    title: "Zaplanuj ruch",
    text: "Wybierz Ruch i przeciągnij zawodnika w przestrzeń. Numer przy linii oznacza kolejność.",
  },
  {
    title: "Zaplanuj podanie",
    text: "Wybierz Podanie. Przeciągnij piłkę do partnera albo w wolną przestrzeń.",
  },
  {
    title: "Przesuń całą linię",
    text: "Wybierz Grupa i przeciągnij zawodnika. Cała linia przesunie się razem. Następnie wybierz cel planu.",
  },
];
export function Onboarding({ step, onNext, onClose }: Props) {
  const current = steps[step];
  return (
    <div className="bwiq-tutorial">
      <p className="text-sm text-muted-foreground">Instrukcja {step + 1}/3</p>
      <h2>{current.title}</h2>
      <p>{current.text}</p>
      <div className="bwiq-actions">
        <Button variant="ghost" className="text-muted-foreground" onClick={onClose}>
          Pomiń
        </Button>
        <Button className="bwiq-primary" onClick={step === 2 ? onClose : onNext}>
          {step === 2 ? "Gotowe" : "Dalej"}
        </Button>
      </div>
    </div>
  );
}
