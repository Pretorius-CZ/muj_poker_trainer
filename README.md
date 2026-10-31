# Poker Trainer

Trénink Texas Hold'em pro jednoho hráče. 9-handed, cash game, zpětná vazba
**až po handě**.

Tohle není hra. Je to trenažér: cílem je, abys uměl rozhodovat, ne aby tě to
zabavilo (i když to je příjemný vedlejší efekt). Hra samotná je jen médium,
přes které se učíš.

## Stav: engine + AI vrstva + presety stolů

| Vrstva | Co umí |
|---|---|
| **Karty a RNG** | deterministické podle seedu, každá handa jde přehrát znovu |
| **Evaluator** | 5/6/7 karet, kola, kickery; ověřeno na všech 2 598 960 pětikaretách |
| **Pravidla** | blindy, ante, min-raise, short all-in, BB opce, heads-up pořadí, side poty |
| **Range** | notace `22+`, `A2s+`, `A5s-A2s`, `99-66`, `AKs`, `AKo`; 1326 kombinací s vahami |
| **Equity** | Monte Carlo proti handě, proti range i proti víc range najednou |
| **Archetypy** | nit, TAG, station, maniak, weak-tight, ABC reg, tricky, loose-passive |
| **Presety** | live-soft (výchozí), micro-online, reg-mixed, maniak |
| **UI stolu** | 9 seatů, akce, pot, board, showdown — bez frameworku |
| **Review po handě** | equity vs odhad range, pot odds, EV ztráta v bb |
| **Nápověda při hře** | volitelné hodnocení každé akce hned po jejím zahrání |
| **Simulace** | invarianty po každé handě + měření „dá se na tom vyhrát?" |

Zatím **není**: dlouhodobý leak report, drilly, ukládání hand.

## Výchozí stůl je soft — a to je záměr

Kdybys hrál proti osmi maniakům, přestane to být trénink a začne být
frustrace. Výchozí preset `live-soft` je proto složení, které potkáš na
nízkých live stakes:

- 3× calling station
- 3× loose-passive
- weak-tight, TAG, nit

Hodně limping, málo 3-betů, skoro žádné bluffy. Vydělává se na tom value
betem — tedy přesně ta dovednost, kterou máš trénovat jako první. Obtížnost
se pak škáluje **složením poolu**, ne jedním sliderem:

| Preset | Charakter |
|---|---|
| `live-soft` | stations a passive, učíš se hodnotu |
| `micro-online` | víc TAGů a ABC regů, agresivnější |
| `reg-mixed` | slušně balanced, trestá chyby |
| `maniak` | dva maniaci, vysoká variance, trénink exploitu |

Boti mají navíc strop na velikost sázky (max 0,85 potu) — žádné náhodné
overbety, které působí, jako by si program dělal, co chce.

## Jak to spustit

Není potřeba nic instalovat — běží to na Node 24 s nativním TypeScriptem.

```powershell
cd engine

# testy (78 testů, ~2 s)
node --test --test-isolation=none "test/**/*.test.ts"

# 100 000 hand s náhodnými boty — fuzz test pravidel
node src/sim.ts 100000

# 1 500 hand na soft stole — statistiky, které mají smysl
node src/sim.ts 1500 1 live-soft

# „dá se na tom vyhrát?" — hrdina (TAG) proti zbytku stolu
node src/hero.ts 4000 live-soft tag

# ukázková handa po streetech
node src/demo.ts 11 live-soft
```

> `--test-isolation=none` je potřeba jen v sandboxovaném prostředí, kde
> nejde spouštět potomky s pipe. Na běžném stroji stačí `node --test`.

## UI stolu

```powershell
# 1. přeložit engine do JS pro prohlížeč (jen když se změní engine)
node tools/build-web.mjs

# 2. spustit statický server
node tools/serve.mjs
# → http://127.0.0.1:8787

# testy UI (vyžadují build výše)
node --test --test-isolation=none "web/test/**/*.test.js"
```

Žádný Vite ani `npm install`. Node 24 umí TypeScript stripovat nativně
(`stripTypeScriptTypes`), takže `tools/build-web.mjs` vyrobí z `engine/src`
obyčejné ESM moduly, které prohlížeč načte přímo.

Co UI umí: devět seatů kolem stolu — **ty sedíš vždy dole**, soupeři po směru
hodinových ručiček, takže pořadí na obrazovce odpovídá pořadí akcí. Button
cestuje jako v reálu. Dále board, pot, blindy, foldnuté a all-in hráče,
lištu pozic se zvýrazněnou tvojí pozicí, raise panel se **sázením v BB**
(i v žetonech) a zkratkami 2,5 / 3 / 5 bb, ½ potu, pot a all-in, a výsledkovou
kartu se showdownem a review. Během handy **žádná equity ani pot odds** —
to je záměr, zpětná vazba patří až po handě.

