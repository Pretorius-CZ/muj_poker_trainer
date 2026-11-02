/**
 * Vykreslení stolu. Jen funkce, které ze stavu udělají HTML.
 *
 * Záměrně žádný framework: stav je malý, překresluje se celý stůl po každé
 * akci a je to rychlé. Díky tomu je UI čitelné a dá se ladit v prohlížeči.
 */

import { positionName } from "./controller.js";
import { formatBb, formatSignedBb } from "./bets.js";
import { formatLoss } from "./review.js";
import { computeStats, cumulativeStats } from "./session.js";
import { readHolding } from "./handread.js";
import { advise } from "./advisor.js";
import { SPOTS, chartCells, percentText, preflopAdvice } from "./preflop.js";

const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const SUITS = ["♣", "♦", "♥", "♠"];

const STREET_LABELS = {
  preflop: "preflop",
  flop: "flop",
  turn: "turn",
  river: "river",
  showdown: "karty na stole",
  complete: "konec",
};

/**
 * Pořadí pozic preflop: od první na řadě (UTG) po big blind.
 * Pro 6-max to je UTG, MP, CO, BTN, SB, BB.
 */
function positionOrder(seats) {
  const order = [];
  for (let offset = 3; offset < seats; offset++) {
    order.push(positionName(offset, seats));
  }
  order.push("BTN", "SB", "BB");
  return order;
}

const POSITION_HINTS = {
  UTG: "první na řadě, nejhorší pozice",
  "UTG+1": "brzká pozice",
  "UTG+2": "brzká pozice",
  MP: "střední pozice",
  HJ: "hijack — před cutoffem",
  CO: "cutoff — dvě místa před buttonem",
  BTN: "button — nejlepší pozice, jednáš poslední",
  SB: "malý blind",
  BB: "velký blind",
};

function chips(value) {
  return Number(value).toLocaleString("cs-CZ");
}

export function cardHtml(card, { hidden = false, small = false } = {}) {
  const size = small ? " small" : "";
  if (hidden) return `<div class="card back${size}"></div>`;

  const rank = RANKS[card >> 2];
  const suit = card & 3;
  const red = suit === 1 || suit === 2;

  return (
    `<div class="card ${red ? "red" : "black"}${size}">` +
    `<span class="rank">${rank}</span>` +
    `<span class="suit">${SUITS[suit]}</span>` +
    `</div>`
  );
}

function lastAction(hand, seat) {
  for (let index = hand.log.length - 1; index >= 0; index--) {
    const event = hand.log[index];
    if (event.seat === seat) return event;
  }
  return null;
}

function actionLabel(event) {
  switch (event.action) {
    case "fold":
      return "zahodil";
    case "check":
      return "check";
    case "call":
      return `dorovnal ${event.added}`;
    case "bet":
      return `vsadil ${event.raiseTo}`;
    case "raise":
      return `zvýšil na ${event.raiseTo}`;
    default:
      return event.action;
  }
}

/**
 * Pozice sedadla na obrazovce.
 *
 * Ty jsi vždy dole (offset 0), soupeři jdou po směru hodinových ručiček.
 * Díky tomu odpovídá pořadí na obrazovce pořadí akcí — další na řadě je
 * vždycky ten další po směru.
 */
function seatPosition(game, seat) {
  const count = game.table.config.numSeats;
  const offset = (seat - game.humanSeat + count) % count;
  const angle = 90 + offset * (360 / count);
  const radians = (angle * Math.PI) / 180;

  return {
    left: 50 + 40 * Math.cos(radians),
    top: 50 + 36 * Math.sin(radians),
  };
}

function seatHtml(game, seat, ui) {
  const hand = game.hand;
  const state = hand.seats[seat];
  const profile = game.profiles[seat];
  const position = game.positionOf(seat);
  const isHero = seat === game.humanSeat;

  const showdown = hand.complete && hand.result && hand.result.showdown;
  const reveal = isHero || (showdown && !state.folded);
  const isActor = !hand.complete && hand.actor === seat;
  const last = lastAction(hand, seat);
  const spot = seatPosition(game, seat);

  const holding =
    isHero && ui && ui.assist && !state.folded && state.hole.length === 2
      ? readHolding(state.hole, hand.board)
      : null;

  const classes = ["seat"];
  if (isHero) classes.push("is-hero");
  if (state.folded) classes.push("folded");
  if (state.allIn) classes.push("allin");
  if (isActor) classes.push("active");

  return `
    <div class="${classes.join(" ")}" style="left:${spot.left.toFixed(2)}%; top:${spot.top.toFixed(2)}%">
      <div class="seat-head">
        <span class="pos">${position}</span>
        ${hand.button === seat ? '<span class="dealer">D</span>' : ""}
        <span class="stack">${chips(state.stack)}</span>
      </div>
      <div class="seat-name">${isHero ? "Ty" : profile.name}</div>
      <div class="seat-cards">
        ${state.hole.map((card) => cardHtml(card, { hidden: !reveal, small: !isHero })).join("")}
      </div>
      <div class="seat-foot">
        ${holding && hand.board.length > 0 ? `<span class="tag hand">${holding.short}</span>` : ""}
        ${state.folded ? '<span class="tag fold">fold</span>' : ""}
        ${state.allIn ? '<span class="tag allin">all-in</span>' : ""}
        ${!state.folded && !state.allIn && last ? `<span class="tag">${actionLabel(last)}</span>` : ""}
      </div>
      ${state.committedStreet > 0 ? `<div class="bet">${chips(state.committedStreet)}</div>` : ""}
    </div>`;
}

