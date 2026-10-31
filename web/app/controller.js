/**
 * Herní logika bez DOM.
 *
 * Záměrně oddělené od renderu: jde to spustit v Node a otestovat, že
 * interaktivní smyčka (člověk + boti) dohraje handu a že žetony sedí.
 * UI díky tomu nemusí být jediné místo, kde se dá něco pokazit.
 */

import { Table } from "../engine/table.js";
import { createRng } from "../engine/rng.js";
import { createArchetypePolicy, rangeTierFor } from "../engine/archetypes.js";
import { topPercentRange } from "../engine/strength.js";
import { DEFAULT_PRESET, getPreset, presetProfiles } from "../engine/presets.js";

export const DEFAULT_SEATS = 9;

/** Zpětná kompatibilita pro testy a staré volání. */
export const SEATS = DEFAULT_SEATS;
export const HERO_SEAT = DEFAULT_SEATS - 1;

const POSITION_NAMES_BY_SEATS = {
  6: ["BTN", "SB", "BB", "UTG", "MP", "CO"],
  9: ["BTN", "SB", "BB", "UTG", "UTG+1", "UTG+2", "MP", "HJ", "CO"],
};

export function positionName(offset, seats) {
  const names = POSITION_NAMES_BY_SEATS[seats];
  if (names) return names[offset] ?? "?";

  if (offset === 0) return "BTN";
  if (offset === 1) return "SB";
  if (offset === 2) return "BB";
  return `P${offset + 1}`;
}

/**
 * Pořadí akce postflop: 0 = první (SB), poslední = button.
 * Vyšší číslo = později na řadě = lepší pozice.
 */
function positionRank(hand, seat) {
  return (seat - hand.button - 1 + hand.seats.length) % hand.seats.length;
}

/** Poslední soupeř, který v handě vsadil nebo raisoval. */
function lastAggressorSeat(hand, excludeSeat) {
  for (let index = hand.log.length - 1; index >= 0; index--) {
    const event = hand.log[index];
    if (event.seat === excludeSeat) continue;
    if (event.action === "bet" || event.action === "raise") return event.seat;
  }
  return null;
}

const POSITION_NAMES = [
  "BTN",
  "SB",
  "BB",
  "UTG",
  "UTG+1",
  "UTG+2",
  "MP",
  "HJ",
  "CO",
];

export class GameController {
  constructor({
    presetId = DEFAULT_PRESET,
    seats = DEFAULT_SEATS,
    humanSeat = seats - 1,
    seed = 1,
    tableConfig = {},
  } = {}) {
    if (seats < 2 || seats > 10) {
      throw new Error(`Stůl musí mít 2 až 10 hráčů, dostal ${seats}`);
    }

    this.presetId = presetId;
    this.preset = getPreset(presetId);
    this.seats = seats;
    this.humanSeat = humanSeat;
    this.rng = createRng(seed);
    this.table = new Table({
      numSeats: seats,
      startStack: 100,
      smallBlind: 1,
      bigBlind: 2,
      ...tableConfig,
    });

    this.profiles = presetProfiles(presetId, seats);
    this.policies = this.profiles.map((profile) =>
      createArchetypePolicy(profile, { iterations: 80 }),
    );

    this.hand = null;
    this.settled = true;
    /** Záznam rozhodnutí člověka — podklad pro review po handě. */
    this.decisions = [];
  }

  startHand() {
    this.hand = this.table.startHand(this.rng);
    this.settled = false;
    this.decisions = [];
    return this.hand;
  }

  get isComplete() {
    return this.hand ? this.hand.complete : false;
  }

  get isHumanTurn() {
    return (
      !!this.hand &&
      !this.hand.complete &&
      this.hand.actor === this.humanSeat
    );
  }

  get actor() {
    return this.hand ? this.hand.actor : null;
  }

  /** Legální akce pro člověka, nebo null, když není na řadě. */
  legal() {
    return this.isHumanTurn ? this.hand.legalActions() : null;
  }

  /**
   * Uloví stav před akcí člověka.
   *
   * Review potřebuje přesně to, co bylo v tu chvíli k dispozici: board,
   * pot, kolik dorovnat a **odhad range soupeřů** (podle jejich akcí).
   * Kdyby se to rekonstruovalo po handě z logu, šlo by to splést.
   */
  snapshot(action, legal) {
    const me = this.hand.seats[this.humanSeat];
    const ranges = [];

    for (const other of this.hand.seats) {
      if (other.seat === this.humanSeat) continue;
      if (other.folded || other.hole.length === 0) continue;
      ranges.push(topPercentRange(rangeTierFor(this.hand, other.seat)));
    }

    const aggressorSeat = lastAggressorSeat(this.hand, this.humanSeat);
    const aggressorProfile =
      aggressorSeat === null ? null : this.profiles[aggressorSeat];

    const inPosition =
      aggressorSeat === null
        ? true
        : positionRank(this.hand, this.humanSeat) >
          positionRank(this.hand, aggressorSeat);

    return {
      street: this.hand.street,
      board: [...this.hand.board],
      hole: [...me.hole],
      pot: this.hand.pot,
      toCall: legal.toCall,
      canCheck: legal.canCheck,
      canBet: legal.canBet,
      canRaise: legal.canRaise,
      stack: me.stack,
      action: { ...action },
      ranges,
      opponents: ranges.length,
      inPosition,
      aggressor: aggressorProfile
        ? {
            seat: aggressorSeat,
            name: aggressorProfile.name,
            profileId: aggressorProfile.id,
          }
        : null,
    };
  }

  act(action) {
    if (!this.isHumanTurn) throw new Error("Teď nejsi na řadě");

    const legal = this.hand.legalActions();
    this.decisions.push(this.snapshot(action, legal));
    this.hand.apply(action);
  }

  /** Provede jednu akci bota. Vrací false, když je na řadě člověk nebo konec. */
  stepBot() {
    if (!this.hand || this.hand.complete) return false;
    const actor = this.hand.actor;
    if (actor === null || actor === this.humanSeat) return false;

    const action = this.policies[actor](this.hand, actor, this.rng);
    this.hand.apply(action);
    return true;
  }

  settle() {
    if (!this.hand || !this.hand.complete) {
      throw new Error("Handa ještě neskončila");
    }
    if (this.settled) return;
    this.table.finishHand(this.hand);
    this.settled = true;
  }

  positionOf(seat) {
    if (!this.hand) return "";
    const offset = (seat - this.hand.button + this.seats) % this.seats;
    return positionName(offset, this.seats);
  }

  nameOf(seat) {
    if (seat === this.humanSeat) return "Ty";
    return this.profiles[seat] ? this.profiles[seat].name : `Seat ${seat + 1}`;
  }

  archetypeOf(seat) {
    if (seat === this.humanSeat) return null;
    return this.profiles[seat] ? this.profiles[seat] : null;
  }
}
