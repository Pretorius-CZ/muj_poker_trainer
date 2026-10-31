/**
 * Review po handě — zpětná vazba na **rozhodnutí**, ne na výsledek.
 *
 * Co se hodnotí: matematika. Pro každé rozhodnutí člověka se spočítá equity
 * proti odhadnutému range soupeřů (stejným modelem, jakým hrají boti) a
 * porovná se s pot odds. Z toho plyne EV callu a EV ztráta.
 *
 * Co se NEhodnotí: akce bez sázky k dorovnání. Bet/raise závisí na tom, jak
 * soupeři reagují (fold equity), a to bez solveru poctivě spočítat neumíme.
 * Takové akce se zobrazí jako kontext bez známky.
 *
 * Zásada: radši méně známek, ale obhajitelných. „Nevím" je lepší než
 * falešná jistota.
 */

import { equityVsRanges } from "../engine/equity.js";
import { createRng } from "../engine/rng.js";

function pct(value) {
  return `${Math.round(value * 100)} %`;
}

/** Česká desetinná čárka. */
function decimal(value) {
  return value.toFixed(1).replace(".", ",");
}

function signedBb(chips, bigBlind) {
  const value = chips / bigBlind;
  return `${value >= 0 ? "+" : "−"}${decimal(Math.abs(value))} bb`;
}

/**
 * Jak často daný archetyp foldne na sázku. Hrubý odhad pro model fold equity —
 * ne měření. Slouží k tomu, aby šlo vůbec nějak ohodnotit bet s nehotovou handou.
 */
const FOLD_TO_BET = {
  station: 0.18,
  "loose-passive": 0.28,
  nit: 0.55,
  "weak-tight": 0.6,
  tag: 0.45,
  abc: 0.45,
  tricky: 0.4,
  maniac: 0.2,
};

function foldProbability(decision) {
  const id = decision.aggressor ? decision.aggressor.profileId : null;
  return FOLD_TO_BET[id] ?? 0.4;
}

/**
 * Zjednodušený model "bet vs check" pro heads-up.
 *
 * EV(bet)  = fold × pot + (1 − fold) × (equity × (pot + 2×bet) − bet)
 * EV(check) = equity × pot
 *
 * Je to **jednostreetový** model: ignoruje budoucí streets i to, že soupeř
 * může raiseovat. Proto se z něj nedělá známka "chyba", jen vodítko.
 */
function betModel(decision, equity) {
  // Jednostreetový model platí jen na riveru: dřív má check opční hodnotu
  // (můžeš ještě zlepšit nebo soupeř může sázet) a model by ji ignoroval.
  if (decision.street !== "river") return null;
  if (decision.opponents !== 1) return null;
  if (!decision.canBet) return null;

  const pot = decision.pot;
  const bet =
    decision.action.type === "bet" && decision.action.amount
      ? decision.action.amount
      : Math.round(pot * 0.66);

  if (pot <= 0 || bet <= 0) return null;

  const fold = foldProbability(decision);
  const evBet = fold * pot + (1 - fold) * (equity * (pot + 2 * bet) - bet);
  const evCheck = equity * pot;

  return { delta: evBet - evCheck, evBet, evCheck, bet, fold };
}

/** Strategické poznámky, které matematika nevidí. */
function buildStrategicNotes(decision) {
  const notes = [];
  const id = decision.aggressor ? decision.aggressor.profileId : null;

  if (id === "station") {
    notes.push("Soupeř je volumeč — bluf na něj nefunguje, sázej na hodnotu.");
  } else if (id === "nit") {
    notes.push("Soupeř je nit — jeho sázka bývá silná, dorovnávej opatrně.");
  } else if (id === "maniac") {
    notes.push("Soupeř je maniak — má široký rozsah, dorovnávej víc.");
  } else if (id === "weak-tight") {
    notes.push("Bázlivý soupeř — na tlak se zbaví slabých hand.");
  } else if (id === "loose-passive") {
    notes.push("Pasivní soupeř — sází hlavně s hodnotou.");
  }

  if (decision.inPosition === false) {
    notes.push("Jsi mimo pozici — šance na výhru se hůř proměňuje v peníze.");
  }

  if (decision.opponents > 1) {
    const count = decision.opponents;
    const verb = count <= 4 ? "jsou" : "je";
    const noun = count <= 4 ? "soupeři" : "soupeřů";
    notes.push(
      `Proti tobě ${verb} ${count} ${noun} — každý další snižuje tvoji šanci na výhru.`,
    );
  }

  const texture = describeTexture(decision.board);
  if (texture) notes.push(texture);

  return notes;
}

