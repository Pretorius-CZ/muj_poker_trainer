# Vize a principy

## Problém

Koukat na poker a rozumět mu není totéž jako umět ho hrát. Rozdíl je v tom, že
divák vidí výsledek a hráč musí udělat rozhodnutí **bez** výsledku. A aby se to
naučil, potřebuje jich udělat tisíce — a u každého vědět, jestli bylo dobré.

Obyčejný simulátor tohle neřeší: zahraješ handu, vyhraješ nebo prohraješ, a
naučíš se akorát to, že vyhrávat je fajn. To je učení se z náhody.

## Co to je

**Trenažér, ve kterém je hra.** Ne hra, ke které je přilepený trénink.

Rozdíl je v tom, co je střed produktu:

- hra: střed je stůl, učení je vedlejší efekt;
- trenažér: střed je **smyčka učení**, stůl je jedna z jejích částí.

## Smyčka učení

```
        ┌──────────────────────────────────────────┐
        │                                          │
        ▼                                          │
   hraješ session  ──►  review po handě  ──►  leak report
        ▲                                          │
        │                                          ▼
        └────────────  drilly na leak  ◄───────────┘
```

Klíčové je, že appka si tě **diagnostikuje sama**: z tvých rozhodnutí pozná,
který typ spotu tě stojí nejvíc, a naseje ti na něj drilly. Neučíš se to, co
je zrovna v kurzu, ale to, co skutečně ztrácíš.

## Šest principů

### 1. Trénink není hra

Metrika není „kolik jsem vyhrál", ale **kolik rozhodnutí jsem udělal a jak
dobrých**. 9-handed full-ring má málo rozhodnutí na hodinu — proto vedle stolu
existují drilly, které jich dají 100 za 10 minut.

### 2. Žádné berličky ve hře

Během handy nevidíš equity, pot odds ani doporučení. Jen karty, stacky, pot a
akce. Zpětná vazba přichází **po handě**.

Výjimka: **matematické drilly** (pot odds, outs, kombinace). Tam je okamžitá
kontrola správná — je to kartička na násobilku, ne berlička. Kdybych ti
tajil, jestli je 100/300 = 25 %, jen bys opakoval chybu.

### 3. Kvalita rozhodnutí ≠ výsledek

Appka musí umět říct „tenhle call byl správný, i když jsi prohrál" a „tenhle
call byl špatný, i když jsi trefil river". Sleduje se **EV loss** rozhodnutí,
ne výsledek handy. Proto taky review ukazuje equity, kterou jsi měl, ne jen
co přišlo na river.

### 4. Realismus a obtížnost jsou dvě osy

Ne jeden slider. Soft live pool je **velmi realistický a zároveň snadný**.
Reg-heavy pool je realistický a nemilosrdný.

| Osa | Co škáluje |
|---|---|
| Realismus | složení poolu, sizingy, rake, informace, stacky, počet hráčů |
| Obtížnost | velikost leaků soupeřů, jak dobře trestají, jak jsou balanced |
| Komplexita | 6-max → 9-max, SRP → 3-bet poty → multiway |

### 5. Vysvětlitelnost místo falešného GTO

Nemáme solver a nebudeme předstírat, že ho máme. Review stojí na:

- **matematice** (pot odds vs equity — objektivní),
- **pojmenovaných chybách** („c-bet 100 % range na boardu, který svědčí
  callerovi" — obhajitelné a naučné),
- **EV loss** proti explicitně označenému baseline modelu.

Když je něco model a ne pravda, řekneme to.

### 6. Učení je aktivní

Review není čtení rozsudku. U špatné handy se ptáme „co jsi tady sledoval?"
a necháme tě to zahrát znovu. Před akcí klikneš **intent** (value / bluff /
pot control / fold) — coach pak hodnotí soudržnost záměru a provedení, ne jen
výsledek.

## Režimy

| Režim | Co dělá |
|---|---|
| **Učebna** | koncepty + drilly (matematika, ranges, spoty) |
| **Stůl** | hraješ proti 8 soupeřům, bez pomoci |
| **Review** | po handě: nejdražší rozhodnutí, vysvětlení, koncept |
| **Leak report** | co tě dlouhodobě stojí nejvíc, napříč handami |
| **Kariéra** | postupoval bys přes realističtější pooly |

## Model realismu

Pool se skládá z archetypů, ne z klonů. Každý má parametry (VPIP, PFR,
3-bet %, c-bet %, fold-to-c-bet, bluff frequency, sizing tell) a **leak
magnitude** 0–1, kterým se ladí obtížnost bez změny realismu.

> Stav: osm archetypů je hotových jako v1 aproximace — rozhodují se podle
> odhadnutého range soupeřů, ne náhodně. Detaily a známá omezení jsou
> v [03-architektura.md](03-architektura.md).

Profily:

- `live-soft` — limping, velké opens, málo bluffů, calling stations
- `micro-online` — 3bb opens, víc 3-betů, agresivnější
- `reg-mixed` — tough, balanced
- `maniak` — chaos, vysoká variance

> Stav: presety jsou hotové (`engine/src/presets.ts`), výchozí je `live-soft`.
> Obtížnost se mění složením poolu, ne jedním sliderem, a `hero.ts` umí
> změřit, jestli se na stole dá vyhrát — včetně intervalu spolehlivosti.

K tomu: rake (0 / live 10 % cap 5 / online 5 % cap 3), HUD vypnutý (soupeře
si musíš přečíst sám), 100bb default ale občas short stacker, 9-max default.

Postup `live-soft` → `micro-online` → `reg-mixed` je gatovaný měřitelně:
„porážíš tenhle pool X bb/100 na 20k+ hand".

## Co to záměrně NENÍ

- multiplayer ani reálné peníze,
- turnajový/ICM trénink (jiná disciplína, možná později),
- GTO oracle,
- grafika a efekty na úkor přehlednosti,
- sběr dat o tobě na server (vše lokálně, IndexedDB).
