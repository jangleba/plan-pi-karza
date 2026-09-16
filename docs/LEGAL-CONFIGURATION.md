# Konfiguracja prawna wydania

W produkcji ustaw wszystkie zmienne z `.env.legal.example`. Kod celowo blokuje wydanie produkcyjne, jeśli którejkolwiek brakuje.

Nie commituj danych tajnych. Dane administratora i treści informacyjne nie są sekretami, ale powinny być utrzymywane jako kontrolowana konfiguracja wydania.

## Decyzje wymagane przed uzupełnieniem

- kto jest administratorem i sprzedawcą usługi;
- adres oraz dane CEIDG/KRS/NIP;
- e-mail do praw osób i reklamacji;
- konkretny harmonogram retencji per kategoria;
- region projektu Supabase;
- pełna lista podmiotów przetwarzających i podstawa transferu poza EOG;
- cena i warunki trzydniowego trialu;
- czy skaner OpenAI działa na standardowej retencji do 30 dni, czy projekt uzyskał ZDR/MAM;
- czy raportowanie błędów Lovable jest aktywne w produkcji.

## Zasada

Nie wpisuj ogólnych zdań typu „tak długo, jak potrzebne”, jeśli można podać kryterium lub termin. Polityka, App Privacy w App Store Connect i rzeczywisty kod muszą opisywać ten sam stan.