function describeTexture(board) {
  if (board.length < 3) return null;

  const suits = [0, 0, 0, 0];
  const ranks = [];
  for (const card of board) {
    suits[card & 3]++;
    ranks.push((card >> 2) + 2);
  }

  const maxSuit = Math.max(...suits);
  const unique = new Set(ranks);
  const paired = unique.size < ranks.length;

  if (maxSuit >= 4) return "Board je monotone — flush už je možný.";
  if (maxSuit === 3) return "Na boardu jsou tři karty jedné barvy — flush drawy.";
  if (paired) return "Párovaný board — častěji full house a čtyřky.";

  return null;
}

/** Ztráta v bb, vždy kladné číslo pro zobrazení. */
function lossBb(chips, bigBlind) {
  return chips / bigBlind;
}

/**
 * Ohodnotí jedno rozhodnutí. `equity` je podíl na potu proti odhadnutému
 * range soupeřů v okamžiku rozhodnutí.
 *
 * EV callu: `equity × (pot + toCall) − toCall`. Fold má EV 0.
 */
export function gradeDecision(decision, equity, bigBlind = 2) {
  const pot = decision.pot;
  const toCall = decision.toCall;
  const action = decision.action.type;

  const required = toCall > 0 ? toCall / (pot + toCall) : 0;
  const evCall = toCall > 0 ? equity * (pot + toCall) - toCall : 0;

  if (toCall > 0) {
    if (action === "fold") {
      if (evCall <= 0.01) {
        return {
          verdict: "good",
          note: "správné zahození — dorovnání by bylo ztrátové",
          evLoss: 0,
          evCall,
          required,
          equity,
        };
      }
      return {
        verdict: "mistake",
        code: "fold-with-equity",
        note: `zahození s ${pct(equity)} šancí; na dorovnání stačilo ${pct(required)} → správně: dorovnat`,
        evLoss: evCall,
        evCall,
        required,
        equity,
      };
    }

    if (action === "call") {
      if (evCall >= 0) {
        return {
          verdict: "good",
          note: `dobré dorovnání (+${decimal(lossBb(evCall, bigBlind))} bb očekávané hodnoty)`,
          evLoss: 0,
          evCall,
          required,
          equity,
        };
      }
      return {
        verdict: "mistake",
        code: "call-without-odds",
        note: `dorovnání se nevyplatilo — ${pct(equity)} proti potřebným ${pct(required)} → správně: zahodit`,
        evLoss: -evCall,
        evCall,
        required,
        equity,
      };
    }

    // Raise / all-in raise
    if (equity < required) {
      return {
        verdict: "mistake",
        code: "raise-without-odds",
        note: `zvýšení se nevyplatilo (${pct(equity)} proti potřebným ${pct(required)}) → správně: zahodit`,
        evLoss: -evCall,
        evCall,
        required,
        equity,
      };
    }

    return {
      verdict: "info",
      note: "agresivní zvýšení — bez modelu šance na fold ho neohodnotím",
      evLoss: 0,
      evCall,
      required,
      equity,
    };
  }

  // Bez sázky k dorovnání — model bet vs check (jen heads-up).
  const model = betModel(decision, equity);

  if (model) {
    if (action === "bet") {
      if (model.delta >= 0) {
        return {
          verdict: "good",
          note: `sázka má vyšší očekávanou hodnotu než check (${signedBb(model.delta, bigBlind)}, soupeř zahodí ${pct(model.fold)})`,
          evLoss: 0,
          evCall: 0,
          required: 0,
          equity,
          model,
        };
      }
      return {
        verdict: "info",
        note: `podle zjednodušeného modelu by check měl vyšší očekávanou hodnotu (${signedBb(model.delta, bigBlind)}) — není to verdikt`,
        evLoss: 0,
        evCall: 0,
        required: 0,
        equity,
        model,
      };
    }

    if (model.delta > 0.5 * bigBlind) {
      return {
        verdict: "tip",
        note: `sázka by mohla mít vyšší očekávanou hodnotu (${signedBb(model.delta, bigBlind)}, soupeř zahodí ${pct(model.fold)})`,
        evLoss: 0,
        evCall: 0,
        required: 0,
        equity,
        model,
      };
    }

    return {
      verdict: "good",
      note: "check je v pořádku",
      evLoss: 0,
      evCall: 0,
      required: 0,
      equity,
      model,
    };
  }

  // Fallback: multiway, ještě není river, nebo není proti komu sázet.
  const reason =
    decision.street !== "river"
      ? "model sázka vs check počítám jen na riveru"
      : decision.opponents !== 1
        ? "model sázka vs check počítám jen heads-up"
        : "nemáš proti komu sázet";

  if (action === "check") {
    return {
      verdict: "info",
      note: `check — ${reason}`,
      evLoss: 0,
      evCall: 0,
      required: 0,
      equity,
    };
  }

  return {
    verdict: "info",
    note: `sázka — ${reason}`,
    evLoss: 0,
    evCall: 0,
    required: 0,
    equity,
  };
}

