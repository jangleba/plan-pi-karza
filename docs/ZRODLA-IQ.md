# Źródła i proponowane reguły: IQ (kolejne scenariusze)

Wyniki wyszukiwania są głównie jakościowe. Nie znalazłem gotowych reguł decyzyjnych ani wartości xG dla typów dośrodkowań, więc poniższe reguły to MOJE PROPOZYCJE oparte na tych zasadach, do przeglądu przez użytkownika/trenera. Liczby progowe (metry, prędkości) są moje.

## Dośrodkowanie
Ze źródeł:
- Dośrodkowania rzadko kończą się golem: 3,2% z gry (MŚ 2014, 1332 dośrodkowania), 2,1% (MŚ 2018, 949). https://lida.sport-iat.de/twm/Record/4063607?lng=en, https://vuir.vu.edu.au/46384/
- Im bliżej bramki, tym skuteczniej: https://www.americansocceranalysis.com/home/2021/3/11/where-goals-come-from-putting-balls-into-the-box
- Obrona częściej zawodzi przy dośrodkowaniach z półprzestrzeni niż z bocznych stref: https://www.jhse.es/index.php/jhse/article/download/defensive-adaptations-crosses-elite-football/289/18650
- Stats Perform: najskuteczniejszy typ to podanie „po prostej" tuż za linię środka (nie więcej niż 5 m); szczegóły liczbowe niedostępne w wynikach: https://www.statsperform.com/resource/the-art-of-crossing
Proponowane reguły oceny (moje): dośrodkuj, gdy w polu karnym jest wolny adresat w strefie centralnej; im bliżej linii końcowej/półprzestrzeń, tym lepiej; dośrodkowanie na zatłoczone pole przy zablokowanym torze – słabe; alternatywa: odegranie wzdłuż pola karnego.

## 1 na 1 i kiwnięcie
Ze źródeł:
- Sukces dryblingu: przewaga prędkości nad obrońcą i mniejszy nacisk obrony zwiększają szansę; dalej od linii bocznej wyższa szansa: https://arxiv.org/pdf/2506.22503
- Elitarne 1 na 1: minimalny dystans atakujący–obrońca, nacisk na atakującego, zmiany kierunku: https://research.rug.nl/en/publications/dribble-like-robben-what-determines-successfulness-in-1-vs-1-acti/
- Poniżej ok. 4 m różnica prędkości względnej steruje przejściem między fazami: https://link.springer.com/10.1038/s41598-023-45914-6
Proponowane reguły (moje): kiwaj, gdy masz przewagę prędkości i miejsce za obrońcą; nie przy linii bocznej; po zmianie kierunku wybór strony przeciwnej do ciężaru obrońcy; przy dużym nacisku lepsze odegranie.
Brak źródła z regułą „drybling vs podanie" opartą o przestrzeń za obrońcą.

## 11 na 11 z pressingiem
Ze źródeł:
- Kombinacja „do przodu, potem wstecz do trzeciego" wychodziła spod pressingu ok. 53% vs 44% dla krótkie podanie + zmiana strony (dane StatsBomb Open Data, autor zastrzega, że dane są stare): https://cambiodejuegoenglish.beehiiv.com/p/up-back-3rd-player-combos-the-key-to-escaping-pressure
- Podania łamiące linie pod presją otwierają kombinacje trzeciego: https://skillcorner.com/articles/game-intelligence-applied-2-centre-backs-playing-out-from-the-back
- Ryzykowne podanie wstecz blisko własnej bramki bywa gorsze niż wybicie na aut: https://statsbomb.com/wp-content/uploads/2024/09/Lorenzo-Cascioli.pdf
Proponowane reguły (moje): preferuj odegranie do wolnego trzeciego zawodnika; unikaj podania wstecz w strefie własnej bramki przy pressingu; łamanie linii tylko gdy tor wolny.

## Strzał po dograniu
Źródło ogólne: szansa strzału zależy od odległości i kąta (modele xG). Konkretnych wartości z badań nie wyszukałem; w prototypie użyty jest prosty model wykładniczy (src/engine/iq.ts), mój.