Přepínačem **6-max / 9-max** změníš velikost stolu — přeskládá se rozesazení,
lišta pozic i statistiky. Boti se v 6-max zvednou (širší open range), protože
šest hráčů znamená víc hand na pozici. Statistiky se počítají **zvlášť pro
každou velikost**, protože VPIP v 6-max a 9-max nejdou míchat.

### Čtečka handy

Když je nápověda zapnutá, vidíš u svého sedadla a v akční liště, co
ve vztahu k boardu skutečně máš:

- **hotovou handu** — top pár K, druhý pár, overpair, podpár, set, dva páry…
- **drawy** — flush draw (i „do esa"), open-ended, gutshot, dvě overcards.

Je to popis, ne doporučení — neříká, co máš hrát.

### Nápověda a tempo

Nad stolem je **zatržítko „Nápověda při hře"** (výchozí zapnuto) a volba
tempa botů. Nápověda po každé tvé akci zobrazí, co bylo vidět:

- **šanci na výhru** proti odhadnutému rozsahu soupeřů,
- **cenu dorovnání** (kolik potřebuješ), když čelíš sázce,
- verdikt a při chybě i to, co bylo správně („→ správně: zahodit"),
- ztrátu v bb.

Vedle je tlačítko **Slovníček**, které česky vysvětlí equity, pot odds, EV,
fold equity, VPIP, PFR i agresivitu — kdykoli, i během hry.

A taky **Tahák** na počítání v hlavě: tabulka outs → % (flop/turn) a sázka →
potřebná šance, včetně korekce pravidla ×4 pro víc než 8 outs.

Vypneš ji, až ti to půjde — pak zůstane jen review po handě.

Tempo: **pomalá** (1,8–3 s, výchozí), normální (0,9–1,6 s), rychlá
(0,35–0,7 s). Nastavení se pamatuje v `localStorage`, takže přežije reload.

### Statistiky a historie

Vpravo nahoře je počet odehraných hand, výsledek session v bb a tlačítko
**Statistiky**. To otevře souhrn:

- **Výsledek** (bb a bb/100), **VPIP**, **PFR**, **agresivita** (AF = bety
  a raisy / cally), **showdown** a jeho úspěšnost,
- **EV ztráta** celkem i na handu,
- slovní vyhodnocení: jestli hraješ pasivně nebo agresivně, jestli máš
  velký rozdíl VPIP/PFR a jaká chyba se ti opakuje nejčastěji,
- **historie hand** — každá handa má pozici, karty, board, výsledek a po
  rozkliknutí i všechna svá rozhodnutí s verdiktem.

Handy se ukládají do `localStorage` (posledních 100), takže historie
přežije reload. Nikam se neposílají.

**Celkový počet hand** se počítá zvlášť, takže počítač nezůstane viset na
100. Statistiky mají dva přepínače: **Kumulativní** (součty ze všech
odehraných hand) a **Posledních 100** (aktuální forma). Kumulativní součty
se vedou průběžně po každé handě, takže se neztratí ani handy, které
vypadly z okna detailu.

Pod čísly je rozbalovací **„Co znamenají zkratky?"** s vysvětlením VPIP,
PFR, agresivity, bb/100, showdownu, ztráty i chyb. U VPIP a PFR je i
**cílové pásmo pro tvůj stůl** (6-max a 9-max mají jiné), takže vidíš,
jestli se tvoje čísla vůbec vejdou do zdravého rozsahu.

### Preflop chart na boku

Když je zapnutý **Solver**, objeví se před flopem v bočním panelu i
**Preflop chart** — pro tvoji skutečnou handu: spot (např. „CO — nikdo
neotevřel" nebo „BB proti openu z BTN"), tvoje karty, verdikt chartu
a percentil proti hranici. Tabulka range se rozbalí pod tím.

Hraniční handy blízko prahu jsou označené — tam se baseline charty liší
nejvíc. Model se preflop neukazuje: pot odds dávají smysl až od flopu,
preflop rozhoduje chart.

### Preflop trenér 6-max

Tlačítko **Preflop dril** otevře trénink před flopem: náhodná handa, pozice
a situace (otevřít, nebo čelit openu), na tobě je raise / 3-bet / call /
fold. Po odpovědi uvidíš, jestli to sedí, a rozbalíš **13×13 tabulku** range
pro danou pozici.

Jsou to **baseline charty podle frekvencí** (UTG ~17 %, BTN ~42 %), ne
solverová GTO čísla — hraniční handy se mohou lišit. Slouží k tomu, aby sis
zažil, co se z které pozice hraje, ne k memorování dokonalých frekvencí.

### Pauza

Vedle volby rychlosti je tlačítko **Pauza** — zastaví boty, kdykoli
potřebuješ. Otevření statistik nebo slovníčku hru pozastaví samo a po
zavření zase pustí, takže si je můžeš v klidu pročíst i uprostřed handy.

### Boční solver

Přepínač **Solver** otevře panel na boku. Když jsi na řadě, ukáže
doporučenou akci (zahodit / dorovnat / vsadit / zvýšit), šanci, potřebnou
cenu a důvody — včetně čtení handy a typu soupeře.

Počítá z odhadu rozsahu, fold equity a exploit heuristik, takže to **není
GTO solver** a je to tak i označené. Když nejsi na řadě, panel jen čeká.

### Review po handě

Po každé handě se v výsledkové kartě objeví sekce **Tvoje rozhodnutí**:
u každé akce uvidíš street, co jsi udělal, s jakou equity, jaké byly pot
odds a jestli to podle matematiky bylo dobře, nebo ne — včetně ztráty v bb.

```
preflop call   eq 16 %  pot odds 29 %  ✗ call bez pot odds     −1,4 bb
flop    check  eq 26 %  pot odds  —   · equity 26 %
turn    call   eq 22 %  pot odds 31 %  ✗ call bez pot odds     −3,2 bb
river   check  eq  1 %  pot odds  —   · equity 1 %
```

### Tři vrstvy hodnocení

**Matematika** — equity proti odhadnutému range a pot odds. Tady se dá
říct, jestli byl call ztrátový. Zvlášť se počítá **realizace equity**: mimo
pozici se část equity nerealizuje (srážka ~14 %), takže stejná equity OOP
a IP není totéž.

**Strategie** — co matematika sama nevidí:

- pozice (IP/OOP),
- typ soupeře (station → nebluffuj, nit → věř mu, maniak → callej víc),
- fold equity model pro **bet vs check na riveru** (hrubý odhad, jak často
  soupeř foldne),
- textura boardu (monotone, párovaný).

**Exploit** — třetí, samostatný pohled: neptá se „kolik to má EV", ale
„funguje tahle akce na tohle protivníka". Proti volumečovi hodnotová sázka
a žádné bluffy, proti nitovi bluff a respekt k jeho sázkám, proti maniakovi
dorovnávat. Může se rozejít s matematikou — a to je záměr.

**Riziko** — čtvrtý pohled: kolik procent stacku jsi dal do hry a jestli to
odpovídalo šanci. Drobný call se nehlásí jako chyba; velké riziko bez
dostatečné šance ano. Ve statistikách je průměrné riziko a počet velkých
rozhodnutí, která byla oprávněná.

UI to drží oddělené: nad verdiktem je vždy „Matematicky…" a pod ním sekce
„Strategie". Bet a check se hodnotí jen na riveru heads-up — dřív má check
opční hodnotu a jednostreetový model by lhal.

**Co model nevidí**: tvoje čtení, image, historii ani tilt. UI to přiznává
a nedělá z toho verdikt. Není to GTO.

### Co znamená to `±`

`hero.ts` vypisuje bb/100 i s 95% intervalem spolehlivosti. Na 4 000 handách
je interval klidně ±80 bb/100 — tedy se nedá říct skoro nic. To není chyba
měření, to je poker. Na skutečné bb/100 potřebuješ desítky tisíc hand, a to
je samo jeden z modulů sylabu.

## Spuštění jinde

Appka je čistě statická — nepotřebuje server ani build.

- **Lokálně:** `node tools/serve.mjs` → `http://127.0.0.1:8787`
- **GitHub Pages:** workflow `.github/workflows/pages.yml` publikuje `web/`
  při každém pushi do `main`. Po zapnutí Pages (Settings → Pages → Source:
  GitHub Actions) běží na `https://<uživatel>.github.io/<repo>/`.

Pozor: historie hand, statistiky i nastavení se ukládají do `localStorage`,
takže se mezi zařízeními nepřenášejí — na každém prohlížeči začínáš
s vlastními daty.

## Struktura

```
poker-trainer/
├── README.md
├── docs/
│   ├── 01-vize.md          # co to je, pro koho, jaké má principy
│   ├── 02-sylabus.md       # výuková osnova od základů
│   └── 03-architektura.md  # technická rozhodnutí a mapa kódu
├── tools/
│   ├── build-web.mjs       # TS → browser-ready JS bez závislostí
│   ├── serve.mjs           # statický server pro vývoj
│   └── check-ui.mjs        # odehraje handu a zkontroluje render
├── web/
│   ├── index.html
│   ├── app/
│   │   ├── main.js         # vstup, pacing botů, kliknutí
│   │   ├── controller.js   # herní logika bez DOM (testovatelná)
│   │   ├── render.js       # stav → HTML
│   │   └── style.css
│   ├── engine/             # generováno, neupravovat
│   └── test/
└── engine/
    ├── src/                # 14 modulů (viz architektura)
    └── test/               # 78 testů
```

## Kam dál

1. **UI stolu** (Vite + React) — devítimístný stůl, akce, pot, stacky.
2. **Coach** — po handě: EV loss, pojmenované chyby, odkaz na modul sylabu.
3. **Review** — přehrání handy ze seedu, equity v rozhodovacích bodech.
4. **Drilly** — spoty z historie, preflop range trainer.
5. **Ukládání** — IndexedDB, historie hand, leak report.
6. **Boti v2** — textura boardu, c-bet logika.

Detailní plán je v [docs/01-vize.md](docs/01-vize.md) a
[docs/03-architektura.md](docs/03-architektura.md).