/**
 * Exploitační pohled — druhý úhel než matematika.
 *
 * Neptá se "kolik to má EV", ale "funguje tahle akce na tohohle soupeře".
 * Proti volumečovi bluff nefunguje, i když je matematicky +EV proti jeho
 * range; proti nitovi naopak bluff funguje, i když je equity nízká.
 *
 * Je to heuristika, ne solver. Vrací null, když o soupeři nic nevíme.
 */
export function exploitVerdict(decision, equity) {
  const id = decision.aggressor ? decision.aggressor.profileId : null;
  if (!id) return null;

  const action = decision.action.type;
  const strong = equity >= 0.55;
  const weak = equity < 0.3;
  const aggressive = action === "bet" || action === "raise";

  if (id === "station" || id === "loose-passive") {
    if (aggressive) {
      if (strong) {
        return {
          verdict: "good",
          note: "Hodnotová sázka proti volumečovi — přesně to na něj funguje.",
        };
      }
      if (weak) {
        return {
          verdict: "bad",
          note: "Bluff proti volumečovi nefunguje — bude dorovnávat.",
        };
      }
      return null;
    }
    if (action === "call") {
      if (weak) {
        return {
          verdict: "bad",
          note: "Volumeč sází hlavně s hodnotou — call s takovou handou je ztrátový.",
        };
      }
      if (strong) {
        return {
          verdict: "good",
          note: "Volumeč sází i slabší — s touhle handou je call v pořádku.",
        };
      }
      return null;
    }
    if (action === "fold" && strong) {
      return {
        verdict: "bad",
        note: "Volumeč sází i slabší handy — s touhle by se nevyplácelo zahazovat.",
      };
    }
    return null;
  }

  if (id === "nit" || id === "weak-tight") {
    if (action === "call" && !strong) {
      return {
        verdict: "bad",
        note: "Nit sází hlavně silné handy — tvůj call je proti jeho rozsahu slabý.",
      };
    }
    if (action === "fold") {
      return {
        verdict: "good",
        note: "Proti nitovi je fold na tlak v pořádku.",
      };
    }
    if (aggressive && weak) {
      return {
        verdict: "good",
        note: "Bluff proti nitovi má smysl — často zahodí.",
      };
    }
    return null;
  }

  if (id === "maniac") {
    if (action === "call") {
      return {
        verdict: "good",
        note: "Maniak sází široce — dorovnání je v pořádku.",
      };
    }
    if (action === "fold" && !weak) {
      return {
        verdict: "bad",
        note: "Proti maniakovi je fold s takovou handou zbytečně těsný.",
      };
    }
    if (aggressive && weak) {
      return {
        verdict: "bad",
        note: "Bluff proti maniakovi nefunguje — dorovnává skoro všechno.",
      };
    }
    return null;
  }

  return null;
}
/**
 * Pohled přes riziko: kolik stacku jsi dal do hry a jestli to odpovídalo
 * šanci. Nehodnotí, jestli jsi vyhrál — jen jestli riziko bylo oprávněné.
 */
