# Dane prawne wymagane przed publikacją

Kod nie może sam ustalić, kto formalnie świadczy usługę. Przed wysłaniem
aplikacji do recenzji uzupełnij w środowisku produkcyjnym:

```text
VITE_LEGAL_ADMIN_NAME=pełna nazwa osoby lub firmy
VITE_LEGAL_BUSINESS_ADDRESS=pełny adres
VITE_LEGAL_CONTACT_EMAIL=adres do spraw konta i prywatności
VITE_LEGAL_RETENTION_PERIOD=konkretny okres, np. „czas trwania konta i 30 dni kopii bezpieczeństwa”
VITE_RELEASE_MODE=production
```

Są to dane publiczne wyświetlane w Regulaminie i Polityce prywatności — nie są
sekretami. W trybie testowym brak danych pokazuje oznaczenie „wersja testowa”.
W trybie produkcyjnym aplikacja nie uruchomi się, dopóki wszystkie pola nie będą
uzupełnione.

Dokumenty w repozytorium są praktycznym szkieletem produktu, nie indywidualną
opinią prawną. Przed płatnym, szerokim wydaniem warto sprawdzić m.in. dane firmy,
podatki, płatności, listę podmiotów przetwarzających i rzeczywisty region bazy.
