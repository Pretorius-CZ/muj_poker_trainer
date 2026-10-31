# Sylabus — od základů k plnému full-ringu

Zásada: **nepostupuje se podle toho, co je probrané, ale podle toho, co
umíš.** Každý modul má exit kritérium, které se měří. Nesedí → zůstáváš.

Každý modul má čtyři části:

1. **Koncept** — krátké vysvětlení, proč to tak je.
2. **Drill** — izolovaná rozhodnutí s okamžitou kontrolou (matematika).
3. **Herní blok** — session u stolu, review až po handě.
4. **Exit kritérium** — měřitelný test, že to umíš.

Odhad: ~50 hodin čistého času + hraní. Reálně 2–3 měsíce při hodině denně.

---

## M0 — Mapa hry (2 h)

**Cíl:** vědět, co se u stolu děje a proč.

- pozice v 9-max: BTN, SB, BB, UTG, UTG+1, UTG+2, MP, HJ, CO
- blindy, ante, street, all-in, side pot
- co je to range (a proč to není „jaké karty mám")
- kdo jedná první preflop a kdo po flopu

**Drill:** pojmenuj pozici; urči, kdo je na řadě; vysvětli, proč má pozice
hodnotu.

**Exit:** popíšeš průběh handy od blindů po showdown a vysvětlíš, proč má
nevolaná část sázky jiného vítěze než zbytek potu.

---

## M1 — Matematika potu (4 h)

**Cíl:** umět spočítat, jestli se call vyplatí. Tohle je jediná část pokeru,
kde existuje správná odpověď.

- outs → equity (orientačně ×2 na turn, ×4 na flopu)
- pot odds a break-even procento: `call / (pot + call)`
- implied odds — kdy nestačí a proč
- EV rozhodnutí jako součet vážených výsledků

**Drill:** „pot 100, soupeř bet 50 — kolik potřebuju equity?" (25 %).
Varianta: „mám flush draw, soupeř bet 2/3 potu — call?"

**Exit:** 9 z 10 správně do 10 sekund, včetně toho, kdy je odpověď „záleží
a tady je proč".

---

## M2 — Ranges a kombinace (4 h)

**Cíl:** přestat přemýšlet v jedné handě a začít v rozsahu.

- hand vs hand vs **hand vs range**
- kombinace: pár = 6, suited = 4, offsuit = 12, libovolná ne-pár = 16
- blockery — proč moje eso mění soupeřovu range
- proč all-in s AK proti jedné konkrétní handě není totéž jako proti range

**Drill:** kolik kombinací má daná range? Které handy blokuje moje A♠? Jak
velká část soupeřovy range je na riveru bluff?

**Exit:** spočítáš velikost range a vysvětlíš, proč „mám AK, jsem ahead"
může být pravda i lež zároveň.

---

## M3 — Preflop 9-max (8 h)

**Cíl:** vědět, s čím do hry vůbec lezeš. Tohle je nejvíc opakovatelná část
pokeru a nejrychlejší zdroj win-rate na nízkých stakes.

- open range po pozicích (orientační baseline, 100bb, bez rake):

  | Pozice | Open ~% |
  |---|---|
  | UTG | 10 % |
  | UTG+1 | 11 % |
  | UTG+2 | 13 % |
  | MP | 15 % |
  | HJ | 18 % |
  | CO | 26 % |
  | BTN | 42 % |
  | SB | 40 % (raise-first-in) |

  Čísla jsou **orientační** — doladíme je proti reálným chartám a proti
  konkrétnímu poolu. Důležitější než přesné procento je **směr**: čím blíž
  buttonu, tím širší.

- 3-bet: proti UTG openu mnohem užší než proti BTN openu
- 4-bet a kdy už je handa commitnutá
- BB defense: pot odds + schopnost realizovat equity (OOP realizuje hůř)
- hraní proti limperům — v live poolu jich bude hodně a charty je neřeší

**Drill:** hand + pozice + akce před tebou → raise / call / fold / 3-bet,
s vysvětlením. Postupně se přidává rake a limpeři.

**Exit:** 85 % shoda s baseline na 100 rozhodnutích. Ne dokonalost —
konzistence.

---

## M4 — Flop (8 h)

**Cíl:** umět se rozhodnout, kdo na tom boardu vydělává.

- textura: suchý / mokrý, párovaný, monotone, connected
- **range advantage vs nut advantage** — kdo má víc silných hand
- c-bet: kdy betovat celou range, kdy jen částí, kdy vůbec ne
- sizingy: 33 % / 50 % / 75 % a co který říká
- check-raise a proč je silný

**Drill:** flop spot → čí board to je, bet nebo check, jaký sizing.
Vysvětlení vždycky obsahuje „komu board svědčí".

**Exit:** u 20 spotů správně určíš range advantage a zvolíš akci, která
odpovídá tvému záměru (value vs ochrana vs bluff).

---

## M5 — Turn a river (8 h)

**Cíl:** udržet plán napříč streetami, ne hrát každou zvlášť.

- barrel: kdy pokračovat a kdy se zastavit
- probe bet, float, delayed c-bet
- pot control — kdy hrát malý pot s dobrou handou
- commitment — kdy je stack už v potu
- MDF (min defense frequency) a bluff-catching
- river: polarizace, value bet tenký vs tlustý, kdy bluffovat

**Drill:** rozhodnutí na turnu a riveru s celým kontextem (co se stalo
předtím). Kontrola, jestli plán dává smysl jako celek.

**Exit:** u 10 spotů rozlišíš value od bluffu a obhájíš sizing. U 5 spotů
poznáš, že nejlepší akce je malý pot.

---

## M6 — Multiway a 3-bet poty (8 h)

**Cíl:** zvládnout to, co 6-max materiály vynechávají — a co v 9-max
potkáš pořád.

- proč multiway mění všechno (víc hráčů = víc nut hand, žádný c-bet 100 %)
- squeeze, cold call, overcall
- 3-bet poty: nižší SPR, jiné sizingy, jiná ochota stackovat
- kdy multiway jen checkovat a mít rád, že to jde

**Exit:** v multiway spotu neuděláš chybu přenesenou z heads-up myšlení.

---

## M7 — Exploity a čtení soupeřů (6 h)

**Cíl:** přestat hrát „správně" a začít hrát **proti konkrétním lidem**.

- jak číst tendence bez HUD (sizing, tempo, showdowny)
- adjustace: station → value bet tence; nit → fold; maniak → trap
- kdy exploit přestane fungovat (soupeř se přizpůsobí)
- proč je exploit proti slabému poolu víc peněz než GTO

**Exit:** v jedné session pojmenuješ tři exploity, které jsi použil, a
vysvětlíš, proč fungovaly.

---

## M8 — Variance, bankroll, hlava (3 h)

**Cíl:** vydržet. Většina lidí neprohraje kvůli strategii, ale kvůli tomu,
že nevydrží downswing.

- bb/100 jako metrika, proč potřebuješ desítky tisíc hand
- co znamená 20 buy-in downswing (nic o tvojí hře)
- tilt a jak ho poznat dřív, než udělá škodu
- výsledek ≠ kvalita rozhodnutí — a jak to trénovat

**Exit:** vysvětlíš, proč po 500 handách nevíš, jestli hraješ dobře.

---

## Kariéra — realističtější pooly

| Level | Pool | Cíl (orientační) |
|---|---|---|
| 1 | live-soft, 9-max, 100bb | +5 bb/100 na 10k hand |
| 2 | micro-online | +3 bb/100 |
| 3 | reg-mixed | break-even |
| 4 | tough | přežít bez ztráty |

Postup není o levelu, ale o tom, že **porážíš ten současný**. Jinak se učíš
jen přežívat.

---

## Co sylabus záměrně vynechává

- turnaje a ICM (jiná disciplína),
- PLO, short deck, heads-up specializace,
- „GTO memorování" bez pochopení,
- konkrétní hand histories z videa — ty přijdou až později jako doplněk.
