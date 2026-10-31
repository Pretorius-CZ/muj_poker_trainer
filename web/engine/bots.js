// GENEROVÁNO z engine/src/bots.ts — neupravuj přímo.
// Znovu vygeneruješ: node tools/build-web.mjs

/**
 * Rozhraní pro rozhodování hráčů.
 *
 * V tuhle chvíli jsou tu jen testovací politiky. Skutečné archetypy (nit, TAG,
 * calling station, maniak...) přijdou ve fázi v1 — budou potřebovat equity
 * kalkulačku a model range, který ještě nemáme.
 *
 * Rozhraní je záměrně úzké: politika dostane handu a seat, vrátí akci.
 * Díky tomu jde lidský hráč, bot i "replay z historie" zastrčit za stejné API.
 */

                                                            
                                    

                                                                    

function pickRaiseTarget(legal              , rng     )         {
  const min = legal.minRaiseTo;
  const max = legal.maxRaiseTo;
  if (min >= max) return max;

  const roll = rng.next();
  if (roll < 0.4) return min;
  if (roll < 0.75) {
    return Math.min(max, Math.round(min + (max - min) * rng.next()));
  }
  return max;
}

/** Náhodná legální akce — dobrá na prošlapání všech stavů enginu. */
export const randomPolicy         = (hand, seat, rng) => {
  const legal = hand.legalActionsFor(hand.seatState(seat));
  const options           = [];

  if (legal.canFold) options.push({ type: "fold" });
  if (legal.canCheck) options.push({ type: "check" });
  if (legal.canCall) options.push({ type: "call" });
  if (legal.canBet) options.push({ type: "bet", amount: pickRaiseTarget(legal, rng) });
  if (legal.canRaise) options.push({ type: "raise", amount: pickRaiseTarget(legal, rng) });

  return options[rng.nextInt(options.length)];
};

/** Check, nebo dorovnání. Deterministické, hodí se na testy. */
export const checkCallPolicy         = (hand, seat) => {
  const legal = hand.legalActionsFor(hand.seatState(seat));
  if (legal.canCheck) return { type: "check" };
  if (legal.canCall) return { type: "call" };
  return { type: "fold" };
};

/** Fold na jakoukoli sázku, jinak check. */
export const foldToBetPolicy         = (hand, seat) => {
  const legal = hand.legalActionsFor(hand.seatState(seat));
  if (legal.canCheck) return { type: "check" };
  return { type: "fold" };
};
