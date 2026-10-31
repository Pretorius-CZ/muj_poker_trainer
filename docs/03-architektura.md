# Architektura

## Principy

1. **Engine je framework-free.** Žádný React, žádné UI, žádné závislosti.
   Jde spustit v Node, v prohlížeči i v testu bez mocků.
2. **Determinismus.** Každá handa je funkce (seed, konfigurace, akce).
   Stejný seed → stejné karty → handu jde přehrát znovu. To je základ
   review režimu i ladění.
3. **Invarianty místo důvěry.** Engine po každé handě ověřuje, že žetony
   sedí. Ne „mělo by to fungovat", ale „ověřeno na 100 000 hand".
4. **Pravidla čitelná v kódu.** Min-raise, short all-in, reopening — každé
   pravidlo má v `hand.ts` komentář s vysvětlením, proč tam je.

## Proč nula závislostí

Node 24 umí spouštět TypeScript nativně (type stripping). Testy běží přes
`node --test`. Žádný `npm install`, žádný build step, žádný `node_modules`.

Cena: žádná typová kontrola při běhu (jen stripování). Pro tuhle fázi je to
správná volba — testy chrání víc než typy. Až přijde UI s Vite, TypeScript
se zkontroluje tam.

## Vrstvy a mapa modulů

```
        sim / demo            (spouštění, metriky)
             │
          table               (stacky, button, session)
             │
           hand               (pravidla jedné handy)
        ┌────┴────┐
      pots     evaluator      (dílčí výpočty)
        │         │
      cards ──────┘
             │
            rng

   archetypes ──► equity ──► range
        │            │         │
     strength ───────┴─────────┘
```

| Modul | Odpovědnost | Závisí na |
|---|---|---|
| `cards.ts` | karta jako číslo 0–51, parsování, formátování | — |
| `rng.ts` | deterministický mulberry32, Fisher-Yates | — |
| `evaluator.ts` | skóre 5/6/7 karet, popis handy | cards |
| `pots.ts` | vrstvené dělení potu | — |
| `hand.ts` | betting state machine | cards, rng, evaluator, pots |
| `table.ts` | stacky mezi handami, button, auto top-up | hand, bots |
| `bots.ts` | rozhraní `Policy` + testovací politiky | hand |
| `range.ts` | notace range, konkrétní kombinace, filtrování | cards, rng |
| `equity.ts` | Monte Carlo: proti handě, range, víc range | cards, evaluator, range |
| `strength.ts` | Chenův vzorec, percentil, top X % range | cards, range (typ) |
| `archetypes.ts` | profily soupeřů, rozhodování | hand, equity, strength, range |
| `presets.ts` | složení stolů (live-soft, micro-online, reg-mixed, maniak) | archetypes |
| `sim.ts` | headless běh + invarianty + metriky | table, bots, archetypes, presets |
| `hero.ts` | měření, jestli se na stole dá vyhrát | sim, presets |
| `demo.ts` | výpis jedné handy | hand, bots, presets |

Směr závislostí je jednosměrný. `hand.ts` o UI ani o AI neví — díky tomu jde
lidský hráč, bot i replay zastrčit za stejné `Policy` rozhraní.

## Datový model

```ts
Hand {
  seats: SeatState[]        // stack, hole, folded, allIn, committed*, hasActed
  board: Card[]
  street: preflop|flop|turn|river|showdown|complete
  actor: number | null
  pot: number               // součet committedHand
  log: HandEvent[]          // každá akce + pot po ní
  result: HandResult | null // payouts, pots, kdo co měl
}

RangeCombo { cards: [Card, Card]; weight: number }

BotProfile {
  vpip, pfr, aggression, bluff, callDown, sizing
}
```

`SeatState.hasActed` + `actedAtRaiseLevel` řeší právo re-raise. `raiseLevel`
se zvyšuje jen při **plném** navýšení; short all-in ho nechá být, takže hráči,
kteří už jednorázově jednali, nemůžou re-raisovat.

