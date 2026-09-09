// Centralne teksty prawne i wersjonowane zgody. Dane administratora są
// konfiguracją wydania — nie wolno ich zgadywać ani ukrywać w kodzie.

export const LEGAL_VERSION = "2.0";

const env = import.meta.env as Record<string, string | boolean | undefined>;

function publicEnv(name: string): string {
  const value = env[name];
  return typeof value === "string" ? value.trim() : "";
}

export const LEGAL_CONFIG = {
  administratorName: publicEnv("VITE_LEGAL_ADMIN_NAME"),
  businessAddress: publicEnv("VITE_LEGAL_BUSINESS_ADDRESS"),
  contactEmail: publicEnv("VITE_LEGAL_CONTACT_EMAIL"),
  retentionPeriod: publicEnv("VITE_LEGAL_RETENTION_PERIOD"),
};

export const LEGAL_CONFIGURATION_COMPLETE = Object.values(LEGAL_CONFIG).every(Boolean);

const administrator = LEGAL_CONFIG.administratorName || "[NAZWA ADMINISTRATORA]";
const address = LEGAL_CONFIG.businessAddress || "[ADRES ADMINISTRATORA]";
const contact = LEGAL_CONFIG.contactEmail || "[E-MAIL KONTAKTOWY]";
const retention = LEGAL_CONFIG.retentionPeriod || "[OKRES PRZECHOWYWANIA]";

export const PLACEHOLDER_NOTICE = LEGAL_CONFIGURATION_COMPLETE
  ? ""
  : "WERSJA TESTOWA: przed publikacją trzeba uzupełnić nazwę i adres administratora, e-mail kontaktowy oraz okres przechowywania danych.";

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
    text: "Akceptuję Regulamin korzystania z aplikacji BallWise.",
  },
  {
    type: "privacy",
    required: true,
    title: "Polityka prywatności",
    text: "Potwierdzam zapoznanie się z Polityką prywatności BallWise.",
  },
  {
    type: "health_data",
    required: false,
    title: "Personalizacja na podstawie danych o zdrowiu (opcjonalna)",
    text:
      "Wyrażam wyraźną zgodę na przetwarzanie odpowiedzi o śnie, energii, zmęczeniu nóg i bólu w celu dostosowania decyzji treningowej. Brak zgody nie blokuje aplikacji — plan pozostanie ostrożny i nie będzie korzystał z tych danych.",
  },
  {
    type: "marketing",
    required: false,
    title: "Informacje marketingowe (opcjonalne)",
    text:
      "Chcę otrzymywać informacje marketingowe dotyczące BallWise. Zgodę mogę wycofać w dowolnym momencie.",
  },
];

export const MEDICAL_DISCLAIMER =
  "BallWise jest aplikacją treningową, a nie wyrobem ani usługą medyczną. Nie diagnozuje, nie leczy i nie prowadzi rehabilitacji. Ból albo niepokojący objaw oznacza przerwanie ćwiczenia i kontakt z rodzicem lub opiekunem oraz odpowiednim specjalistą.";

