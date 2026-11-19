import { CURRENT, OPERATOR_LABEL, type DocKind, type OperatorField } from "./config";

/**
 * Treści dokumentów dostępnych PRZED zawarciem umowy. To SZKICE do zatwierdzenia prawnego (status w config.ts) – nie są
 * przedstawiane użytkownikowi jako zatwierdzone. Braki danych operatora wyświetlają się jako „[do uzupełnienia: …]”.
 * Opisy przetwarzania odpowiadają faktycznemu kodowi (docs/MAPA-DANYCH.md); kwalifikację prawną podstaw przetwarzania ustala operator.
 */
export interface DocSection { h: string; p: string[] }
export interface DocText { title: string; sections: DocSection[] }

export const op = (f: OperatorField): string => CURRENT.operator[f]?.trim() || `[do uzupełnienia: ${OPERATOR_LABEL[f]}]`;
const contact = () => `${op("name")}, ${op("address")}, e-mail: ${op("email")}`;

export function legalText(kind: DocKind): DocText {
  if (kind === "terms") return {
    title: "Regulamin (szkic)",
    sections: [
      { h: "1. Operator i kontakt", p: [`Usługę świadczy: ${contact()}.`, `Rejestr: ${op("registry")}, NIP: ${op("taxId")}.`] },
      { h: "2. Czym jest Ballwise", p: ["Aplikacja sportowa dla osób, które ukończyły 16 lat: plan treningowy, orientacyjny check-in gotowości, testy i pomiary (Lab), symulacja decyzji (IQ), propozycje żywieniowe (Fuel), krótkie lekcje angielskiego piłkarskiego (Piłkarski angielski) oraz postęp.", "Treści mają charakter informacyjny i szkoleniowy. Nie są poradą lekarską, fizjoterapeutyczną ani dietetyczną i nie gwarantują wyników ani bezpieczeństwa wysiłku."] },
      { h: "3. Wiek", p: ["Z aplikacji mogą korzystać wyłącznie osoby, które ukończyły 16 lat. Wiek jest oświadczeniem użytkownika (nie weryfikujemy tożsamości i nie zbieramy skanów dokumentów).", "Osoby w wieku 16–17 lat mogą korzystać z funkcji bezpłatnych na zasadach określonych w konfiguracji operatora. Zawarcie płatnej umowy przez osobę niepełnoletnią wymaga potwierdzenia przez przedstawiciela ustawowego albo zawarcia umowy przez pełnoletniego nabywcę – szczegóły i metoda do zatwierdzenia przez operatora."] },
      { h: "4. Konto i tryb gościa", p: ["Aplikacja działa bez konta (tryb gościa, dane tylko na urządzeniu). Konto umożliwia synchronizację wybranych danych między urządzeniami. Dane gościa i dane konta są rozdzielone; przeniesienie danych gościa do konta jest świadomą czynnością użytkownika."] },
      { h: "5. Obowiązki użytkownika", p: ["Użytkownik dostosowuje wysiłek do swoich możliwości i stanu zdrowia, przerywa go przy bólu lub złym samopoczuciu i stosuje Zasady bezpiecznego korzystania. Postanowienie to nie wyłącza ani nie ogranicza odpowiedzialności operatora ani praw użytkownika wynikających z przepisów prawa (w tym praw konsumenta).", "Użytkownik sam decyduje o wysłaniu wiadomości do klubu i odpowiada za jej treść; aplikacja niczego nie wysyła w jego imieniu."] },
      { h: "6. Płatności", p: [`Płatne funkcje nie są obecnie dostępne. Cena, okres rozliczeniowy, odnowienie, rezygnacja, reklamacje i informacja o odstąpieniu zostaną podane przed zawarciem umowy płatnej: [do uzupełnienia po ustaleniu modelu sprzedaży i integracji płatniczej].`] },
      { h: "7. Odpowiedzialność", p: ["Regulamin nie wyłącza ani nie ogranicza odpowiedzialności operatora w zakresie, w jakim przepisy prawa tego zabraniają, ani praw konsumenta."] },
      { h: "8. Usunięcie konta i zakończenie korzystania", p: ["Użytkownik może w każdej chwili wylogować się, usunąć dane lokalne, pobrać swoje dane i usunąć konto w ustawieniach aplikacji. Usunięcie konta jest czynnością odrębną od wypowiedzenia ewentualnej subskrypcji i od ustawowego odstąpienia od umowy."] },
      { h: "9. Zmiany i wersje", p: ["Zmiana warunków wymaga ponownej akceptacji nowej wersji. Wersja tego dokumentu jest zapisywana razem z oświadczeniem użytkownika."] },
    ],
  };
  if (kind === "privacy") return {
    title: "Informacja o prywatności (szkic)",
    sections: [
      { h: "1. Administrator i kontakt", p: [`${contact()}. W sprawie realizacji praw osób: ${op("email")}.`] },
      { h: "2. Jakie dane przetwarzamy", p: ["Na urządzeniu (tryb gościa lub konto): profil treningowy (imię, pozycja, masa ciała, staż, dni treningowe i meczowe, cel), wiek, data urodzenia lub rocznik (tylko lokalnie), check-in (sen, samopoczucie), historia treningów i ciężarów, wyniki testów, dane Fuel (posiłki, woda, ulubione), próby IQ, zapisy tras biegowych oraz postęp nauki angielskiego (wybrany poziom trudności, ukończone lekcje, opanowanie zwrotów, terminy powtórek, miejsce przerwania lekcji) i wybór głosu syntezy mowy.", "W chmurze (tylko po założeniu konta): kontrakt profilu bez daty urodzenia, deklarowana grupa wieku (16–17 / 18+), dowody akceptacji i zgód, ewentualne potwierdzenie opiekuna (status, wersje, czasy). Dane o samopoczuciu, masie i wynikach synchronizują się wyłącznie po odrębnej zgodzie, którą można wycofać. Postęp nauki angielskiego (dane edukacyjne, nie zdrowotne) synchronizuje się z kontem po zalogowaniu; nie łączymy go z gotowością fizyczną, oceną talentu ani szansami na karierę."] },
      { h: "3. Cele i podstawy", p: ["Świadczenie usługi (plan, nauka języka, synchronizacja konta), bezpieczeństwo i dowody oświadczeń, realizacja praw osób, ewentualna sprzedaż.", "Podstawy prawne poszczególnych operacji: [do zatwierdzenia prawnego]. Zgoda dotyczy wyłącznie synchronizacji danych zdrowotnych i samopoczucia z chmurą; informacja o prywatności nie jest zgodą na przetwarzanie."] },
      { h: "4. Odbiorcy i usługi zewnętrzne", p: ["Dostawca bazy i uwierzytelniania (Supabase) oraz hosting aplikacji – dane konta. Wyszukiwanie produktów spożywczych (Open Food Facts) przez serwer aplikacji – wpisywane hasło jest wysyłane do tej usługi. Kafelki map w module biegowym (Mapbox), jeśli skonfigurowano – adres IP i obszar mapy. Rozpoznawanie mowy w przeglądarce może przesyłać dźwięk do usługi dostawcy przeglądarki – nie obiecujemy przetwarzania wyłącznie lokalnego. Model detekcji pozy ładowany ze zewnętrznych serwerów (jsDelivr, Google Cloud Storage) – analiza nagrań odbywa się w przeglądarce.", "Lekcje angielskiego korzystają z syntezy mowy Twojego urządzenia lub przeglądarki (odtwarzanie tekstu): nie nagrywamy mikrofonu. Zależnie od przeglądarki i wybranego głosu synteza może korzystać z usługi jej dostawcy, więc nie obiecujemy przetwarzania wyłącznie lokalnego; cała treść lekcji jest dostępna także jako tekst."] },
      { h: "5. Okres przechowywania", p: ["Dane lokalne – do ich usunięcia w ustawieniach lub odinstalowania. Dane konta – do usunięcia konta; dziennik realizacji usunięcia zawiera tylko pseudonimowy skrót identyfikatora. Kopie zapasowe dostawcy mogą istnieć przez ograniczony czas: [okres do ustalenia po konfiguracji dostawcy]. Nie obiecujemy natychmiastowego usunięcia każdej kopii zapasowej."] },
      { h: "6. Prawa osób", p: [`Dostęp i pobranie danych, usunięcie, sprostowanie, sprzeciw, ograniczenie, wycofanie zgody – w ustawieniach aplikacji lub pod adresem ${op("email")}. Przysługuje skarga do organu nadzorczego (Prezes UODO).`] },
      { h: "7. Wiek i dzieci", p: ["Aplikacja jest przeznaczona dla osób, które ukończyły 16 lat. Nie zbieramy skanów dokumentów. Zgoda opiekuna na umowę nie jest zgodą na dowolne przetwarzanie danych."] },
      { h: "8. Zautomatyzowane podejmowanie decyzji", p: ["Plan, wynik gotowości i propozycje obciążeń są wyliczane regułami i mają charakter orientacyjny; nie wywołują skutków prawnych wobec użytkownika."] },
    ],
  };
  return {
    title: "Zasady bezpiecznego korzystania (szkic)",
    sections: [
      { h: "Zanim zaczniesz", p: ["Ćwicz tylko wtedy, gdy czujesz się zdrowy. Wynik gotowości w aplikacji jest orientacyjny – nie jest oceną zdolności do wysiłku i niczego nie gwarantuje.", "Jeśli masz choroby, dolegliwości lub wątpliwości co do swojego zdrowia, skonsultuj się z lekarzem. Aplikacja nie wymaga od Ciebie wywiadu medycznego i nie zbiera diagnoz."] },
      { h: "W trakcie", p: ["Rozgrzej się. Przerwij ćwiczenie i odpocznij przy bólu (zwłaszcza w stawie, klatce piersiowej, głowie), zawrotach głowy, duszności lub nietypowym osłabieniu.", "Technika ma pierwszeństwo przed ciężarem i tempem. Ciężar, liczba serii i powtórzeń to propozycja – możesz zostać przy ciężarze, go obniżyć, zamienić ćwiczenie lub pominąć sesję.", "Ćwiczenia siłowe i testy skoków/sprintu wykonuj w miejscu o bezpiecznym podłożu i, gdy to możliwe, z osobą towarzyszącą. Testy maksymalne to Twoja świadoma decyzja."] },
      { h: "Po wysiłku", p: ["Nawadniaj się i zjedz posiłek. Propozycje żywieniowe są orientacyjne i nie uwzględniają alergii ani chorób, o ile ich nie podasz – sprawdzaj skład produktów."] },
      { h: "Osoby 16–17 lat", p: ["Dobieraj obciążenia ostrożnie i uzgadniaj plan z trenerem lub opiekunem. Treści aplikacji dla tej grupy wymagają przeglądu specjalisty (patrz docs/DO-PRZEGLADU-SPECJALISTY.md) – do tego czasu traktuj je jako propozycje ogólne."] },
    ],
  };
}