## Pravidla a invarianty

1. Min-raise = velikost posledního **plného** navýšení (ne velikost potu).
2. Short all-in neotvírá znovu sázku.
3. Nevolaná část sázky se vrací (vrstvené poty to řeší samy).
4. Big blind má opci, i když všichni jen dorovnali.
5. Heads-up: button je SB, preflop jedná první, od flopu BB.
6. Když nemůže nikdo dorovnat, board se dorozdá a jde se na showdown.
7. Ante se počítá do potu, ale ne do sázky na street.
8. Fold, když nic neplatíš, je zakázaný.

### Proč zákaz foldu při checku

Testy odhalily, že povolený fold „zdarma" dokáže vytvořit pot, na který nemá
nárok nikdo: hráč, který dal víc než ostatní (a ti jsou all-in), foldne a jeho
nevolaná část zůstane v potu. V reálu se to nestane, protože nevolaná část se
vrací dřív. Nejjistější oprava je fold v tuhle chvíli zakázat.

## Range

Range je seznam konkrétních kombinací s vahou, ne seznam „hand". `AA` je šest
kombinací, `AKs` čtyři, `AKo` dvanáct, `AK` šestnáct.

Notace:

| Zápis | Význam |
|---|---|
| `AA` | pár |
| `AKs` / `AKo` / `AK` | suited / offsuit / obojí |
| `22+` | 22, 33, … AA |
| `A2s+` | A2s, A3s, … AKs (vysoká karta pevná) |
| `A5s-A2s` | rozsah se stejnou vysokou kartou |
| `99-66` | rozsah párů |

Pravidlo pro `+`: vysoká karta zůstává, nízká roste. Proto `T9s+` dá jen T9s —
pro spoilery se vypisují ručně. Záměrně: radši jednoznačná notace než hádání.

Váhy jsou v modelu připravené pro mixed strategie; parser je zatím plní
jedničkou.

## Equity

Monte Carlo: dorozdá se board, ohodnotí se všechny handy, spočítá se výherce.
Směrodatná odchylka je zhruba `0.5 / sqrt(iterace)` — pro 1 000 iterací ~1,6 %,
pro 10 000 ~0,5 %.

Čtyři API podle situace:

| Funkce | Kdy |
|---|---|
| `equityVsHands` | všechny karty viditelné (review, all-in) |
| `equityVsRange` | jeden soupeř s range (preflop drill) |
| `equityVsRanges` | víc soupeřů, každý jiný range (rozhodování bota) |
| `equityVsRandom` | rychlý odhad proti neznámým (testy, fallback) |

Vše deterministické podle seedu. Ověřeno proti známým hodnotám: AKs vs QQ
45,9 %, AA vs KK 82,3 %, AA vs náhodná 85 %.

## Archetypy

**Preflop**: Chenův vzorec → percentil 0..1 (0 = AA). Prahy se škálují podle
pozice (`looseness = 0.55 + 0.9 × pozice`). 3-bet má vlastní, mnohem užší
práh; raise války nad 12 bb pokračují jen s prémií.

**Postflop**: equity proti **odhadnutým range** soupeřů, ne proti náhodným
handám. Range se odhaduje podle toho, co soupeř v handě udělal:

| Co soupeř ukázal | Odhad range |
|---|---|
| bet/raise na této street | top 8 % |
| raise dřív v handě | top 15 % |
| call na této street | top 25 % |
| call dřív | top 35 % |
| jen checky | top 60 % |

To je nejdůležitější rozhodnutí v celé AI vrstvě. První verze počítala equity
proti náhodným handám — výsledek: 77 % hand došlo na showdown, protože každý
si myslel, že je ahead. Po přechodu na odhady range: ~42 %.

Pořád je to aproximace. Chybí textura boardu, c-bet logika a pozice postflop —
to je příští vrstva.

## Presety a měření porazitelnosti

