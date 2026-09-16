// Centralne teksty prawne i wersjonowane zgody. Dane administratora są
// konfiguracją wydania — nie wolno ich zgadywać ani ukrywać w kodzie.

export const LEGAL_VERSION = "2.2";

export const FUEL_PRECISION_CONSENT =
  "Wyrażam wyraźną zgodę na używanie wieku i opcjonalnej masy ciała wyłącznie do obliczania orientacyjnych zakresów paliwa przed treningiem. Fuel działa także bez tej zgody. Zgodę mogę wycofać w aplikacji, a masa ciała zostanie usunięta.";

const env = import.meta.env as Record<string, string | boolean | undefined>;

function publicEnv(name: string): string {
  const value = env[name];
  return typeof value === "string" ? value.trim() : "";
}

export const LEGAL_CONFIG = {
  administratorName: publicEnv("VITE_LEGAL_ADMIN_NAME"),
  businessAddress: publicEnv("VITE_LEGAL_BUSINESS_ADDRESS"),
  registryDetails: publicEnv("VITE_LEGAL_REGISTRY_DETAILS"),
  contactEmail: publicEnv("VITE_LEGAL_CONTACT_EMAIL"),
  accountRetention: publicEnv("VITE_LEGAL_ACCOUNT_RETENTION"),
  consentRetention: publicEnv("VITE_LEGAL_CONSENT_RETENTION"),
  backupRetention: publicEnv("VITE_LEGAL_BACKUP_RETENTION"),
  supabaseRegion: publicEnv("VITE_LEGAL_SUPABASE_REGION"),
  subscriptionPrice: publicEnv("VITE_LEGAL_SUBSCRIPTION_PRICE"),
  trialDescription: publicEnv("VITE_LEGAL_TRIAL_DESCRIPTION"),
};

const requiredLegalValues = [
  LEGAL_CONFIG.administratorName,
  LEGAL_CONFIG.businessAddress,
  LEGAL_CONFIG.registryDetails,
  LEGAL_CONFIG.contactEmail,
  LEGAL_CONFIG.accountRetention,
  LEGAL_CONFIG.consentRetention,
  LEGAL_CONFIG.backupRetention,
  LEGAL_CONFIG.supabaseRegion,
  LEGAL_CONFIG.subscriptionPrice,
  LEGAL_CONFIG.trialDescription,
];

export const LEGAL_CONFIGURATION_COMPLETE = requiredLegalValues.every(Boolean);
export const LEGAL_RELEASE_BLOCKED =
  publicEnv("VITE_RELEASE_MODE") === "production" && !LEGAL_CONFIGURATION_COMPLETE;

const administrator = LEGAL_CONFIG.administratorName || "[NAZWA ADMINISTRATORA]";
const address = LEGAL_CONFIG.businessAddress || "[ADRES ADMINISTRATORA]";
const registry = LEGAL_CONFIG.registryDetails || "[NIP / CEIDG / KRS]";
const contact = LEGAL_CONFIG.contactEmail || "[E-MAIL KONTAKTOWY]";
const accountRetention = LEGAL_CONFIG.accountRetention || "[RETENCJA KONTA I PROFILU]";
const consentRetention = LEGAL_CONFIG.consentRetention || "[RETENCJA DOWODÓW ZGÓD]";
const backupRetention = LEGAL_CONFIG.backupRetention || "[RETENCJA KOPII ZAPASOWYCH]";
const supabaseRegion = LEGAL_CONFIG.supabaseRegion || "[REGION SUPABASE]";
const subscriptionPrice = LEGAL_CONFIG.subscriptionPrice || "[CENA I OKRES SUBSKRYPCJI]";
const trialDescription = LEGAL_CONFIG.trialDescription || "[CZAS I WARUNKI OKRESU PRÓBNEGO]";

