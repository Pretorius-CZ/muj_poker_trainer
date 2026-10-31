/**
 * Vstupní bod UI: drží stav, poslouchá kliknutí a posouvá hru.
 *
 * Pacing: boti nehrají okamžitě, ale s malou pauzou, aby bylo vidět, kdo
 * co udělal. Když je na řadě člověk, smyčka se zastaví a čeká.
 */

import { GameController } from "./controller.js";
import { render } from "./render.js";
import { evaluateDecision, reviewHand } from "./review.js";
import { bbToChips, clampRaise, formatBb } from "./bets.js";
import { createRng } from "../engine/rng.js";
import { SPOTS, dealHand, gradePreflop } from "./preflop.js";
import {
  appendHand,
  buildRecord,
  bumpCumulative,
  bumpTotal,
  loadCumulative,
  loadHands,
  loadTotals,
  resetHands,
  saveHands,
  seedCumulative,
} from "./session.js";

const root = document.getElementById("app");

/** Tempo botů v ms — [min, max]. Výchozí je realisticky pomalé. */
const SPEEDS = {
  slow: [1800, 3000],
  normal: [900, 1600],
  fast: [350, 700],
};

const SETTINGS_KEY = "poker-trainer:settings";

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

const saved = loadSettings();

const history = loadHands();

// Starší verze kumulativní součty nevedly — naplní se z uloženého okna.
let initialCumulative = loadCumulative();
if (Object.keys(initialCumulative).length === 0 && history.length > 0) {
  initialCumulative = seedCumulative(history);
}

const state = {
  raiseOpen: false,
  raiseTo: 0,
  review: null,
  assist: saved.assist !== false,
  speed: SPEEDS[saved.speed] ? saved.speed : "slow",
  seats: saved.seats === 6 ? 6 : 9,
  feedback: null,
  history,
  totals: loadTotals(),
  cumulative: initialCumulative,
  statsMode: "cumulative",
  showStats: false,
  showGlossary: false,
  showCheatsheet: false,
  showAdvisor: saved.showAdvisor === true,
  paused: false,
  autoPaused: false,
  preflop: {
    open: false,
    spotIndex: 0,
    cards: [],
    feedback: null,
    streak: 0,
    correct: 0,
    total: 0,
  },
};

function saveSettings() {
  try {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        assist: state.assist,
        speed: state.speed,
        seats: state.seats,
        showAdvisor: state.showAdvisor,
      }),
    );
  } catch {
    // Soukromý režim apod. — nastavení prostě nepřežije reload.
  }
}

function createGame(seats) {
  return new GameController({
    presetId: "live-soft",
    seats,
    seed: Date.now() % 1_000_000,
  });
}

let game = createGame(state.seats);
const drillRng = createRng(Date.now() % 1_000_000);

function dealPreflop() {
  state.preflop.cards = dealHand(drillRng);
  state.preflop.feedback = null;
}

function answerPreflop(action) {
  const drill = state.preflop;
  if (drill.feedback || drill.cards.length !== 2) return;

  const spot = SPOTS[drill.spotIndex];
  const result = gradePreflop(spot, drill.cards);
  const correct = action === result.action;

  drill.feedback = {
    action,
    correct,
    expected: result.action,
    percentile: result.percentile,
  };
  drill.total += 1;

  if (correct) {
    drill.correct += 1;
    drill.streak += 1;
  } else {
    drill.streak = 0;
  }

  paint();
}

function botDelay() {
  const [min, max] = SPEEDS[state.speed];
  return min + Math.random() * (max - min);
}

let botTimer = null;

function clearBotTimer() {
  if (botTimer !== null) {
    window.clearTimeout(botTimer);
    botTimer = null;
  }
}

function scheduleBot() {
  clearBotTimer();

  botTimer = window.setTimeout(() => {
    botTimer = null;

    if (state.paused || game.isComplete) return;

    const acted = game.stepBot();
    if (!acted) return;

    if (game.isComplete) {
      finish();
      return;
    }
    tick();
  }, botDelay());
}

function setPaused(value) {
  state.paused = value;
  if (value) clearBotTimer();
}

function paint() {
  render(root, game, state);
}

function finish() {
  game.settle();
  state.review = reviewHand(game.decisions, {
    bigBlind: game.table.config.bigBlind,
  });

  // Zaznamenat handu do historie session.
  const record = buildRecord(game, state.review);
  state.history = appendHand(state.history, record);
  saveHands(state.history);
  state.totals = bumpTotal(game.table.config.numSeats);
  state.cumulative = bumpCumulative(record);

  // Výsledková karta má přednost před statistikami i slovníčkem.
  state.showStats = false;
  state.showGlossary = false;
  state.showCheatsheet = false;

  paint();
}