const SPEED_OPTIONS = [
  { id: "slow", label: "pomalá" },
  { id: "normal", label: "normální" },
  { id: "fast", label: "rychlá" },
];

function settingsHtml(state) {
  const speedButtons = SPEED_OPTIONS.map(
    (option) =>
      `<button class="seg ${state.speed === option.id ? "active" : ""}" ` +
      `data-action="speed" data-speed="${option.id}">${option.label}</button>`,
  ).join("");

  return `
    <div class="settings">
      <label class="assist-toggle" title="Po každé akci zhodnotí, co bylo vidět na stole">
        <input type="checkbox" data-assist ${state.assist ? "checked" : ""} />
        <span>Nápověda při hře</span>
      </label>
      <div class="settings-controls">
        <div class="speed">
          <span class="speed-label">Stůl</span>
          <button class="seg ${state.seats === 6 ? "active" : ""}" data-action="seats" data-seats="6">6-max</button>
          <button class="seg ${state.seats === 9 ? "active" : ""}" data-action="seats" data-seats="9">9-max</button>
        </div>
        <button class="seg ${state.paused ? "active" : ""}" data-action="toggle-pause">
          ${state.paused ? "Pokračovat" : "Pauza"}
        </button>
        <div class="speed">
          <span class="speed-label">Rychlost</span>
          ${speedButtons}
        </div>
        <button class="btn small" data-action="open-glossary">Slovníček</button>
        <button class="btn small" data-action="open-cheatsheet">Tahák</button>
        <button class="seg ${state.showAdvisor ? "active" : ""}" data-action="toggle-advisor">Solver</button>
        <button class="btn small" data-action="open-preflop">Preflop dril</button>
      </div>
    </div>`;
}

const CHEAT_OUTS = [
  ["4 — vnitřní postupka", "17 %", "9 %"],
  ["6 — dvě vyšší karty", "24 %", "13 %"],
  ["8 — oboustranná postupka", "32 %", "17 %"],
  ["9 — tažení na barvu", "35 %", "20 %"],
  ["12 — barva i postupka", "45 %", "26 %"],
  ["15 — barva i oboustranná postupka", "54 %", "33 %"],
  ["2 — na trojici", "8 %", "4 %"],
];

const CHEAT_POT = [
  ["1/3 potu", "20 %"],
  ["1/2 potu", "25 %"],
  ["2/3 potu", "29 %"],
  ["3/4 potu", "30 %"],
  ["pot", "33 %"],
  ["1,5× pot", "38 %"],
];

function cheatsheetModalHtml(state) {
  if (!state.showCheatsheet) return "";

  const outsRows = CHEAT_OUTS.map(
    ([outs, flop, turn]) =>
      `<tr><td>${outs}</td><td>${flop}</td><td>${turn}</td></tr>`,
  ).join("");

  const potRows = CHEAT_POT.map(
    ([bet, need]) => `<tr><td>${bet}</td><td>${need}</td></tr>`,
  ).join("");

  return `
    <div class="modal">
      <div class="modal-card cheat-card">
        <h2>Tahák na počítání v hlavě</h2>

        <p class="cheat-intro">
          <strong>Outy</strong> (zlepšující karty) jsou karty, které tě zlepší.
          Na flopu (2 karty k příchodu) násob <strong>4</strong>, na turnu
          (1 karta) <strong>2,2</strong>.
        </p>

        <table class="cheat-table">
          <thead><tr><th>Outy</th><th>Flop</th><th>Turn</th></tr></thead>
          <tbody>${outsRows}</tbody>
        </table>

        <div class="cheat-example">
          <strong>Příklad:</strong> A♥ K♥ na Q♥ 7♥ 2♣. Srdcí zbývá 9
          (J, T, 9, 8, 6, 5, 4, 3, 2) → 9 outů. Flop: 9 × 4 = 36 %.
          Turn: 9 × 2,2 ≈ 20 %.
        </div>

        <p class="cheat-tip">
          U víc než 8 outů na flopu od součinu odečti (outy − 8): 15 outů →
          60 − 7 = 53 %.
        </p>

        <h3>Kolik potřebuješ dorovnat</h3>

        <table class="cheat-table">
          <thead><tr><th>Soupeř vsadí</th><th>Potřebná šance</th></tr></thead>
          <tbody>${potRows}</tbody>
        </table>

        <p class="cheat-tip">
          Vzorec: <strong>co platíš / (co je v potu + co platíš)</strong>.
          Pot včetně soupeřovy sázky.
        </p>

        <p class="cheat-note">
          Pozor na „špinavé outy": čtyři karty jedné barvy na stole nemusí být
          tvoje tažení na barvu, když soupeř může mít full house. Když
          pochybuješ, uber jedno nebo dvě.
        </p>

        <button class="btn primary wide" data-action="close-cheatsheet">Zavřít</button>
      </div>
    </div>`;
}