export const PLACEHOLDER_NOTICE = LEGAL_CONFIGURATION_COMPLETE
  ? ""
  : "WERSJA TESTOWA: publikacja wymaga pełnych danych administratora, retencji, regionu danych oraz warunków subskrypcji.";

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
      "Wyrażam wyraźną zgodę na przetwarzanie danych o gotowości i zdrowiu: snu, energii, zmęczenia, bolesności, stresu, motywacji, bólu oraz — jeśli sam je podam — alergii i nietolerancji żywnościowych. Dane służą wyłącznie personalizacji treningu i bezpieczeństwu Fuel. Brak zgody nie blokuje aplikacji; plan pozostanie ostrożny, a Fuel poprosi o każdorazowe potwierdzenie składników.",
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
Administratorem danych jest ${administrator}, adres: ${address}, dane rejestrowe: ${registry}. Kontakt w sprawach prywatności: ${contact}.

2. Wiek i właściciel konta
Spersonalizowane konto jest dostępne od 13 lat. Osoba poniżej 13 lat może korzystać wyłącznie z publicznego trybu demonstracyjnego, który nie zapisuje danych osobowych. Dla zawodnika w wieku 13–15 lat właścicielem konta, osobą akceptującą dokumenty i płatnikiem jest rodzic lub opiekun. Od 16 lat zawodnik może być właścicielem konta; do ukończenia 18 lat płatnikiem pozostaje osoba dorosła. Weryfikujemy e-mail właściciela konta. Przekazanie konta po ukończeniu 16 lat wymaga potwierdzenia nowego adresu e-mail i ponownego zaakceptowania aktualnych dokumentów.

3. Zakres danych
Przetwarzamy:
- dane konta: identyfikator, e-mail, imię właściciela i jego rolę;
- profil zawodnika: imię, data urodzenia, wiek wyliczony z daty urodzenia, pozycja, poziom, cel, kalendarz, sprzęt i dostępność;
- trening i wynik: plan, wykonanie sesji, czas, RPE, serie, notatki, testy i postęp;
- bieg: dystans, czas i średnie tempo; nie zapisujemy trasy GPS, współrzędnych ani splitów;
- po wyraźnej zgodzie zdrowotnej: sen, energia, zmęczenie, bolesność, stres, motywacja, ból oraz dobrowolnie podane alergie i nietolerancje żywnościowe;
- po osobnej zgodzie Fuel Precision: wiek i opcjonalna masa ciała;
- przy skanowaniu posiłku: zdjęcie wybrane przez użytkownika i kontekst najbliższej sesji przesyłane do jednorazowej analizy AI;
- przy dyktowaniu: dźwięk może zostać przetworzony przez usługę rozpoznawania mowy systemu lub przeglądarki. BallWise nie zapisuje nagrania;
- dane techniczne niezbędne do bezpieczeństwa i diagnostyki, jeżeli takie raportowanie jest aktywne w wydaniu produkcyjnym.

Nie sprzedajemy danych. Nie używamy danych treningowych, zdrowotnych, zdjęć ani głosu do reklam, śledzenia między aplikacjami lub profilowania marketingowego.

4. Cele i podstawy prawne
- utworzenie konta, plan, wykonanie treningów, synchronizacja i obsługa płatnej usługi: wykonanie umowy;
- bezpieczeństwo, zapobieganie nadużyciom i dochodzenie roszczeń: uzasadniony interes administratora, po przeprowadzeniu testu równowagi;
- dokumenty księgowe i obowiązki konsumenckie: obowiązek prawny;
- dane o gotowości, bólu, alergiach, nietolerancjach i masa ciała używana w Fuel Precision: wyraźna, dobrowolna zgoda;
- marketing elektroniczny: osobna zgoda.

5. Zgody zdrowotne
Brak zgody zdrowotnej nie blokuje konta ani podstawowego planu. Po jej wycofaniu usuwamy zapisane check-iny, wpisy bólu, trwały profil alergii i nietolerancji oraz zdrowotne pola w kopii odpowiedzi onboardingowych. Fuel może nadal działać po każdorazowym potwierdzeniu bezpieczeństwa składników. Wycofanie Fuel Precision usuwa masę ciała. Dowód udzielenia lub wycofania zgody przechowujemy oddzielnie przez okres wskazany niżej.