function tick() {
  if (game.isComplete) return;

  if (state.paused) {
    paint();
    return;
  }

  if (game.isHumanTurn) {
    paint();
    return;
  }

  paint();
  scheduleBot();
}

function startHand() {
  game.startHand();
  state.raiseOpen = false;
  state.raiseTo = 0;
  state.review = null;
  state.feedback = null;
  state.paused = false;
  state.autoPaused = false;
  clearBotTimer();
  paint();
  tick();
}

function act(action) {
  if (!game.isHumanTurn) return;

  try {
    game.act(action);
  } catch (error) {
    console.error("Nelegální akce:", error);
    return;
  }

  // Nápověda: hned po akci zhodnotit, co bylo vidět na stole.
  if (state.assist) {
    const last = game.decisions[game.decisions.length - 1];
    state.feedback = last
      ? evaluateDecision(last, { bigBlind: game.table.config.bigBlind })
      : null;
  }

  state.raiseOpen = false;

  if (game.isComplete) {
    finish();
    return;
  }

  paint();
  tick();
}

/** Cílová částka pro "½ pot" apod. — vždy "raise to", ne přírůstek. */
function quickTarget(fraction) {
  const legal = game.legal();
  if (!legal) return 0;

  const me = game.hand.seats[game.humanSeat];
  const currentBet = me.committedStreet + legal.toCall;
  const potAfterCall = game.hand.pot + legal.toCall;
  const raw = currentBet + fraction * potAfterCall;

  return clampRaise(raw, legal);
}

/**
 * Synchronizuje slider, pole v BB a popisky bez překreslení celého stolu.
 * Kdyby se překreslovalo, slider by při tažení uskakoval a pole by ztratilo
 * fokus.
 */
function syncRaiseUi(amount, except = "") {
  const legal = game.legal();
  if (!legal) return;

  const bigBlind = game.table.config.bigBlind;

  if (except !== "slider") {
    const slider = root.querySelector("[data-raise-slider]");
    if (slider) slider.value = String(amount);
  }

  if (except !== "bb") {
    const bbInput = root.querySelector("[data-raise-bb]");
    if (bbInput) bbInput.value = String(Number((amount / bigBlind).toFixed(2)));
  }

  const label = root.querySelector("[data-raise-label]");
  if (label) label.textContent = formatBb(amount, bigBlind);

  const chipsLabel = root.querySelector("[data-raise-chips]");
  if (chipsLabel) chipsLabel.textContent = `${amount} žetonů`;

  const confirm = root.querySelector('[data-action="confirm-raise"]');
  if (confirm) {
    confirm.textContent = `${legal.canBet ? "Bet" : "Raise"} na ${formatBb(amount, bigBlind)}`;
  }
}

