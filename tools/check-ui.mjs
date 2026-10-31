/**
 * Kontrola UI bez prohlížeče.
 *
 * Odehraje celou handu a po každé akci zavolá render() — tím projde všechny
 * stavy (preflop, flop, all-in, showdown, výsledková karta) a odhalí chyby,
 * které by jinak spadly až v prohlížeči.
 *
 * Spuštění: node tools/check-ui.mjs
 */

import { GameController } from "../web/app/controller.js";
import { render } from "../web/app/render.js";
import { evaluateDecision, reviewHand } from "../web/app/review.js";
import { appendHand, buildRecord } from "../web/app/session.js";
import { parseCards } from "../web/engine/cards.js";

const game = new GameController({ seed: 42 });
const state = {
  raiseOpen: false,
  raiseTo: 0,
  review: null,
  assist: true,
  speed: "slow",
  feedback: null,
  history: [],
  showStats: false,
};
const root = { innerHTML: "" };

function check(label) {
  render(root, game, state);
  if (!root.innerHTML || root.innerHTML.length < 200) {
    throw new Error(`Render je prázdný ve fázi "${label}"`);
  }
  if (root.innerHTML.includes("undefined")) {
    throw new Error(`Render obsahuje "undefined" ve fázi "${label}"`);
  }
  if (root.innerHTML.includes("NaN")) {
    throw new Error(`Render obsahuje "NaN" ve fázi "${label}"`);
  }
}

game.startHand();
check("start");

if (!root.innerHTML.includes("Tvoje handa")) {
  throw new Error("Chybí čtečka handy");
}
if (!root.innerHTML.includes("Pauza")) {
  throw new Error("Chybí tlačítko pauzy");
}

let steps = 0;
while (!game.isComplete) {
  if (++steps > 1000) throw new Error("Handa se zacyklila");

  if (game.isHumanTurn) {
    const legal = game.legal();
    if (!legal) throw new Error("Na tahu člověka chybí legální akce");

    // Jednou si otevřeme raise panel, ať se otestuje i ten.
    if (steps === 3 && (legal.canBet || legal.canRaise)) {
      state.raiseOpen = true;
      state.raiseTo = legal.minRaiseTo;
      check("raise panel");

      if (!root.innerHTML.includes("data-raise-bb")) {
        throw new Error("V raise panelu chybí pole pro sázku v BB");
      }
      if (!root.innerHTML.includes("Vsadit v BB")) {
        throw new Error("V raise panelu chybí popisek BB");
      }

      state.raiseOpen = false;
    }

    game.act(legal.canCheck ? { type: "check" } : { type: "call" });

    const last = game.decisions[game.decisions.length - 1];
    state.feedback = evaluateDecision(last, {
      bigBlind: game.table.config.bigBlind,
    });
  } else {
    game.stepBot();
  }

  check(`krok ${steps}`);
}

game.settle();
state.review = reviewHand(game.decisions, {
  bigBlind: game.table.config.bigBlind,
});
state.history = appendHand(state.history, buildRecord(game, state.review));
check("výsledek");

// Statistiky session
state.showStats = true;
check("statistiky");
if (!root.innerHTML.includes("Statistiky session")) {
  throw new Error("Chybí modal se statistikami");
}
if (!root.innerHTML.includes("VPIP") || !root.innerHTML.includes("Agresivita")) {
  throw new Error("Chybí metriky ve statistikách");
}
if (!root.innerHTML.includes("Historie hand")) {
  throw new Error("Chybí historie hand");
}
if (!root.innerHTML.includes("Co znamenají zkratky")) {
  throw new Error("Chybí vysvětlivky statistik");
}
if (!root.innerHTML.includes("cíl")) {
  throw new Error("Chybí cílová pásma ve statistikách");
}
state.showStats = false;
check("po statistikách");

// Slovníček
state.showGlossary = true;
check("slovníček");
if (!root.innerHTML.includes("Šance na výhru")) {
  throw new Error("Chybí slovníček pojmů");
}
state.showGlossary = false;
check("po slovníčku");

