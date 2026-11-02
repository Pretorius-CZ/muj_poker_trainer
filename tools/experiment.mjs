/**
 * Experiment: jak dopadne hra podle nápovědy vs. s větším rizikem.
 *
 * Odehraje zadaný počet hand na 6-max stole (live-soft) třemi strategiemi:
 *   1. napoveda — přesně to, co ukazuje boční solver (preflop chart,
 *      od flopu model),
 *   2. extra-risk — fold mění na call, check na sázku, call na raise,
 *   3. max-risk — jakmile to jde, jde all-in.
 *
 * Výsledky jsou v bb a je k nim 95% interval spolehlivosti celkového
 * výsledku. Na 500 hand je to pořád hrubý odhad — interval je široký.
 *
 * Použití:
 *   node tools/experiment.mjs 500 6 12345
 */

import { GameController } from "../web/app/controller.js";
import { advise } from "../web/app/advisor.js";
import { preflopAdvice } from "../web/app/preflop.js";

const HANDS = Number(process.argv[2] ?? 500);
const SEATS = Number(process.argv[3] ?? 6);
const SEED = Number(process.argv[4] ?? 12345);
const BIG_BLIND = 2;

function clampToLegal(amount, legal) {
  return Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, Math.round(amount)));
}

/** Co by poradil boční solver: preflop chart, od flopu model. */
function baseAction(game) {
  const legal = game.legal();

  if (game.hand.street === "preflop") {
    const pre = preflopAdvice(game);

    if (pre && pre.spot) {
      if (pre.action === "raise") {
        // Krátký stack nemusí mít právo raisovat — pak jen dorovnat.
        if (!legal.canRaise) {
          if (legal.canCall) return { type: "call" };
          return { type: legal.canCheck ? "check" : "fold" };
        }

        const target =
          pre.spot.kind === "rfi"
            ? 3 * BIG_BLIND
            : 3 * game.hand.currentBetSize;
        return { type: "raise", amount: clampToLegal(target, legal) };
      }
      if (pre.action === "call") return { type: "call" };
      return { type: "fold" };
    }

    if (pre && pre.kind === "check") return { type: "check" };
  }

  const advice = advise(game);
  if (!advice) return { type: legal.canCheck ? "check" : "fold" };

  if (advice.action === "bet" || advice.action === "raise") {
    return { type: advice.action, amount: advice.amount };
  }
  return { type: advice.action };
}

function followAdvice(game) {
  return baseAction(game);
}

function extraRisk(game) {
  const base = baseAction(game);
  const legal = game.legal();
  const hero = game.hand.seats[game.humanSeat];

  if (base.type === "fold") {
    if (legal.canCall && legal.toCall <= 0.08 * hero.stack) {
      return { type: "call" };
    }
    return base;
  }

  if (base.type === "check") {
    if (legal.canBet) {
      return {
        type: "bet",
        amount: clampToLegal(game.hand.pot * 0.5, legal),
      };
    }
    return base;
  }

  if (base.type === "call") {
    if (legal.canRaise) {
      return {
        type: "raise",
        amount: clampToLegal(game.hand.pot * 0.75, legal),
      };
    }
    return base;
  }

  return base;
}

function maxRisk(game) {
  const legal = game.legal();

  if (legal.canBet) return { type: "bet", amount: legal.maxRaiseTo };
  if (legal.canRaise) return { type: "raise", amount: legal.maxRaiseTo };
  if (legal.canCall) return { type: "call" };
  if (legal.canCheck) return { type: "check" };
  return { type: "fold" };
}

const POLICIES = {
  napoveda: followAdvice,
  "extra-risk": extraRisk,
  "max-risk": maxRisk,
};

function playHand(game, policy) {
  game.startHand();

  let guard = 0;
  while (!game.isComplete && guard++ < 500) {
    if (game.isHumanTurn) {
      game.act(policy(game));
    } else {
      game.stepBot();
    }
  }

  if (!game.isComplete) throw new Error("handa se zasekla");

  const hero = game.hand.seats[game.humanSeat];
  const net = (hero.won ?? 0) - hero.committedHand;
  const showdown = game.hand.result?.showdown ?? false;
  const decisions = game.decisions.map((decision) => decision.action.type);

  game.settle();

  return { net, showdown, decisions };
}

function run(policyName, policy) {
  const game = new GameController({ seed: SEED, seats: SEATS });
  const nets = [];
  const actions = { fold: 0, check: 0, call: 0, bet: 0, raise: 0 };
  let showdowns = 0;

  for (let index = 0; index < HANDS; index++) {
    const result = playHand(game, policy);
    nets.push(result.net);

    if (result.showdown) showdowns += 1;

    for (const action of result.decisions) {
      actions[action] = (actions[action] ?? 0) + 1;
    }
  }

  const net = nets.reduce((sum, value) => sum + value, 0);
  const bb = net / BIG_BLIND;
  const mean = net / HANDS;
  const variance =
    nets.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    Math.max(1, HANDS - 1);

  // 95% interval celkového výsledku v bb.
  const ci95 = (1.96 * Math.sqrt(variance * HANDS)) / BIG_BLIND;

  return {
    policy: policyName,
    hands: HANDS,
    netBb: bb,
    bbPer100: (net / BIG_BLIND / HANDS) * 100,
    ci95,
    wins: nets.filter((value) => value > 0).length,
    losses: nets.filter((value) => value < 0).length,
    draws: nets.filter((value) => value === 0).length,
    showdowns,
    maxWin: Math.max(...nets) / BIG_BLIND,
    maxLoss: Math.min(...nets) / BIG_BLIND,
    actions,
  };
}

function format(value, digits = 1) {
  return value.toFixed(digits).replace(".", ",");
}

const results = Object.entries(POLICIES).map(([name, policy]) => run(name, policy));

const header = ["strategie", "bb", "±95 %", "bb/100", "výhry", "prohry", "remízy"].join(" | ");
console.log(header);
console.log("-".repeat(header.length));

for (const result of results) {
  console.log(
    [
      result.policy.padEnd(10),
      format(result.netBb).padStart(7),
      format(result.ci95).padStart(7),
      format(result.bbPer100).padStart(7),
      String(result.wins).padStart(5),
      String(result.losses).padStart(6),
      String(result.draws).padStart(6),
    ].join(" | "),
  );
}

console.log("\nAkce podle strategie:");
for (const result of results) {
  const actions = Object.entries(result.actions)
    .map(([name, count]) => `${name} ${count}`)
    .join(", ");
  console.log(`  ${result.policy.padEnd(10)} ${actions}`);
}

const base = results[0];
console.log("\nRozdíl proti nápovědě:");
for (const result of results.slice(1)) {
  const diff = result.netBb - base.netBb;
  console.log(`  ${result.policy.padEnd(10)} ${diff >= 0 ? "+" : ""}${format(diff)} bb`);
}