root.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  const action = button.dataset.action;

  switch (action) {
    case "next-hand":
      startHand();
      return;
    case "fold":
      act({ type: "fold" });
      return;
    case "check":
      act({ type: "check" });
      return;
    case "call":
      act({ type: "call" });
      return;
    case "toggle-raise": {
      const legal = game.legal();
      if (!legal) return;
      state.raiseOpen = true;
      state.raiseTo = legal.minRaiseTo;
      paint();
      return;
    }
    case "close-raise":
      state.raiseOpen = false;
      paint();
      return;
    case "quick":
      state.raiseTo = quickTarget(Number(button.dataset.fraction));
      syncRaiseUi(state.raiseTo);
      return;
    case "quick-bb": {
      const legal = game.legal();
      if (!legal) return;
      state.raiseTo = clampRaise(
        bbToChips(Number(button.dataset.bb), game.table.config.bigBlind),
        legal,
      );
      syncRaiseUi(state.raiseTo);
      return;
    }
    case "all-in": {
      const legal = game.legal();
      if (!legal) return;
      state.raiseTo = legal.maxRaiseTo;
      syncRaiseUi(state.raiseTo);
      return;
    }
    case "confirm-raise": {
      const legal = game.legal();
      if (!legal) return;
      act({
        type: legal.canBet ? "bet" : "raise",
        amount: state.raiseTo,
      });
      return;
    }
    case "speed": {
      const value = button.dataset.speed;
      if (SPEEDS[value]) {
        state.speed = value;
        saveSettings();
        paint();
      }
      return;
    }
    case "seats": {
      const seats = Number(button.dataset.seats);
      if (seats !== 6 && seats !== 9) return;
      if (seats === state.seats) return;

      state.seats = seats;
      saveSettings();
      game = createGame(seats);
      state.review = null;
      state.feedback = null;
      state.raiseOpen = false;
      startHand();
      return;
    }
    case "toggle-advisor":
      state.showAdvisor = !state.showAdvisor;
      saveSettings();
      paint();
      return;
    case "open-preflop":
      if (!state.paused) {
        state.autoPaused = true;
        setPaused(true);
      }
      if (state.preflop.cards.length !== 2) dealPreflop();
      state.preflop.open = true;
      paint();
      return;
    case "close-preflop":
      state.preflop.open = false;
      if (state.autoPaused) {
        state.autoPaused = false;
        setPaused(false);
        tick();
      }
      paint();
      return;
    case "preflop-next":
      dealPreflop();
      paint();
      return;
    case "preflop-raise":
      answerPreflop("raise");
      return;
    case "preflop-call":
      answerPreflop("call");
      return;
    case "preflop-fold":
      answerPreflop("fold");
      return;
    case "toggle-pause":
      if (state.paused) {
        state.autoPaused = false;
        setPaused(false);
        tick();
      } else {
        setPaused(true);
        paint();
      }
      return;
    case "open-stats":
      if (!state.paused) {
        state.autoPaused = true;
        setPaused(true);
      }
      state.showStats = true;
      paint();
      return;
    case "close-stats":
      state.showStats = false;
      if (state.autoPaused) {
        state.autoPaused = false;
        setPaused(false);
        tick();
      }
      paint();
      return;
    case "open-glossary":
      if (!state.paused) {
        state.autoPaused = true;
        setPaused(true);
      }
      state.showGlossary = true;
      paint();
      return;
    case "close-glossary":
      state.showGlossary = false;
      if (state.autoPaused) {
        state.autoPaused = false;
        setPaused(false);
        tick();
      }
      paint();
      return;
    case "open-cheatsheet":
      if (!state.paused) {
        state.autoPaused = true;
        setPaused(true);
      }
      state.showCheatsheet = true;
      paint();
      return;
    case "close-cheatsheet":
      state.showCheatsheet = false;
      if (state.autoPaused) {
        state.autoPaused = false;
        setPaused(false);
        tick();
      }
      paint();
      return;
    case "clear-history": {
      if (window.confirm("Vymazat historii hand?")) {
        state.history = resetHands() ?? [];
        state.totals = {};
        state.cumulative = {};
        paint();
      }
      return;
    }
    case "stats-cumulative":
    case "stats-window":
      state.statsMode = action === "stats-window" ? "window" : "cumulative";
      paint();
      return;
    default:
      return;
  }
});

root.addEventListener("input", (event) => {
  const legal = game.legal();
  if (!legal) return;

  const bigBlind = game.table.config.bigBlind;

  const slider = event.target.closest("[data-raise-slider]");
  if (slider) {
    state.raiseTo = clampRaise(Number(slider.value), legal);
    syncRaiseUi(state.raiseTo, "slider");
    return;
  }

  const bbInput = event.target.closest("[data-raise-bb]");
  if (bbInput) {
    const value = Number(bbInput.value);
    if (!Number.isFinite(value) || value <= 0) return;

    state.raiseTo = clampRaise(bbToChips(value, bigBlind), legal);
    syncRaiseUi(state.raiseTo, "bb");
  }
});

// Po opuštění pole v BB se hodnota srovná na skutečnou sázku — kdyby uživatel
// napsal méně, než je min-raise, uvidí, na co se to opravdu vyšplhalo.
root.addEventListener("change", (event) => {
  const assist = event.target.closest("[data-assist]");
  if (assist) {
    state.assist = assist.checked;
    if (!state.assist) state.feedback = null;
    saveSettings();
    paint();
    return;
  }

  const spotSelect = event.target.closest("[data-preflop-spot]");
  if (spotSelect) {
    const index = Number(spotSelect.value);
    if (Number.isInteger(index) && SPOTS[index]) {
      state.preflop.spotIndex = index;
      dealPreflop();
      paint();
    }
    return;
  }

  const bbInput = event.target.closest("[data-raise-bb]");
  if (!bbInput) return;

  const legal = game.legal();
  if (!legal) return;

  bbInput.value = String(
    Number((state.raiseTo / game.table.config.bigBlind).toFixed(2)),
  );
});

window.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLInputElement) return;
  if (!game.isHumanTurn) return;

  const legal = game.legal();
  if (!legal) return;

  const key = event.key.toLowerCase();
  if (key === "f" && legal.canFold) act({ type: "fold" });
  if (key === "c" && legal.canCheck) act({ type: "check" });
});

startHand();