Obtížnost se neškáluje jedním sliderem, ale **složením poolu**. Preset je
devět archetypů; výchozí `live-soft` je záměrně měkký:

| Preset | Složení | VPIP poolu |
|---|---|---|
| `live-soft` | 3× station, 3× loose-passive, weak-tight, TAG, nit | ~35 % |
| `micro-online` | TAG, ABC, tricky, station, loose-passive | ~25 % |
| `reg-mixed` | TAG, ABC, tricky | ~22 % |
| `maniak` | 2× maniac, stations, TAG | ~43 % |

K tomu strop na sázku 0,85 potu — bez něj vznikají overbety, které působí
nahodile a na nízkých stakes se nepotkávají.

`runHeroSimulation` odpovídá na otázku „dá se na tom vyhrát?": jeden seat hraje
jinou strategii (výchozí TAG), zbytek stolu preset. Měří **čistý zisk v
bb/100** z `initialStacks`, takže auto top-up se do výsledku nepočítá.

K výsledku se počítá i 95% interval spolehlivosti z rozptylu na handu. Na
4 000 handách vyjde klidně ±80 bb/100 — což je správná odpověď, ne chyba:
poker má obrovskou varianci a bb/100 začne něco znamenat až v desítkách
tisíc hand. Přesně to má učit modul M8 sylabu.

## UI stolu

UI je taky bez závislostí — žádný React, žádný Vite. Důvod je stejný jako
u enginu: projekt má jít spustit bez instalace a bez build toolchainu.

Prohlížeč ale neumí TypeScript. Řešení je `stripTypeScriptTypes` z Node 24:
`tools/build-web.mjs` přečte `engine/src/*.ts`, odstraní typy a přepíše
importy z `.ts` na `.js`. Výsledkem je obyčejné ESM v `web/engine/`, které
prohlížeč načte přímo. Generované soubory se needitují.

Vrstvy:

| Soubor | Role |
|---|---|
| `web/app/controller.js` | herní logika bez DOM — jde testovat v Node |
| `web/app/render.js` | čistá funkce `stav → HTML` |
| `web/app/handread.js` | čtečka handy: top pár, set, drawy… |
| `web/app/advisor.js` | boční solver: doporučení akce z modelu |
| `web/app/main.js` | eventy, pacing botů, přechod mezi handami |
| `web/app/style.css` | vzhled, CSS grid stolu |

Rozdělení controller/render je záměr: interaktivní smyčka (člověk + boti,
předání tahu, settle) se dá otestovat bez prohlížeče. K tomu musí `Table`
umět handu rozpustit na `startHand()` / `finishHand()` — `playHand()` je pak
jen jejich spojení pro simulace.

Pacing: bot nehraje hned, ale po 360–700 ms, aby bylo vidět, kdo co udělal.
Když je na řadě člověk, smyčka se zastaví.

Pauza: časovač bota se drží v `botTimer`, takže `setPaused(true)` ho může
zrušit (jinak by po pauze ještě jedna akce proběhla). Otevření statistik nebo
slovníčku hru pozastaví automaticky a po zavření ji pustí — ale jen když
pauzu nevyvolal člověk sám.

Velikost stolu je parametr (`GameController({ seats })`), ne konstanta:
6-max i 9-max jedou přes stejný engine. Jména pozic se odvozují z počtu
seatů (`positionName`), rozesazení z úhlu `90° + offset × 360/seats`.
Statistiky se filtrují podle `seats` v záznamu handy, protože VPIP a PFR
mezi 6-max a 9-max nejsou srovnatelné.

**Ověření bez prohlížeče**: `tools/check-ui.mjs` odehraje celou handu a po
každé akci zavolá `render()`. Tím projde všechny stavy (raise panel, all-in,
showdown, výsledková karta) a odhalí chyby, které by jinak spadly až
v prohlížeči. Skutečný screenshot v tomhle prostředí pořídit nešel —
sandbox nedovolí prohlížeči zapsat profil.

