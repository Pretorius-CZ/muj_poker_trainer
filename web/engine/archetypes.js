// GENEROVÁNO z engine/src/archetypes.ts — neupravuj přímo.
// Znovu vygeneruješ: node tools/build-web.mjs

/**
 * Archetypy soupeřů.
 *
 * Každý profil je sada tendencí, ne skript. Rozhodnutí vzniká z kombinace:
 *
 *   - preflop: percentil síly handy (Chen) proti prahu podle pozice a profilu,
 *   - postflop: Monte Carlo equity proti **odhadnutým range** soupeřů
 *     (ne proti náhodným handám), porovnaná s pot odds a upravená profilem.
 *
 * Ten rozdíl je zásadní. Kdyby bot počítal equity proti celému balíčku,
 * všichni by si mysleli, že jsou ahead, nikdo by nefoldoval a každá handa
 * by došla na showdown. Odhad range podle akcí je to, co dělá hru hrou.
 *
 * Je to aproximace, ne solver — ale je čitelná: když nit foldne a station
 * dorovná, je za tím vidět proč.
 */

                                                            
                                        
import { equityVsRanges } from "./equity.js";
import { handPercentile, topPercentRange } from "./strength.js";
                                             
                                    

                             
             
               
                                         
               
                                          
              
                                              
                     
                                 
                
                                                      
                   
                                         
                 
 

export const ARCHETYPES                        = [
  {
    id: "nit",
    name: "Nit",
    vpip: 0.13,
    pfr: 0.11,
    aggression: 0.6,
    bluff: 0.05,
    callDown: 0.2,
    sizing: 0.6,
  },
  {
    id: "tag",
    name: "Solidní",
    vpip: 0.22,
    pfr: 0.19,
    aggression: 1.0,
    bluff: 0.18,
    callDown: 0.45,
    sizing: 0.8,
  },
  {
    id: "station",
    name: "Volumeč",
    vpip: 0.55,
    pfr: 0.06,
    aggression: 0.25,
    bluff: 0.03,
    callDown: 0.95,
    sizing: 0.5,
  },
  {
    id: "maniac",
    name: "Maniak",
    vpip: 0.7,
    pfr: 0.5,
    aggression: 1.7,
    bluff: 0.45,
    callDown: 0.75,
    sizing: 1.1,
  },
  {
    id: "weak-tight",
    name: "Bázlivý",
    vpip: 0.18,
    pfr: 0.12,
    aggression: 0.5,
    bluff: 0.04,
    callDown: 0.12,
    sizing: 0.6,
  },
  {
    id: "abc",
    name: "Učebnicový",
    vpip: 0.24,
    pfr: 0.2,
    aggression: 1.0,
    bluff: 0.15,
    callDown: 0.4,
    sizing: 0.75,
  },
  {
    id: "tricky",
    name: "Záludný",
    vpip: 0.3,
    pfr: 0.24,
    aggression: 1.2,
    bluff: 0.32,
    callDown: 0.5,
    sizing: 0.9,
  },
  {
    id: "loose-passive",
    name: "Pasivní",
    vpip: 0.45,
    pfr: 0.08,
    aggression: 0.35,
    bluff: 0.05,
    callDown: 0.8,
    sizing: 0.5,
  },
];

export function getArchetype(id        )             {
  const profile = ARCHETYPES.find((p) => p.id === id);
  if (!profile) throw new Error(`Neznámý archetyp "${id}"`);
  return profile;
}

                                   
                                                                           
                      
 

function clamp(value        , low        , high        )         {
  return value < low ? low : value > high ? high : value;
}

/**
 * Kvalita pozice 0 (nejhorší, UTG) .. 1 (nejlepší, BB/button).
 * Hrubé, ale stačí to: boti mají být loose později, ne přesně.
 */
function positionRatio(hand      , seat        )         {
  const count = hand.seats.length;
  if (count === 2) return seat === hand.button ? 1 : 0.5;

  const firstToAct = (hand.bigBlindSeat + 1) % count;
  const steps = (seat - firstToAct + count) % count;
  return steps / (count - 1);
}

function aggressiveAction(legal              , target        )         {
  const amount = Math.max(
    legal.minRaiseTo,
    Math.min(legal.maxRaiseTo, Math.round(target)),
  );
  return { type: legal.canBet ? "bet" : "raise", amount };
}

