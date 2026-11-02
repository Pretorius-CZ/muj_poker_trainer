/**
 * Zužování soupeřovy range podle toho, co už ve handě udělal.
 *
 * `rangeTierFor` v archetypech umí jen hrubé pásmo podle poslední akce.
 * Tohle jde street po streeti:
 *
 *   1. preflop — podle raise/call dostane základní range,
 *   2. flop/turn/river — podle akce na dané streetě se range filtruje
 *      podle síly handy na boardu (agrese = silnější část, check = slabší).
 *
 * Je to heuristika, ne solver: filtruje podle hotové handy, ne podle
 * přesné politiky. Ale používá **celou historii akcí**, ne jen tu poslední.
 */

import { evaluateBest } from "../engine/evaluator.js";
import { topPercentRange } from "../engine/strength.js";

const STREETS = ["flop", "turn", "river"];

function preflopPercent(hand, seat) {
  let raised = false;
  let called = false;

  for (const event of hand.log) {
    if (event.seat !== seat || event.street !== "preflop") continue;
    if (event.action === "bet" || event.action === "raise") raised = true;
    else if (event.action === "call") called = true;
  }

  if (raised) return 0.14;
  if (called) return 0.32;
  return 0.6;
}

function streetAction(hand, seat, street) {
  let aggressive = false;
  let called = false;
  let checked = false;

  for (const event of hand.log) {
    if (event.seat !== seat || event.street !== street) continue;
    if (event.action === "bet" || event.action === "raise") aggressive = true;
    else if (event.action === "call") called = true;
    else if (event.action === "check") checked = true;
  }

  if (aggressive) return "aggressive";
  if (called) return "call";
  if (checked) return "check";
  return null;
}

function boardForStreet(hand, street) {
  const count = street === "flop" ? 3 : street === "turn" ? 4 : 5;
  return hand.board.slice(0, count);
}

function filterByAction(combos, board, action) {
  const scored = combos.map((combo) => ({
    combo,
    score: evaluateBest([...combo.cards, ...board]),
  }));

  scored.sort((first, second) => second.score - first.score);

  if (action === "aggressive") {
    const keep = Math.max(20, Math.round(scored.length * 0.55));
    return scored.slice(0, keep).map((entry) => entry.combo);
  }

  if (action === "call") {
    const from = Math.round(scored.length * 0.05);
    const to = Math.max(from + 20, Math.round(scored.length * 0.7));
    return scored.slice(from, to).map((entry) => entry.combo);
  }

  // check — slabší část range (silné handy by často sázely).
  const keep = Math.max(20, Math.round(scored.length * 0.75));
  return scored
    .slice(scored.length - keep)
    .map((entry) => entry.combo);
}

export function narrowRange(hand, seat) {
  let combos = topPercentRange(preflopPercent(hand, seat));

  for (const street of STREETS) {
    const action = streetAction(hand, seat, street);
    if (!action) continue;

    const board = boardForStreet(hand, street);
    if (board.length < 3) continue;

    combos = filterByAction(combos, board, action);

    // Kdyby se range zúžila až moc, vrať se k základu — radši hrubší
    // odhad než prázdný.
    if (combos.length < 12) {
      combos = topPercentRange(preflopPercent(hand, seat));
      break;
    }
  }

  return combos;
}