const GLOSSARY = [
  [
    "Šance na výhru (equity)",
    "Kolik procent času tvoje handa vyhraje, když se dorozdá board. 30 % znamená, že v průměru vyhraješ 3 případy z 10.",
  ],
  [
    "Cena dorovnání (pot odds)",
    "Kolik musíš zaplatit vůči tomu, co je v potu. Když platíš 20 do potu 60, platíš 25 % — a potřebuješ víc než 25% šanci, aby se to vyplatilo.",
  ],
  [
    "Očekávaná hodnota (EV)",
    "Průměrný zisk nebo ztráta rozhodnutí, když ho zopakuješ mockrát. +2 bb znamená, že ti rozhodnutí v průměru vydělá 2 bb.",
  ],
  [
    "Šance na fold (fold equity)",
    "Jak často soupeř zahodí, když vsadíš. Čím víc foldne, tím víc se vyplatí sázet i s horší handou.",
  ],
  [
    "Rozsah (range)",
    "Všechny handy, které soupeř může mít — ne jedna konkrétní. Podle jeho akcí se rozsah zužuje.",
  ],
  ["Showdown", "Porovnání karet na konci handy, když zůstanou aspoň dva hráči."],
  ["All-in", "Vsazení všech zbývajících žetonů."],
  [
    "VPIP",
    "Jak často dobrovolně vložíš žetony preflop. Vysoké VPIP znamená, že hraješ hodně hand.",
  ],
  [
    "PFR",
    "Jak často preflop zvýšíš. Rozdíl mezi VPIP a PFR ukazuje, jak jsi pasivní.",
  ],
  [
    "Agresivita (AF)",
    "Poměr sázek a zvýšení ku dorovnáním. Pod 1 = pasivní, 2–4 = vyvážená, nad 4 = agresivní.",
  ],
];

function glossaryModalHtml(state) {
  if (!state.showGlossary) return "";

  const terms = GLOSSARY.map(
    ([term, text]) => `<dt>${term}</dt><dd>${text}</dd>`,
  ).join("");

  return `
    <div class="modal">
      <div class="modal-card glossary-card">
        <h2>Slovníček</h2>
        <dl class="glossary">${terms}</dl>
        <button class="btn primary wide" data-action="close-glossary">Zavřít</button>
      </div>
    </div>`;
}

const COACH_TITLES = {
  good: "Matematicky v pořádku",
  mistake: "Matematicky ztrátové",
  tip: "Tip",
  info: "Kontext",
};