function preflopAction(
  hand      ,
  seat        ,
  profile            ,
  legal              ,
  rng     ,
)         {
  const state = hand.seatState(seat);
  const percentile = handPercentile(state.hole[0], state.hole[1]);
  const ratio = positionRatio(hand, seat);

  // V 6-max se hraje volněji než v 9-max — méně hráčů, širší open range.
  const tableBonus = hand.seats.length <= 6 ? 1.35 : 1;
  const looseness = (0.55 + 0.9 * ratio) * tableBonus;
  const playThreshold = clamp(profile.vpip * looseness, 0.02, 0.95);
  const raiseThreshold = clamp(profile.pfr * looseness, 0.01, 0.9);
  const facingRaise = hand.currentBetSize > hand.bigBlind;

  // 3-bet není totéž co open. Používá se jen zlomek open range — ale agresivní
  // profily 3-betují výrazně častěji, jinak by maniak jen dorovnával jako nit.
  const threeBetThreshold = clamp(
    raiseThreshold * (0.1 + 0.2 * Math.max(0, profile.aggression - 0.5)),
    0.004,
    0.25,
  );

  const canAggress = legal.canBet || legal.canRaise;

  // Big blind opce: žádná sázka k dorovnání.
  if (legal.canCheck) {
    if (canAggress && percentile < raiseThreshold && rng.next() < 0.8) {
      return aggressiveAction(legal, hand.bigBlind * 3);
    }
    return { type: "check" };
  }

  if (facingRaise) {
    // Už proběhly čtyři a víc sázek → jen s prémií, jinak je to hra na loterii.
    const raiseLevel = hand.currentBetSize / hand.bigBlind;
    if (raiseLevel > 12) {
      if (canAggress && percentile < 0.015 && rng.next() < 0.4) {
        return aggressiveAction(legal, hand.currentBetSize * 2.5);
      }
      if (percentile < 0.04) return { type: "call" };
      return { type: "fold" };
    }

    if (canAggress && percentile < threeBetThreshold && rng.next() < 0.3 + 0.25 * profile.aggression) {
      return aggressiveAction(legal, hand.currentBetSize * 3);
    }
    if (percentile < playThreshold * 0.8) return { type: "call" };
    return { type: "fold" };
  }

  if (canAggress && percentile < raiseThreshold) {
    return aggressiveAction(legal, hand.bigBlind * 3);
  }
  if (percentile < playThreshold) return { type: "call" };
  return { type: "fold" };
}

/**
 * Odhad soupeřova range podle toho, co už v handě udělal.
 *
 * Je to hrubé, ale zásadní: soupeř, který raisoval, nemá náhodnou handu.
 * Rozlišuje se aktuální street (co ukázal teď) a historie (co ukázal dřív),
 * protože range se každou street zužuje.
 *
 * Exportované, protože stejný odhad používá i review po handě — aby coach
 * a boti mluvili stejným jazykem a nedávali dva různé světy.
 */
export function rangeTierFor(hand      , seat        )         {
  let currentStreetRaised = false;
  let currentStreetCalled = false;
  let everRaised = false;
  let everCalled = false;

  for (const event of hand.log) {
    if (event.seat !== seat) continue;
    if (event.action === "bet" || event.action === "raise") {
      everRaised = true;
      if (event.street === hand.street) currentStreetRaised = true;
    } else if (event.action === "call") {
      everCalled = true;
      if (event.street === hand.street) currentStreetCalled = true;
    }
  }

  if (currentStreetRaised) return 0.08;
  if (everRaised) return 0.15;
  if (currentStreetCalled) return 0.25;
  if (everCalled) return 0.35;
  return 0.6;
}

function postflopAction(
  hand      ,
  seat        ,
  profile            ,
  legal              ,
  rng     ,
  iterations        ,
)         {
  const state = hand.seatState(seat);

  const villainRanges                 = [];
  for (const other of hand.seats) {
    if (other.folded || other.seat === seat) continue;
    villainRanges.push(topPercentRange(rangeTierFor(hand, other.seat)));
  }

  const equity =
    villainRanges.length === 0
      ? 0.5
      : equityVsRanges(state.hole, villainRanges, hand.board, iterations, rng).equity;

  const opponents = Math.max(1, villainRanges.length);
  const canAggress = legal.canBet || legal.canRaise;
  const pot = hand.pot;
  const potOdds = legal.toCall > 0 ? legal.toCall / (pot + legal.toCall) : 0;

  // Strop na velikost sázky: overbety působí proti člověku nahodile a nikdo
  // je na nízkých stakes nepotká. 0,85 potu je maximum, které dává smysl.
  const sizing = Math.min(profile.sizing, 0.85);

  // Sleva na soupeřích: čím víc jich je, tím nižší equity stačí na "silnou".
  const valueThreshold = Math.max(0.3, 0.6 - 0.04 * (opponents - 1));

  if (legal.canCheck) {
    if (canAggress && equity > valueThreshold) {
      if (rng.next() < 0.35 + 0.45 * profile.aggression) {
        return aggressiveAction(legal, pot * sizing);
      }
      return { type: "check" };
    }
    // Semi-bluff (draw) a čistý bluff.
    if (canAggress && equity > 0.22 && rng.next() < profile.bluff * 0.6) {
      return aggressiveAction(legal, pot * sizing);
    }
    if (canAggress && equity < 0.15 && rng.next() < profile.bluff * 0.25) {
      return aggressiveAction(legal, pot * sizing);
    }
    return { type: "check" };
  }

  const callThreshold = potOdds * (1.3 - 0.5 * profile.callDown) + 0.08;

  if (canAggress && equity > callThreshold + 0.25) {
    if (rng.next() < 0.25 * profile.aggression) {
      return aggressiveAction(legal, hand.currentBetSize * 3);
    }
  }

  if (equity > callThreshold) return { type: "call" };
  return { type: "fold" };
}

/** Vytvoří politiku, která hraje podle daného archetypu. */
export function createArchetypePolicy(
  profile            ,
  options                   = {},
)         {
  const iterations = options.iterations ?? 80;

  return (hand, seat, rng) => {
    const legal = hand.legalActionsFor(hand.seatState(seat));

    if (hand.street === "preflop") {
      return preflopAction(hand, seat, profile, legal, rng);
    }
    return postflopAction(hand, seat, profile, legal, rng, iterations);
  };
}

/** Rozesadí archetypy po stole tak, aby se střídaly. */
export function seatArchetypes(
  profiles                       ,
  seats        ,
)               {
  return Array.from({ length: seats }, (_, index) => profiles[index % profiles.length]);
}
