// Centralized legal / RODO (GDPR) content and consent definitions.
// IMPORTANT: placeholders in square brackets MUST be completed before production.

export const LEGAL_VERSION = "1.1";

export const PLACEHOLDER_NOTICE =
  "UWAGA: Przed publikacją produkcyjną należy uzupełnić pola w nawiasach kwadratowych ([...]) prawdziwymi danymi administratora.";

export interface ConsentDef {
  type: string;
  required: boolean;
  title: string;
  text: string;
}

export const CONSENTS: ConsentDef[] = [
  {
    type: "terms",
    required: true,
    title: "Akceptacja Regulaminu",
    text: "Akceptuję Regulamin korzystania z aplikacji Loadwise.",
  },
  {
    type: "privacy",
    required: true,
    title: "Polityka prywatności",
    text: "Zapoznałem(-am) się z Polityką prywatności i przyjmuję ją do wiadomości.",
  },
  {
    type: "health_data",
    required: true,
    title: "Przetwarzanie danych o treningu i zdrowiu",
    text: "Wyrażam wyraźną zgodę na przetwarzanie danych dotyczących mojego treningu i zdrowia (ból, status urazu, zmęczenie, gotowość, bolesność mięśni, obciążenie treningowe) w celu generowania spersonalizowanych decyzji treningowych.",
  },
  {
    type: "marketing",
    required: false,
    title: "Zgoda marketingowa (opcjonalna)",
    text: "Wyrażam zgodę na otrzymywanie informacji marketingowych dotyczących Loadwise. Tę zgodę mogę wycofać w dowolnym momencie.",
  },
];

export const MEDICAL_DISCLAIMER =
  "Loadwise nie jest narzędziem medycznym. Aplikacja nie stawia diagnoz, nie leczy urazów i nie zastępuje konsultacji z lekarzem ani fizjoterapeutą. W razie bólu lub niepokojących objawów przerwij trening i skontaktuj się ze specjalistą.";

export const PRIVACY_POLICY = `Polityka prywatności Loadwise (wersja ${LEGAL_VERSION})

${PLACEHOLDER_NOTICE}

1. Administrator danych
Administratorem danych osobowych jest [ADMINISTRATOR_NAME], z siedzibą pod adresem [BUSINESS_ADDRESS]. Kontakt: [CONTACT_EMAIL].

2. Jakie dane przetwarzamy
- dane konta: adres e-mail, imię,
- dane profilu zawodnika: wiek, pozycja, poziom, cel, klub, sprzęt,
- dane dotyczące treningu i zdrowia: gotowość, zmęczenie, ból, status urazu, bolesność mięśni, obciążenie treningowe.
- wyniki Vision Lab: rodzaj testu, FPS, numery zaznaczonych klatek, obliczone czasy, wysokości, prędkości i informacje o jakości pomiaru.

Film Vision Lab wybrany z galerii albo nagrany w aplikacji jest domyślnie przetwarzany lokalnie na urządzeniu. Nie wysyłamy go automatycznie do chmury. Tymczasowa kopia może pozostać w pamięci tej przeglądarki maksymalnie 24 godziny, aby umożliwić dokończenie rozpoczętej analizy, i jest usuwana po zapisaniu wyniku albo na żądanie usunięcia danych.

3. Cel i podstawa prawna
Dane przetwarzamy w celu świadczenia usługi (art. 6 ust. 1 lit. b RODO) oraz na podstawie Twojej wyraźnej zgody w odniesieniu do danych o zdrowiu (art. 9 ust. 2 lit. a RODO). Wynik Vision Lab służy wyłącznie do informacji treningowej i nie stanowi diagnozy medycznej.

4. Okres przechowywania
Wyniki pomiarów i pozostałe dane konta przechowujemy przez okres [DATA_RETENTION_PERIOD] lub do momentu usunięcia konta. Lokalny film roboczy Vision Lab wygasa po 24 godzinach i jest usuwany wcześniej po zapisaniu wyniku. Jeżeli użytkownik świadomie skorzysta z funkcji recenzji filmu przez trenera, zasady i okres przechowywania tego filmu muszą zostać podane osobno przed wysłaniem.

5. Podmiot przetwarzający
Dane konta i wyniki przechowywane są w infrastrukturze chmurowej: [SUPABASE_PROCESSOR_INFO]. Film przetwarzany lokalnie nie jest przekazywany temu podmiotowi.

6. Twoje prawa
Masz prawo dostępu do danych, ich sprostowania, usunięcia, ograniczenia przetwarzania, przenoszenia oraz wycofania zgody w dowolnym momencie. Wycofanie zgody na przetwarzanie danych o zdrowiu może spowodować, że generowanie planów treningowych przestanie działać.

7. Kontakt
W sprawach dotyczących danych skontaktuj się: [CONTACT_EMAIL].`;

export const TERMS = `Regulamin Loadwise (wersja ${LEGAL_VERSION})

${PLACEHOLDER_NOTICE}

1. Postanowienia ogólne
Loadwise to aplikacja wspierająca decyzje treningowe w piłce nożnej dla zawodników od 13 roku życia. Usługę świadczy [ADMINISTRATOR_NAME], [BUSINESS_ADDRESS], kontakt [CONTACT_EMAIL].

2. Charakter usługi
${MEDICAL_DISCLAIMER}

3. Konto użytkownika
Do korzystania z pełnej funkcjonalności wymagana jest rejestracja. Osoby w wieku 13–17 lat potrzebują zgody rodzica lub opiekuna.

4. Odpowiedzialność
Korzystasz z aplikacji na własną odpowiedzialność. Zawsze dostosuj obciążenia do swojego stanu zdrowia i przerwij trening w razie bólu.

5. Zmiany
Regulamin może być aktualizowany. Bieżąca wersja: ${LEGAL_VERSION}.`;