6. Automatyczne rekomendacje
BallWise analizuje profil, kalendarz, obciążenie i — tylko po zgodzie — gotowość, aby zaproponować plan i decyzję dnia. Rekomendacja nie wywołuje skutków prawnych ani podobnie istotnych skutków. Użytkownik może jej nie wykonać, zmienić dane lub usunąć konto. BallWise nie diagnozuje urazów ani chorób.

7. Odbiorcy, podmioty przetwarzające i transfery
- Supabase: uwierzytelnianie, baza i funkcje serwerowe; skonfigurowany region: ${supabaseRegion};
- OpenAI: jednorazowa analiza zdjęcia posiłku po osobnym działaniu użytkownika; żądanie ma parametr store:false. OpenAI nie używa danych API do treningu domyślnie, ale standardowe logi bezpieczeństwa mogą być przechowywane do 30 dni, chyba że administrator uzyskał krótszy tryb retencji;
- Apple: rozliczenie subskrypcji kupionej w App Store;
- dostawca hostingu i opcjonalny dostawca diagnostyki błędów, wyłącznie w zakresie niezbędnym do działania usługi;
- dostawca rozpoznawania mowy urządzenia lub przeglądarki, gdy użytkownik uruchomi dyktowanie.

Aktualna lista podmiotów, ich lokalizacje, podstawa transferu poza EOG oraz zastosowane zabezpieczenia muszą być publikowane razem z tą polityką. Jeżeli dane są przekazywane poza EOG, administrator stosuje właściwy mechanizm z rozdziału V RODO, np. decyzję stwierdzającą odpowiedni stopień ochrony albo standardowe klauzule umowne po ocenie transferu.

8. Retencja
- konto, profil i historia treningowa: ${accountRetention};
- dowody zgód i ich wycofania: ${consentRetention};
- zdjęcie posiłku i wynik skanu: BallWise nie zapisuje ich w profilu; obowiązuje retencja bezpieczeństwa dostawcy opisana w pkt 7;
- surowe nagranie głosu: BallWise go nie zapisuje;
- kopie zapasowe: ${backupRetention};
- dane wymagane przepisami, np. księgowe: przez okres wynikający z prawa.
Po upływie okresu dane są usuwane lub nieodwracalnie anonimizowane.

9. Prawa
Osoba, której dane dotyczą, lub uprawniony opiekun może żądać dostępu, kopii, sprostowania, usunięcia, ograniczenia, przeniesienia danych oraz wnieść sprzeciw wobec przetwarzania opartego na uzasadnionym interesie. Zgodę można wycofać bez wpływu na zgodność wcześniejszego przetwarzania. Dostępny jest eksport danych i usunięcie konta w aplikacji. Można złożyć skargę do Prezesa Urzędu Ochrony Danych Osobowych.

10. Obowiązkowość danych
E-mail, data urodzenia, podstawowy profil i harmonogram są potrzebne do utworzenia spersonalizowanego konta i wykonania umowy. Brak tych danych uniemożliwia konto, ale nie publiczne demo. Dane zdrowotne, masa ciała, zdjęcie posiłku, dyktowanie i marketing są dobrowolne; odmowa nie blokuje podstawowej aplikacji.

11. Bezpieczeństwo
Stosujemy kontrolę dostępu do danych użytkownika, szyfrowanie transmisji, rozdzielenie ról, wersjonowany dziennik zgód oraz mechanizmy usuwania konta. Szczegóły zabezpieczeń nie są publikowane w zakresie, który ułatwiałby obejście ochrony.