// Tahák
state.showCheatsheet = true;
check("tahák");
if (!root.innerHTML.includes("Tahák na počítání v hlavě")) {
  throw new Error("Chybí tahák");
}
if (!root.innerHTML.includes("Outy")) {
  throw new Error("Chybí tabulka outů");
}
if (!root.innerHTML.includes("Příklad:")) {
  throw new Error("Chybí příklad v taháku");
}
state.showCheatsheet = false;
check("po taháku");

const html = root.innerHTML;

if (!html.includes("position-bar")) throw new Error("Chybí lišta pozic");
if (!html.includes("sedíš na")) throw new Error("Chybí informace o pozici");
if (!html.includes("Nápověda při hře")) throw new Error("Chybí přepínač nápovědy");
if (!html.includes('class="coach')) throw new Error("Chybí nápověda k akci");
if (!html.includes("modal-card")) throw new Error("Chybí výsledková karta");
if (!html.includes("Další handa")) throw new Error("Chybí tlačítko další handy");
if (!html.includes("is-hero")) throw new Error("Chybí hráčův seat u stolu");
if (!html.includes("Tvoje rozhodnutí")) throw new Error("Chybí review rozhodnutí");
if (game.decisions.length === 0) throw new Error("Nezaznamenala se žádná rozhodnutí");

const reviewed = (html.match(/class="review-row/g) ?? []).length;
if (reviewed !== game.decisions.length) {
  throw new Error(
    `Review má ${reviewed} řádků, ale rozhodnutí bylo ${game.decisions.length}`,
  );
}

const seats = (html.match(/class="seat(?=[" ])/g) ?? []).length;
if (seats !== 9) throw new Error(`Čekal jsem 9 seatů u stolu, je jich ${seats}`);

// 6-max render
const sixGame = new GameController({ seed: 9, seats: 6 });
sixGame.startHand();
const sixRoot = { innerHTML: "" };
const sixState = {
  ...state,
  history: [],
  showStats: false,
  showGlossary: false,
  showCheatsheet: false,
  paused: false,
  feedback: null,
};
render(sixRoot, sixGame, sixState);

const sixSeats = (sixRoot.innerHTML.match(/class="seat(?=[" ])/g) ?? []).length;
if (sixSeats !== 6) {
  throw new Error(`6-max má mít 6 seatů, má ${sixSeats}`);
}
const sixPositions = (sixRoot.innerHTML.match(/class="pos-chip/g) ?? []).length;
if (sixPositions !== 6) {
  throw new Error(`6-max má mít 6 pozic v liště, má ${sixPositions}`);
}
if (!sixRoot.innerHTML.includes("6-max")) {
  throw new Error("Chybí přepínač 6-max");
}

// Boční solver
const advGame = new GameController({ seed: 3, seats: 6 });
advGame.startHand();
let advGuard = 0;
while (!advGame.isHumanTurn && !advGame.isComplete && advGuard++ < 200) {
  advGame.stepBot();
}
const advRoot = { innerHTML: "" };
render(advRoot, advGame, { ...state, history: [], showAdvisor: true });
if (!advRoot.innerHTML.includes("Preflop chart")) {
  throw new Error("Chybí preflop chart v panelu");
}
if (!advRoot.innerHTML.includes("Tabulka")) {
  throw new Error("Chybí tabulka v panelu");
}

// Preflop trenér
const preflopRoot = { innerHTML: "" };
render(preflopRoot, sixGame, {
  ...state,
  history: [],
  showAdvisor: false,
  preflop: {
    open: true,
    spotIndex: 0,
    cards: parseCards("As Ks"),
    feedback: null,
    streak: 0,
    correct: 0,
    total: 0,
  },
});
if (!preflopRoot.innerHTML.includes("Preflop 6-max")) {
  throw new Error("Chybí preflop trenér");
}
if (!preflopRoot.innerHTML.includes("Tabulka pro tuhle pozici")) {
  throw new Error("Chybí tabulka range");
}

console.log("✓ UI prošlo celou handou");
console.log(`  akcí: ${steps}`);
console.log(`  rozhodnutí k review: ${game.decisions.length}`);
console.log(`  chyb podle matematiky: ${state.review.mistakes}`);
console.log(`  velikost HTML: ${(html.length / 1024).toFixed(1)} kB`);
console.log(`  seatů u stolu: ${seats}`);
console.log(`  showdown: ${game.hand.result.showdown}`);