function coachHtml(feedback, bigBlind) {
  if (!feedback) return "";

  const equityLabel =
    feedback.realization < 1
      ? `šance ${Math.round(feedback.equity * 100)} % (mimo pozici)`
      : `šance ${Math.round(feedback.equity * 100)} %`;

  const metrics = [
    equityLabel,
    feedback.toCall > 0
      ? `potřebné ${Math.round(feedback.required * 100)} %`
      : null,
    feedback.evLoss > 0 ? formatLoss(feedback.evLoss, bigBlind) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const notes = (feedback.strategicNotes ?? [])
    .map((note) => `<li>${note}</li>`)
    .join("");

  return `
    <div class="coach ${feedback.verdict}">
      <div class="coach-head">
        <strong>${COACH_TITLES[feedback.verdict] ?? "Kontext"}</strong>
        <span>${STREET_SHORT[feedback.street] ?? feedback.street}</span>
      </div>
      <p>${feedback.note}</p>
      <div class="coach-metrics">${metrics}</div>
      ${
        feedback.exploit && feedback.exploit.note
          ? `<div class="coach-exploit ${feedback.exploit.verdict}">
              <span>Exploit</span>${feedback.exploit.note}
            </div>`
          : ""
      }
      ${
        feedback.risk
          ? `<div class="coach-risk ${feedback.risk.verdict ?? "ok"}">
              <span>Riziko</span>${feedback.risk.note}
            </div>`
          : ""
      }
      ${notes ? `<div class="coach-strategy"><span>Strategie</span><ul>${notes}</ul></div>` : ""}
    </div>`;
}

function positionBarHtml(game) {
  const seats = game.table.config.numSeats;
  const heroPosition = game.positionOf(game.humanSeat);

  const chipsHtml = positionOrder(seats)
    .map((position) => {
      const classes = ["pos-chip"];
      if (position === heroPosition) classes.push("mine");
      if (position === "BTN") classes.push("button-pos");
      return `<span class="${classes.join(" ")}" title="${POSITION_HINTS[position] ?? ""}">${position}</span>`;
    })
    .join("");

  return `
    <div class="position-bar">
      <span class="position-label">pozice</span>
      <div class="position-chips">${chipsHtml}</div>
      <span class="position-now">sedíš na <strong>${heroPosition}</strong></span>
    </div>`;
}

function boardHtml(game) {
  const hand = game.hand;
  const slots = [];
  for (let index = 0; index < 5; index++) {
    slots.push(
      index < hand.board.length
        ? cardHtml(hand.board[index])
        : '<div class="card empty"></div>',
    );
  }

  return `
    <div class="board-area">
      <div class="pot">
        <span class="pot-label">pot</span>
        <strong>${chips(hand.pot)}</strong>
        <em>${Math.round(hand.pot / game.table.config.bigBlind)} bb</em>
      </div>
      <div class="board-cards">${slots.join("")}</div>
      <div class="street">${STREET_LABELS[hand.street] ?? hand.street}</div>
    </div>`;
}

function turnLabel(game) {
  const actor = game.hand.actor;
  if (actor === null) return "Handa skončila";
  if (actor === game.humanSeat) return "Jsi na řadě";
  return `Na řadě: ${game.nameOf(actor)} (${game.positionOf(actor)})`;
}

function holdingHtml(game, state) {
  if (!state.assist) return "";

  const hand = game.hand;
  const me = hand.seats[game.humanSeat];
  if (!me || me.folded || me.hole.length !== 2) return "";

  const holding = readHolding(me.hole, hand.board);
  if (!holding) return "";

  return `
    <div class="holding">
      <span class="holding-label">Tvoje handa</span>
      <strong>${holding.made}</strong>
      ${holding.draws.length > 0 ? `<em>${holding.draws.join(" · ")}</em>` : ""}
    </div>`;
}

function actionBarHtml(game, state) {
  const legal = game.legal();
  const isMyTurn = game.hand.actor === game.humanSeat;

  return `
    <section class="action-bar">
      <div class="action-head">
        <span class="${isMyTurn ? "turn mine" : "turn"}">${turnLabel(game)}</span>
        ${state.paused ? '<span class="paused-badge">Pauza</span>' : ""}
      </div>
      ${holdingHtml(game, state)}
      ${controlsHtml(game, state, legal)}
      ${state.assist ? coachHtml(state.feedback, game.table.config.bigBlind) : ""}
    </section>`;
}

function controlsHtml(game, state, legal) {
  if (!game.hand || game.hand.complete) return "";

  if (!legal) {
    return `<div class="waiting">${state.paused ? "Hra je pozastavená" : "Soupeř přemýšlí"}<span class="dots"></span></div>`;
  }

  const canAggress = legal.canBet || legal.canRaise;
  const amount = Math.max(
    legal.minRaiseTo,
    Math.min(legal.maxRaiseTo, state.raiseTo || legal.minRaiseTo),
  );
  state.raiseTo = amount;

  const buttons = [];

  buttons.push(
    `<button class="btn" data-action="fold" ${legal.canFold ? "" : "disabled"}>Zahodit</button>`,
  );

  if (legal.canCheck) {
    buttons.push(`<button class="btn" data-action="check">Check</button>`);
  }
  if (legal.canCall) {
    buttons.push(
      `<button class="btn" data-action="call">Dorovnat ${chips(legal.toCall)}</button>`,
    );
  }
  if (canAggress) {
    buttons.push(
      `<button class="btn primary" data-action="toggle-raise">${legal.canBet ? "Vsadit" : "Zvýšit"}</button>`,
    );
  }

  const raisePanel = state.raiseOpen && canAggress
    ? `
      <div class="raise">
        <div class="raise-head">
          <span>Velikost</span>
          <strong data-raise-label>${formatBb(amount, game.table.config.bigBlind)}</strong>
        </div>
        <input
          type="range"
          min="${legal.minRaiseTo}"
          max="${legal.maxRaiseTo}"
          step="1"
          value="${amount}"
          data-raise-slider
        />
        <div class="raise-bb">
          <label for="raise-bb">Vsadit v BB</label>
          <input
            id="raise-bb"
            type="number"
            step="0.5"
            min="${Number((legal.minRaiseTo / game.table.config.bigBlind).toFixed(2))}"
            max="${Number((legal.maxRaiseTo / game.table.config.bigBlind).toFixed(2))}"
            value="${Number((amount / game.table.config.bigBlind).toFixed(2))}"
            data-raise-bb
          />
          <span class="raise-chips" data-raise-chips>${chips(amount)} žetonů</span>
        </div>
        <div class="raise-quick">
          <button class="chip-btn" data-action="quick-bb" data-bb="2.5">2,5 bb</button>
          <button class="chip-btn" data-action="quick-bb" data-bb="3">3 bb</button>
          <button class="chip-btn" data-action="quick-bb" data-bb="5">5 bb</button>
          <button class="chip-btn" data-action="quick" data-fraction="0.5">½ potu</button>
          <button class="chip-btn" data-action="quick" data-fraction="1">pot</button>
          <button class="chip-btn" data-action="all-in">all-in</button>
          <button class="chip-btn" data-action="close-raise">zavřít</button>
        </div>
        <button class="btn primary wide" data-action="confirm-raise">
          ${legal.canBet ? "Vsadit" : "Zvýšit"} na ${formatBb(amount, game.table.config.bigBlind)}
        </button>
      </div>`
    : "";

  return `<div class="btn-row">${buttons.join("")}</div>${raisePanel}`;
}

const STREET_SHORT = {
  preflop: "preflop",
  flop: "flop",
  turn: "turn",
  river: "river",
};

function actionText(item) {
  switch (item.action) {
    case "fold":
      return "fold";
    case "check":
      return "check";
    case "call":
      return `call ${item.toCall}`;
    case "bet":
      return `bet ${item.amount}`;
    case "raise":
      return `raise ${item.amount}`;
    default:
      return item.action;
  }
}

function mistakesLabel(count) {
  if (count === 1) return "1 chyba";
  if (count >= 2 && count <= 4) return `${count} chyby`;
  return `${count} chyb`;
}

function reviewHtml(review, bigBlind) {
  if (!review) return "";

  if (review.items.length === 0) {
    return `
      <div class="review">
        <h3>Tvoje rozhodnutí</h3>
        <p class="review-note">V této handě jsi neudělal žádné rozhodnutí.</p>
      </div>`;
  }

  const icons = { good: "✓", mistake: "✗", tip: "!", info: "•" };

  const actionLabels = {
    call: "dorovnání",
    check: "check",
    bet: "sázka",
    raise: "zvýšení",
    fold: "zahození",
  };

  const improvements = review.items
    .filter((item) => item.verdict === "mistake" && item.evLoss > 0)
    .sort((first, second) => second.evLoss - first.evLoss)
    .slice(0, 3);

  const improveHtml =
    improvements.length > 0
      ? `<div class="improve">
          <h4>Co šlo udělat líp</h4>
          <ul>
            ${improvements
              .map((item) => {
                const correct = item.note.includes("→ správně:")
                  ? item.note.split("→ správně:")[1].trim()
                  : null;
                const label = actionLabels[item.action] ?? item.action;

                return `<li><span class="imp-street">${STREET_SHORT[item.street] ?? item.street}</span>${label}${
                  correct ? ` → ${correct}` : ""
                }<em>${formatLoss(item.evLoss, bigBlind)}</em></li>`;
              })
              .join("")}
          </ul>
        </div>`
      : `<p class="review-note">Podle modelu žádné ztrátové rozhodnutí — není co opravovat.</p>`;

  const rows = review.items
    .map((item) => {
      const odds =
        item.toCall > 0 ? `potřebné ${Math.round(item.required * 100)} %` : "—";
      const loss = item.evLoss > 0 ? formatLoss(item.evLoss, bigBlind) : "";
      const strategy = [
        ...(item.strategicNotes ?? []),
        item.exploit && item.exploit.note ? item.exploit.note : null,
        item.risk && item.risk.note ? item.risk.note : null,
      ]
        .filter(Boolean)
        .join(" ");

      return `
        <div class="review-row ${item.verdict}">
          <span class="rv-street">${STREET_SHORT[item.street] ?? item.street}</span>
          <span class="rv-action">${actionText(item)}</span>
          <span class="rv-eq">${Math.round(item.equity * 100)} %</span>
          <span class="rv-odds">${odds}</span>
          <span class="rv-verdict">
            <i>${icons[item.verdict] ?? "•"}</i>${item.note}
            ${strategy ? `<em class="rv-strategy">${strategy}</em>` : ""}
          </span>
          <span class="rv-loss">${loss}</span>
        </div>`;
    })
    .join("");

  const summary =
    review.mistakes > 0
      ? `<p class="review-summary bad">${mistakesLabel(review.mistakes)} · celkem −${review.totalLossBb.toFixed(1).replace(".", ",")} bb</p>`
      : `<p class="review-summary good">Podle matematiky bez chyby.</p>`;

  return `
    <div class="review">
      <h3>Tvoje rozhodnutí</h3>
      ${improveHtml}
      <div class="review-legend">
        <span>kolo</span><span>akce</span><span>šance</span><span>potřebné</span>
      </div>
      ${rows}
      ${summary}
      <p class="review-note">
        Hodnocení kombinuje <strong>matematiku</strong> (šance na výhru proti
        odhadnutému rozsahu, cena dorovnání) se <strong>strategií</strong>
        (pozice, typ soupeře, šance na fold, karty na stole). Není to
        dokonalé: model nevidí tvoje čtení, jak tě soupeři vidí, ani
        předchozí handy. Sázku a check počítá zjednodušený model pro jeden
        street, takže u nich ber verdikt s rezervou.
      </p>
    </div>`;
}

function resultHtml(game, state) {
  const hand = game.hand;
  if (!hand || !hand.complete || !hand.result) return "";

  const result = hand.result;

  const totals = new Map();
  for (const payout of result.payouts) {
    totals.set(payout.seat, (totals.get(payout.seat) ?? 0) + payout.amount);
  }

  const winners = new Set();
  for (const pot of result.pots) {
    for (const seat of pot.winnerSeats) winners.add(seat);
  }

  const rows = result.hands
    .map((entry) => {
      const won = winners.has(entry.seat);
      const gained = totals.get(entry.seat);
      return `
        <div class="result-row ${won ? "winner" : ""}">
          <span class="who">${game.nameOf(entry.seat)}</span>
          <span class="cards">${entry.cards.map((card) => cardHtml(card, { small: true })).join("")}</span>
          <span class="hand">${entry.name}</span>
          <span class="delta">${gained ? `+${chips(gained)}` : ""}</span>
        </div>`;
    })
    .join("");

  const summary = [...totals.entries()]
    .map(
      ([seat, amount]) =>
        `<div class="payline"><strong>${game.nameOf(seat)}</strong> vyhrává ${chips(amount)}</div>`,
    )
    .join("");

  return `
    <div class="modal">
      <div class="modal-card">
        <h2>${result.showdown ? "Karty na stole" : "Nikdo nedorovnal"}</h2>
        <div class="modal-board">
          ${hand.board.map((card) => cardHtml(card, { small: true })).join("")}
        </div>
        <div class="result-table">${rows}</div>
        <div class="paylines">${summary}</div>
        ${reviewHtml(state.review, game.table.config.bigBlind)}
        <button class="btn primary wide" data-action="next-hand">Další handa</button>
      </div>
    </div>`;
}

function statCard(label, value, sub = "", className = "") {
  const cls = className ? ` class="${className}"` : "";

  return `
    <div class="stat">
      <span>${label}</span>
      <strong${cls}>${value}</strong>
      ${sub ? `<em>${sub}</em>` : ""}
    </div>`;
}

function signedBbPer100(value) {
  const rounded = Math.abs(value).toFixed(1).replace(".", ",");
  return `${value >= 0 ? "+" : "−"}${rounded} bb/100`;
}

const STAT_HELP = [
  [
    "VPIP",
    "V kolika procentech hand jsi dobrovolně vložil žetony před flopem. Vysoké VPIP znamená, že hraješ hodně hand.",
  ],
  [
    "PFR",
    "V kolika procentech hand jsi před flopem zvýšil. Rozdíl proti VPIP ukazuje, jak jsi pasivní.",
  ],
  [
    "Agresivita (AF)",
    "Kolikrát víc sázíš a zvyšuješ, než dorovnáváš. Pod 1 = pasivní, 2–4 = vyvážená, nad 4 = agresivní.",
  ],
  [
    "Výsledek a bb/100",
    "Celkový zisk nebo ztráta v bb. bb/100 je zisk na 100 hand — smysl má až po stovkách hand.",
  ],
  [
    "Showdown",
    "Kolikrát došlo na porovnání karet a jak často jsi u toho vyhrál.",
  ],
  [
    "Ztráta (odhad)",
    "Kolik ti rozhodnutí sebrala podle matematiky, nezávisle na tom, jak handa dopadla.",
  ],
  ["Chyby", "Počet rozhodnutí, která byla podle modelu ztrátová."],
  [
    "Riziko",
    "Kolik procent stacku jsi v průměru dával do hry na jedno rozhodnutí. „Velká rizika\" jsou ta nad 25 % stacku.",
  ],
];

function statsHelpHtml() {
  const terms = STAT_HELP.map(
    ([term, text]) => `<dt>${term}</dt><dd>${text}</dd>`,
  ).join("");

  return `
    <details class="stats-help">
      <summary>Co znamenají zkratky?</summary>
      <dl>${terms}</dl>
    </details>`;
}

function handRowHtml(hand) {
  const hole = (hand.hole ?? [])
    .map((card) => cardHtml(card, { small: true }))
    .join("");
  const board = (hand.board ?? [])
    .map((card) => cardHtml(card, { small: true }))
    .join("");

  const netClass = hand.net > 0 ? "amount-pos" : hand.net < 0 ? "amount-neg" : "";

  const reviewRows = (hand.review ?? [])
    .map(
      (item) => `
      <div class="h-review-row ${item.verdict}">
        <span class="h-street">${item.street}</span>
        <span class="h-action">${item.action}</span>
        <span class="h-note">
          ${item.note}
          ${
            item.strategicNotes && item.strategicNotes.length > 0
              ? `<em class="h-strategy">${item.strategicNotes.join(" ")}</em>`
              : ""
          }
        </span>
      </div>`,
    )
    .join("");

  return `
    <details class="hand-row">
      <summary>
        <span class="h-no">#${hand.handNo}</span>
        <span class="h-pos">${hand.position}</span>
        <span class="h-cards">${hole}</span>
        <span class="h-net ${netClass}">${formatSignedBb(hand.net, hand.bb ?? 2)}</span>
        <span class="h-badges">${hand.mistakes > 0 ? mistakesLabel(hand.mistakes) : ""}</span>
      </summary>
      <div class="h-detail">
        ${board ? `<div class="h-board">${board}</div>` : ""}
        ${reviewRows || '<p class="h-empty">Bez rozhodnutí.</p>'}
      </div>
    </details>`;
}

function statsModalHtml(state, history, bigBlind, seatCount, stats, mode, totalHands = 0) {
  if (!state.showStats) return "";

  const windowCount = history.length;
  const scope =
    mode === "cumulative"
      ? `Kumulativní statistiky ze všech ${stats.hands} hand na ${seatCount}-max.`
      : `Statistiky z posledních ${windowCount} hand${
          totalHands > windowCount ? ` z celkem ${totalHands}` : ""
        }.`;
  const netClass = stats.netBb > 0 ? "amount-pos" : stats.netBb < 0 ? "amount-neg" : "";

  const rows =
    history.length === 0
      ? '<p class="h-empty">Zatím žádné handy.</p>'
      : history
          .slice()
          .reverse()
          .map((hand) => handRowHtml(hand))
          .join("");

  return `
    <div class="modal">
      <div class="modal-card stats-card">
        <h2>Statistiky session</h2>

        <div class="stats-tabs">
          <button class="seg ${mode === "cumulative" ? "active" : ""}" data-action="stats-cumulative">Kumulativní</button>
          <button class="seg ${mode === "window" ? "active" : ""}" data-action="stats-window">Posledních ${windowCount || 100}</button>
        </div>

        <p class="stats-scope">${scope}</p>

        <div class="stat-grid">
          ${statCard(
            "Handy",
            String(stats.hands),
            mode === "window" && totalHands > stats.hands
              ? `z ${totalHands} celkem`
              : mode === "cumulative"
                ? "celkem"
                : "",
          )}
          ${statCard(
            "Výsledek",
            formatSignedBb(stats.net, stats.bigBlind),
            stats.hands >= 10
              ? signedBbPer100(stats.bbPer100)
              : "málo hand na bb/100",
            netClass,
          )}
          ${statCard(
            "VPIP",
            `${Math.round(stats.vpip * 100)} %`,
            `jak často hraješ · cíl ${Math.round(stats.benchmark.vpip[0] * 100)}–${Math.round(stats.benchmark.vpip[1] * 100)} %`,
          )}
          ${statCard(
            "PFR",
            `${Math.round(stats.pfr * 100)} %`,
            `jak často zvyšuješ · cíl ${Math.round(stats.benchmark.pfr[0] * 100)}–${Math.round(stats.benchmark.pfr[1] * 100)} %`,
          )}
          ${statCard(
            "Agresivita",
            stats.af === null ? "—" : stats.af.toFixed(1).replace(".", ","),
            stats.afLabel,
          )}
          ${statCard(
            "Showdown",
            `${stats.showdowns}×`,
            stats.showdowns > 0
              ? `${Math.round(stats.showdownWinRate * 100)} % výher`
              : "kolikrát na karty",
          )}
          ${statCard(
            "Ztráta (odhad)",
            formatLoss(stats.evLoss, stats.bigBlind),
            `−${stats.evLossPerHandBb.toFixed(1).replace(".", ",")} bb/hand`,
            "amount-neg",
          )}
          ${statCard("Chyby", String(stats.mistakes))}
          ${statCard(
            "Riziko",
            stats.riskCount > 0 ? `${Math.round(stats.riskAvgShare * 100)} %` : "—",
            stats.bigRisks > 0
              ? `${stats.bigRiskGood}/${stats.bigRisks} velkých oprávněných`
              : "průměr stacku na rozhodnutí",
          )}
        </div>

        ${statsHelpHtml()}

        <ul class="stat-notes">
          ${stats.notes.map((note) => `<li>${note}</li>`).join("")}
        </ul>

        <h3>Historie hand</h3>
        <div class="history">${rows}</div>

        <div class="stats-actions">
          <button class="btn" data-action="close-stats">Zavřít</button>
          <button class="btn danger" data-action="clear-history">Vymazat historii</button>
        </div>
      </div>
    </div>`;
}

function preflopAdvisorHtml(pre) {
  if (!pre) return "";

  const head = `<div class="advisor-subhead"><h4>Preflop chart</h4><span class="advisor-badge">baseline</span></div>`;

  if (!pre.spot) {
    return `<div class="advisor-preflop">${head}<p class="advisor-wait">${pre.label}</p></div>`;
  }

  const spot = pre.spot;
  const labels = {
    raise: spot.kind === "rfi" ? "Zvýšit" : "3-bet",
    call: "Dorovnat",
    fold: "Zahodit",
  };

  const cells = chartCells(spot)
    .map(
      (cell) =>
        `<span class="chart-cell ${cell.action}" title="${percentText(cell.percentile)}">${cell.label}</span>`,
    )
    .join("");

  return `
    <div class="advisor-preflop">
      ${head}
      <p class="advisor-spot">${spot.label}</p>
      <div class="advisor-action ${pre.action}">
        <span>Chart</span>
        <strong>${labels[pre.action]}</strong>
      </div>
      <details class="preflop-chart">
        <summary>Tabulka</summary>
        <div class="chart-grid">${cells}</div>
      </details>
    </div>`;
}

function advisorHtml(game, state) {
  if (!state.showAdvisor) return "";

  if (!game.isHumanTurn) {
    return `
      <aside class="advisor">
        <div class="advisor-head">
          <h3>Solver</h3><span class="advisor-badge">model</span>
        </div>
        <p class="advisor-wait">Čekám, až budeš na řadě.</p>
      </aside>`;
  }

  const preflop = game.hand.street === "preflop" ? preflopAdvice(game) : null;

  // Preflop rozhoduje chart. Model počítá pot odds až od flopu — preflop by
  // srovnával „dorovnat 2 bb a vidět flop", což u otevření není rozhodnutí.
  if (preflop) {
    return `
      <aside class="advisor">
        <div class="advisor-head">
          <h3>Solver</h3><span class="advisor-badge">model</span>
        </div>
        ${preflopAdvisorHtml(preflop)}
        <p class="advisor-note">
          Před flopem rozhoduje chart. Model počítá pot odds až od flopu.
        </p>
      </aside>`;
  }

  const advice = advise(game);
  if (!advice) return "";

  return `
    <aside class="advisor">
      <div class="advisor-head">
        <h3>Solver</h3><span class="advisor-badge">model</span>
      </div>

      <div class="advisor-action ${advice.action}">
        <span>Doporučení</span>
        <strong>${advice.label}</strong>
        <em>${advice.confidence}</em>
      </div>

      <dl class="advisor-stats">
        <div><dt>Šance</dt><dd>${Math.round(advice.equity * 100)} %</dd></div>
        <div><dt>Potřebné</dt><dd>${advice.required > 0 ? `${Math.round(advice.required * 100)} %` : "—"}</dd></div>
      </dl>

      <p class="advisor-note">
        Počítá z odhadu rozsahu a fold equity. Není to GTO solver.
      </p>
    </aside>`;
}

function preflopModalHtml(state) {
  const drill = state.preflop;
  if (!drill || !drill.open) return "";

  const spot = SPOTS[drill.spotIndex] ?? SPOTS[0];
  const cards = drill.cards ?? [];
  const feedback = drill.feedback;
  const labels = {
    raise: spot.kind === "rfi" ? "Zvýšit" : "3-bet",
    call: "Dorovnat",
    fold: "Zahodit",
  };

  const options = SPOTS.map(
    (item, index) =>
      `<option value="${index}" ${index === drill.spotIndex ? "selected" : ""}>${item.label}</option>`,
  ).join("");

  const actions = feedback
    ? `<button class="btn primary wide" data-action="preflop-next">Další handa</button>`
    : `<div class="preflop-actions">
        <button class="btn primary" data-action="preflop-raise">${labels.raise}</button>
        ${spot.kind === "vs" ? `<button class="btn" data-action="preflop-call">${labels.call}</button>` : ""}
        <button class="btn" data-action="preflop-fold">${labels.fold}</button>
      </div>`;

  const feedbackHtml = feedback
    ? `<div class="preflop-feedback ${feedback.correct ? "good" : "bad"}">
        <strong>${feedback.correct ? "Správně" : "Špatně"}</strong>
        <span>${
          feedback.correct ? "" : `Správně je ${labels[feedback.expected]}. `
        }Handa je v ${percentText(feedback.percentile)}, hranice je ${percentText(spot.raise)}${
          spot.call ? ` (call do ${percentText(spot.call)})` : ""
        }.</span>
      </div>`
    : `<p class="preflop-hint">Co uděláš?</p>`;

  const cells = chartCells(spot)
    .map(
      (cell) =>
        `<span class="chart-cell ${cell.action}" title="${percentText(cell.percentile)}">${cell.label}</span>`,
    )
    .join("");

  return `
    <div class="modal">
      <div class="modal-card preflop-card">
        <h2>Preflop 6-max</h2>
        <p class="preflop-scope">
          Baseline podle frekvencí a síly handy — heuristika, ne solver.
          Hraniční handy se mohou lišit od GTO chartů.
        </p>

        <select class="preflop-select" data-preflop-spot>${options}</select>
        <p class="preflop-situation">${spot.label}</p>

        <div class="preflop-hand">
          ${cards.map((card) => cardHtml(card)).join("")}
        </div>

        ${feedbackHtml}
        ${actions}

        <div class="preflop-stats">
          <span>Streak ${drill.streak}</span>
          <span>${drill.correct}/${drill.total}</span>
        </div>

        <details class="preflop-chart">
          <summary>Tabulka pro tuhle pozici</summary>
          <div class="chart-grid">${cells}</div>
          <div class="chart-legend">
            <span><i class="raise"></i>${labels.raise}</span>
            ${spot.kind === "vs" ? `<span><i class="call"></i>${labels.call}</span>` : ""}
            <span><i class="fold"></i>Fold</span>
          </div>
        </details>

        <button class="btn wide" data-action="close-preflop">Zavřít</button>
      </div>
    </div>`;
}

export function render(root, game, state) {
  const hand = game.hand;
  if (!hand) {
    root.innerHTML = '<p class="boot">Připravuji stůl…</p>';
    return;
  }

  const seats = [];
  const seatCount = game.table.config.numSeats;
  for (let seat = 0; seat < seatCount; seat++) {
    seats.push(seatHtml(game, seat, state));
  }

  const modeHands = state.history.filter(
    (hand) => (hand.seats ?? 9) === seatCount,
  );

  const totalHands = Math.max(
    Number(state.totals?.[String(seatCount)] ?? 0),
    modeHands.length,
  );

  const windowStats = computeStats(modeHands);
  const cumulative = cumulativeStats(
    state.cumulative,
    seatCount,
    game.table.config.bigBlind,
  );
  const stats = state.statsMode === "window" ? windowStats : cumulative;

  const sessionNetClass =
    stats.netBb > 0 ? "amount-pos" : stats.netBb < 0 ? "amount-neg" : "";

  root.innerHTML = `
    <div class="app ${state.showAdvisor ? "with-advisor" : ""}">
      <header class="topbar">
        <div class="brand"><span class="brand-dot"></span> Poker Trainer</div>
        <div class="meta">
          <span>handa #${game.table.handCount + 1}</span>
          <span>${game.preset.name}</span>
          <span>blindy ${game.table.config.smallBlind}/${game.table.config.bigBlind}</span>
        </div>
        <div class="session">
          <span class="session-hands">${totalHands} hand</span>
          <span class="session-pl ${sessionNetClass}">${formatSignedBb(stats.net, stats.bigBlind)}</span>
          <button class="btn small" data-action="open-stats">Statistiky</button>
        </div>
      </header>

      ${settingsHtml(state)}
      ${positionBarHtml(game)}

      <div class="layout ${state.showAdvisor ? "with-advisor" : ""}">
        <div class="main">
          <div class="table-wrap">
            <div class="table">
              ${seats.join("")}
              ${boardHtml(game)}
            </div>
          </div>

          ${actionBarHtml(game, state)}
        </div>

        ${advisorHtml(game, state)}
      </div>

      ${resultHtml(game, state)}
      ${statsModalHtml(
        state,
        modeHands,
        game.table.config.bigBlind,
        seatCount,
        stats,
        state.statsMode,
        totalHands,
      )}
      ${glossaryModalHtml(state)}
      ${cheatsheetModalHtml(state)}
      ${preflopModalHtml(state)}
    </div>`;
}