12. Usunięcie konta i subskrypcja
Funkcja „Usuń konto i dane” usuwa konto logowania i powiązane dane, których nie musimy zachować na podstawie prawa. Samo usunięcie aplikacji nie usuwa konta. Usunięcie konta nie musi automatycznie zakończyć subskrypcji rozliczanej przez Apple; subskrypcją zarządza się w ustawieniach Apple ID.

13. Kontakt
Pytania i żądania dotyczące danych: ${contact}.`;

export const TERMS = `Regulamin BallWise (wersja ${LEGAL_VERSION})

1. Usługodawca
Usługę BallWise świadczy ${administrator}, ${address}, dane rejestrowe: ${registry}, kontakt: ${contact}.

2. Charakter usługi
BallWise pomaga planować i realizować trening piłkarski oraz pokazuje rekomendację dnia. ${MEDICAL_DISCLAIMER}

3. Wiek i konto
Pełna aplikacja jest przeznaczona dla zawodników od 13 lat. Osoba poniżej 13 lat nie może utworzyć spersonalizowanego profilu. Dla zawodnika 13–15 konto tworzy i posiada rodzic lub opiekun. Zawodnik 16–17 może posiadać konto, ale płatności zatwierdza osoba dorosła. Od 18 lat użytkownik działa samodzielnie.

4. Bezpieczeństwo treningu
Użytkownik podaje prawdziwe informacje, zapewnia bezpieczne miejsce i sprzęt, respektuje decyzje trenera oraz przerywa ćwiczenie przy bólu, zawrotach głowy, duszności, osłabieniu lub innym niepokojącym objawie. Aplikacja nie zastępuje lekarza, fizjoterapeuty, dietetyka klinicznego, trenera ani opiekuna.

5. Konto
Właściciel konta odpowiada za prawidłowy e-mail i poufność hasła. Nie wolno udostępniać konta. Przekazanie konta zawodnikowi po ukończeniu 16 lat wymaga funkcji przekazania i potwierdzenia nowego e-maila.

6. Subskrypcja i okres próbny
Aktualna oferta: ${subscriptionPrice}. Okres próbny: ${trialDescription}. W aplikacji iOS zakup cyfrowej subskrypcji odbywa się przez Apple In-App Purchase. Subskrypcja odnawia się automatycznie, dopóki nie zostanie anulowana w ustawieniach Apple ID. Przed zakupem użytkownik widzi cenę, okres rozliczeniowy, zakres usługi i warunki próby. Należy udostępnić funkcje „Przywróć zakupy” i „Zarządzaj subskrypcją”.

7. Prawo konsumenckie i reklamacje
Prawa konsumenta, zasady odstąpienia dotyczące usługi lub treści cyfrowej, zgodność usługi cyfrowej z umową oraz sposób składania reklamacji wynikają z bezwzględnie obowiązujących przepisów. Reklamacje można składać na ${contact}. Odpowiedź zostanie udzielona w terminie wymaganym prawem. Zasady zwrotów za zakup przez App Store podlegają również procedurom Apple.

8. Dane i usunięcie konta
Zasady przetwarzania danych opisuje Polityka prywatności. Użytkownik może pobrać dane, wycofać zgody i usunąć konto w aplikacji. Usunięcie konta nie zastępuje anulowania subskrypcji Apple.

9. Niedozwolone działania
Nie wolno obchodzić zabezpieczeń, zakłócać usługi, używać cudzych danych ani przedstawiać rekomendacji BallWise jako diagnozy, leczenia lub gwarancji wyniku sportowego.

10. Dostępność, zmiany i odpowiedzialność
Usługa może być czasowo niedostępna z powodu utrzymania lub awarii. Istotne zmiany dokumentów wymagają pokazania nowej wersji i — gdy jest to potrzebne — ponownej akceptacji. Regulamin nie ogranicza praw konsumenta ani odpowiedzialności, której nie można wyłączyć prawem.

11. Kontakt
Kontakt z usługodawcą: ${contact}. Bieżąca wersja dokumentu: ${LEGAL_VERSION}.`;