### Čtečka handy
`web/app/handread.js` překládá karty na jazyk, kterým se u stolu mluví:
top pár / druhý pár / overpair / podpár / set / dva páry, a k tomu drawy
(flush draw včetně „do esa", open-ended, gutshot, dvě overcards).

Není to jen `describeScore` z evaluatoru — ten řekne „pár K", ale ne „top
pár K" nebo „overpair K". Čtečka proto porovnává ranky tvých karet s boardem
a u drawů počítá, které konkrétní ranks by je dokončily (dva a víc = open-ended,
jeden = gutshot). Draw se počítá jen když na něm máš podíl aspoň jednou svou
kartou — jiný draw mají všichni.

### Boční solver

`web/app/advisor.js` vrací doporučení jen když je člověk na řadě. Skládá
dohromady odhad rozsahů (`rangeTierFor`), equity (`equityVsRanges`), cenu
dorovnání a fold-equity model; navrch pustí exploit heuristiku (proti
volumečovi bluf ne, proti nitovi ano). Výsledek je popisek akce, částka,
jistota a seznam důvodů.

Záměrně se jmenuje „model", ne GTO: je to zjednodušený model s heuristikami,
který má poradit, ne nahradit přemýšlení.

### Preflop trenér

`web/app/preflop.js` drží deset spotů pro 6-max (pět RFI, pět proti openu).
Každý spot má **frekvenční prahy** (`raise`, případně `call`); konkrétní
handy se do pásma řadí podle percentilu síly (Chen), takže rozsahy sedí
frekvenčně, ale nejsou to solverová čísla. UI to říká a hraniční handy se
mohou od GTO chartů lišit.

Tabulka je 13×13 tříd (169 buněk), obarvená podle akce; drill tahá náhodné
hady a hodnotí je stejnou funkcí, takže tabulka a odpovědi nemůžou jít
proti sobě.

### Review po handě

`web/app/review.js` hodnotí rozhodnutí člověka. Ne výsledek handy — ten je
v kartě jen jako kontext.

Pro každé rozhodnutí se uloží snapshot **před akcí**: board, pot, kolik
dorovnat a odhad range každého soupeře (`rangeTierFor` — stejná funkce,
jakou používají boti). Z toho se po handě spočítá:

```
equity  = equityVsRanges(moje karty, range soupeřů, board)
potOdds = toCall / (pot + toCall)
EV call = equity × (pot + toCall) − toCall
```

Známky:

| Situace | Verdikt |
|---|---|
| call s EV ≥ 0, fold s EV ≤ 0 | ✓ matematicky v pořádku |
| call s EV < 0, fold s EV > 0 | ✗ matematicky ztrátové, ztráta = \|EV\| |
| raise s equity pod pot odds | ✗ matematicky ztrátové |
| raise s equity nad pot odds | • kontext (chybí fold equity) |
| bet/check na riveru heads-up | model bet vs check (✓ / tip / kontext) |
| bet/check jinde nebo multiway | • kontext |

K matematice se přidává **realizace equity**: mimo pozici se equity násobí
0,86, protože se hůř dostaneš k showdownu za rozumnou cenu. Je to hrubá
konstanta, ne měření — ale stejná equity OOP a IP opravdu není totéž.

**Strategická vrstva** (`buildStrategicNotes`) přidává to, co matematika
nevidí: typ soupeře (station/nit/maniak…), pozici, počet soupeřů a texturu
boardu.

**Exploitační vrstva** (`exploitVerdict`) je samostatný pohled: neptá se
na EV, ale jestli akce funguje na daný typ soupeře. Vrací vlastní verdikt
(good/bad) a může se s matematikou rozejít — třeba bluff proti nitovi, který
hodně foldne, nebo dorovnání proti maniakovi. Je to heuristika, ne solver,
a proto se zobrazuje jako samostatná poznámka „Exploit", ne jako známka. Fold equity model pro bet vs check je jednostreetový a používá se
jen na riveru heads-up — dřív má check opční hodnotu a model by lhal.
Odhad fold procent je hrubý (station 18 %, nit 55 %) a je označený jako
model, ne pravda.

Ztráty se sčítají do bb za handu. Je to **matematika + heuristiky, ne GTO**:
model range je aproximace a tvoje čtení, image ani historie v něm nejsou.
UI to říká explicitně pod tabulkou.

Testy (`web/test/review.test.js`) hlídají právě hraniční případy: call bez
pot odds, fold s equity, check se silnou handou a součet ztrát.

### Session a historie

`web/app/session.js` ukládá každou dohranou handu do `localStorage`
(posledních 100) a počítá souhrn: VPIP, PFR, agresivitu
`AF = (bety + raisy) / cally`, showdown a jeho úspěšnost, EV ztrátu a počty
chyb podle typu. Záznam obsahuje i jednotlivá rozhodnutí s verdikty, takže
historie umí rozkliknout review kterékoliv handy.

Data zůstávají v prohlížeči — žádný server, žádné odesílání.

## Testování

78 testů enginu, ~2,2 s, plus 41 testů UI:

| Test | Co hlídá |
|---|---|
| `evaluator-exhaustive` | všech 2 598 960 pětikaret: počty kategorií + 7 462 tříd |
| `evaluator` | kategorie, kola, kickery, pořadí, `evaluate7` = max z 21 kombinací |
| `pots` | tři all-iny, foldnutý přispěvatel, nevolaná část |
| `hand` | blindy, pořadí, BB opce, min-raise, short all-in, side poty, split pot |
| `range` | notace, počty kombinací, deduplikace, filtrování mrtvých karet |
| `equity` | známé hodnoty, součty podílů, determinismus, chybové stavy |
| `strength` | Chenovy hodnoty, pořadí percentilů |
| `archetypes` | station hraje víc než nit, maniak raisuje víc, invarianty |
| `presets` | platné složení stolů, výchozí stůl bez maniaka a loose |
| `sim` | 2 000 hand: žetony sedí, determinismus, 2/6/9 hráčů |
| `web/test` | interaktivní handa dohraje, mimo tah nelze hrát, settle a start guards |
| `web/test/review` | call bez pot odds, fold s equity, tip na check, součet ztrát |
| `web/test/session` | souhrn statistik, typy chyb, limit historie, záznam handy |
| `web/test/bets` | převody bb ↔ žetony, clamping, formát se znaménkem |

Nejcennější je vyčerpávající test evaluatoru: kdyby byla chyba v kickerech
nebo v kole, počty kategorií nesedí. A test, že rychlý evaluator dává stejné
skóre jako referenční na 200 000 náhodných hand.

## Výkon

| Co | Čas |
|---|---|
| 100 000 hand, náhodní boti | 1,2 s (82 000 hand/s) |
| 800 hand, archetypy | 1,4 s (~580 hand/s) |
| equity, 20 000 iterací | ~15 ms |
| 73 testů | 2,2 s |

Rychlý evaluator (flush check + bitmask straight) je ~6× rychlejší než
referenční brute force a používá se všude; referenční zůstává v testech.

## Vědomá zjednodušení

- **Žádné burn karty.** Nemá vliv na férovost, jen na pořadí karet v replayi.
- **Žádný rake** v enginu — do modelu vstoupí s profilem poolu.
- **Auto top-up** místo bustování ze stolu (dlouhé simulace nafukují žetony).
- **Range z Chena**, ne z GTO chart — je to heuristika, ne solver.
- **Náhodní boti** jsou fuzz test, ne model hry: statistiky z nich nemají smysl.

## Co dál

1. **Coach** — EV loss, pojmenované chyby, odkaz na sylabus.
2. **Review** — přehrání ze seedu, equity v rozhodovacích bodech.
3. **Ukládání** — IndexedDB, historie, leak report.
4. **Drilly** — preflop range trainer, spoty z historie.
5. **Boti v2** — textura boardu, c-bet, pozice postflop.