export const PRIVACY_POLICY = `Polityka prywatności BallWise (wersja ${LEGAL_VERSION})

1. Administrator i kontakt
Administratorem danych jest ${administrator}, adres: ${address}. Kontakt w sprawach prywatności: ${contact}.

2. Wiek i właściciel konta
Spersonalizowane konto jest dostępne od 13 lat. Osoba poniżej 13 lat może korzystać wyłącznie z publicznego trybu demonstracyjnego, który nie zapisuje danych osobowych. Dla zawodnika w wieku 13–15 lat właścicielem konta, osobą akceptującą dokumenty i płatnikiem jest rodzic lub opiekun. Od 16 lat zawodnik może być właścicielem konta; do ukończenia 18 lat płatnikiem pozostaje osoba dorosła. Przekazanie istniejącego konta po ukończeniu 16 lat wymaga osobnego potwierdzenia nowego adresu e-mail i ponownego potwierdzenia dokumentów.

3. Jakie dane przetwarzamy
- dane właściciela konta: e-mail, imię oraz rola właściciela,
- dane profilu zawodnika: imię, data urodzenia, pozycja, poziom, cel, kalendarz treningów i dostępny sprzęt,
- wyniki treningowe: realizacja sesji, czas, RPE i notatki,
- dla biegu wyłącznie wynik: dystans, czas i średnie tempo; trasa GPS, współrzędne, splity i odcinki nie są wysyłane do bazy,
- po osobnej zgodzie: odpowiedzi o śnie, energii, zmęczeniu nóg i bólu.
Nie sprzedajemy danych i nie używamy danych treningowych ani zdrowotnych do reklam lub profilowania marketingowego.

4. Cele i podstawy
Dane konta i planu są potrzebne do wykonania umowy i działania aplikacji. Dane o gotowości lub bólu przetwarzamy wyłącznie po wyraźnej, dobrowolnej zgodzie. Zgoda marketingowa jest zawsze oddzielna i domyślnie wyłączona. Rejestrujemy wersję, czas, zakres i osobę składającą zgodę, aby móc ją wykazać.

5. Brak zgody zdrowotnej
Odmowa albo wycofanie zgody dotyczącej danych o zdrowiu nie blokuje konta. BallWise nie zapisuje wtedy nowych odpowiedzi gotowości, usuwa dotychczasowe logi gotowości i bólu oraz stosuje konserwatywną decyzję treningową bez tej personalizacji.

6. Automatyczne rekomendacje
Aplikacja analizuje profil, kalendarz i — jeśli wyrażono zgodę — gotowość, aby zaproponować decyzję dnia i plan. Jest to rekomendacja treningowa bez skutków prawnych. Użytkownik może jej nie wykonać, zmienić dane albo usunąć konto.

7. Odbiorcy i infrastruktura
Dane są przechowywane u dostawcy infrastruktury Supabase działającego jako podmiot przetwarzający. Dostęp mają wyłącznie upoważnione osoby i dostawcy niezbędni do utrzymania usługi. Aktualna lista podmiotów i informacje o transferach danych muszą być udostępnione przy wydaniu produkcyjnym.

8. Czas przechowywania
Dane konta przechowujemy przez ${retention} albo do skutecznego usunięcia konta, z wyjątkiem danych wymaganych dłużej przez prawo. Wycofane zgody pozostają w dzienniku tylko tak długo, jak jest to niezbędne do wykazania zgodności.

9. Prawa użytkownika i opiekuna
Możesz uzyskać dostęp do danych, pobrać je, poprawić, ograniczyć przetwarzanie, wycofać zgodę i usunąć konto bezpośrednio w aplikacji. Opiekun może wykonywać te prawa wobec profilu dziecka, którego konto posiada. Możesz również złożyć skargę do Prezesa Urzędu Ochrony Danych Osobowych.

10. Usunięcie konta
Opcja „Usuń konto i dane” usuwa konto logowania i powiązane dane. Jest nieodwracalna. Samo usunięcie aplikacji z telefonu nie usuwa konta.

11. Kontakt
Pytania oraz żądania dotyczące danych: ${contact}.`;

export const TERMS = `Regulamin BallWise (wersja ${LEGAL_VERSION})

1. Usługodawca
Usługę BallWise świadczy ${administrator}, ${address}, kontakt: ${contact}.

2. Charakter usługi
BallWise pomaga układać i realizować trening piłkarski oraz pokazuje rekomendację dnia z uwzględnieniem tygodniowego obciążenia. ${MEDICAL_DISCLAIMER}

3. Wiek i konto
Pełna aplikacja jest przeznaczona dla zawodników od 13 lat. Osoba poniżej 13 lat nie może utworzyć spersonalizowanego profilu. Dla zawodnika 13–15 konto tworzy i posiada rodzic lub opiekun, który akceptuje dokumenty w swoim imieniu i w zakresie profilu dziecka. Zawodnik 16–17 może posiadać konto, ale ewentualne płatności zatwierdza osoba dorosła. Od 18 lat użytkownik działa samodzielnie.

4. Bezpieczeństwo treningu
Użytkownik podaje prawdziwe informacje, nie ćwiczy mimo bólu i przestrzega ograniczeń otoczenia, sprzętu oraz własnego trenera. Aplikacja może zmniejszyć obciążenie lub zatrzymać trening, ale nie zastępuje oceny lekarza, fizjoterapeuty, trenera ani opiekuna.

5. Konto i bezpieczeństwo dostępu
Właściciel konta odpowiada za poufność hasła i prawidłowy adres e-mail. Nie wolno udostępniać konta osobom trzecim. Przekazanie konta zawodnikowi po ukończeniu 16 lat odbywa się przez funkcję przekazania i potwierdzenie nowego e-maila.

6. Dane oraz usunięcie konta
Zasady przetwarzania danych opisuje Polityka prywatności. Użytkownik może pobrać dane i nieodwracalnie usunąć konto w aplikacji.

7. Niedozwolone działania
Nie wolno obchodzić zabezpieczeń, zakłócać działania usługi, wykorzystywać cudzych danych ani przedstawiać rekomendacji BallWise jako diagnozy lub leczenia.

8. Dostępność i zmiany
Usługa może być czasowo niedostępna z powodu utrzymania lub awarii. Istotne zmiany dokumentów wymagają pokazania nowej wersji i, gdy jest to konieczne, ponownej akceptacji.

9. Kontakt
Kontakt z usługodawcą: ${contact}. Bieżąca wersja dokumentu: ${LEGAL_VERSION}.`;