export function riskVerdict(decision, equity) {
  const stack = decision.stack || 0;
  const toCall = decision.toCall || 0;
  const action = decision.action.type;

  let chips = 0;
  if (action === "call") chips = toCall;
  else if (action === "bet") chips = decision.action.amount || 0;
  else if (action === "raise") {
    chips = Math.max(0, (decision.action.amount || 0) - toCall);
  }

  if (chips <= 0 || stack <= 0) return null;

  const share = Math.min(1, chips / stack);

  if (share < 0.03) {
    return {
      chips,
      share,
      verdict: "small",
      note: `Riskoval jsi jen ${pct(share)} stacku.`,
    };
  }

  if (action === "call" && toCall > 0) {
    const required = toCall / (decision.pot + toCall);
    const ok = equity >= required;

    return {
      chips,
      share,
      verdict: ok ? "ok" : "high",
      note: ok
        ? `Riskoval jsi ${pct(share)} stacku, ale s ${pct(equity)} šancí proti potřebným ${pct(required)} — oprávněné riziko.`
        : `Riskoval jsi ${pct(share)} stacku s ${pct(equity)} šancí proti potřebným ${pct(required)} — zbytečné riziko.`,
    };
  }

  return {
    chips,
    share,
    verdict: "bet",
    note: `Riskuješ ${pct(share)} stacku.`,
  };
}

export function evaluateDecision(decision, options = {}) {
  const { bigBlind = 2, iterations = 1500 } = options;
  const rng = options.rng ?? createRng(20241031);

  let rawEquity = 0.5;

  if (decision.ranges.length > 0) {
    try {
      rawEquity = equityVsRanges(
        decision.hole,
        decision.ranges,
        decision.board,
        iterations,
        rng,
      ).equity;
    } catch {
      // Prázdný range po odečtení boardu apod. — radši kontext než pád.
      rawEquity = 0.5;
    }
  }

  // Realizace equity: mimo pozici se část equity nerealizuje (nedostaneš se
  // k showdownu za rozumnou cenu). Je to hrubá konstanta, ne měření.
  const realization = decision.inPosition === false ? 0.86 : 1;
  const equity = rawEquity * realization;

  return {
    street: decision.street,
    action: decision.action.type,
    amount: decision.action.amount,
    toCall: decision.toCall,
    pot: decision.pot,
    rawEquity,
    equity,
    realization,
    ...gradeDecision(decision, equity, bigBlind),
    strategicNotes: buildStrategicNotes(decision),
    exploit: exploitVerdict(decision, equity),
    risk: riskVerdict(decision, equity),
  };
}

export function reviewHand(
  decisions,
  { bigBlind = 2, iterations = 1500, seed = 20241031 } = {},
) {
  const rng = createRng(seed);

  const items = decisions.map((decision) =>
    evaluateDecision(decision, { bigBlind, iterations, rng }),
  );

  const totalLoss = items.reduce((sum, item) => sum + item.evLoss, 0);
  const mistakes = items.filter((item) => item.verdict === "mistake").length;

  return { items, totalLoss, totalLossBb: totalLoss / bigBlind, mistakes };
}

export function formatLoss(chips, bigBlind) {
  return `−${decimal(lossBb(chips, bigBlind))} bb`;
}
