/**
 * Stůl: drží stacky mezi handami, otáčí button a hraje handu za handou.
 *
 * Chová se jako cash game s automatickým dorovnáním stacku (auto top-up):
 * hráč, kterému spadl stack pod big blind, si dokoupí. Pro trénink je to
 * správné — nechceš simulovat turnajové vypadávání, chceš pořád plný stůl.
 */

import { Hand } from "./hand.ts";
import type { HandResult } from "./hand.ts";
import type { Policy } from "./bots.ts";
import { randomPolicy } from "./bots.ts";
import type { Rng } from "./rng.ts";

export interface TableConfig {
  numSeats: number;
  startStack: number;
  smallBlind: number;
  bigBlind: number;
  ante?: number;
}

export class Table {
  readonly config: TableConfig;
  readonly stacks: number[];
  button = 0;
  handCount = 0;
  /** Kolik žetonů bylo do hry vloženo (start + rebuy). */
  totalChips: number;
  rebuys = 0;
  private handInProgress = false;

  constructor(config: TableConfig) {
    if (config.numSeats < 2) throw new Error("Stůl potřebuje aspoň 2 hráče");
    this.config = config;
    this.stacks = Array.from({ length: config.numSeats }, () => config.startStack);
    this.totalChips = config.startStack * config.numSeats;
  }

  /**
   * Rozjede handu a vrátí ji — ale nedohraje ji.
   *
   * Pro interaktivní hru: UI pak střídavě volá `hand.apply()` za bota i za
   * člověka a na konci `finishHand()`. Pro simulace to zapouzdřuje
   * `playHand()`.
   */
  startHand(rng: Rng): Hand {
    if (this.handInProgress) {
      throw new Error("Předchozí handa ještě neskončila — chybí finishHand()");
    }

    // Auto top-up, aby stůl zůstal plný.
    for (let i = 0; i < this.stacks.length; i++) {
      if (this.stacks[i] < this.config.bigBlind) {
        const missing = this.config.startStack - this.stacks[i];
        this.stacks[i] = this.config.startStack;
        this.totalChips += missing;
        this.rebuys++;
      }
    }

    const hand = new Hand({
      seats: this.stacks.map((stack) => ({ stack })),
      button: this.button,
      smallBlind: this.config.smallBlind,
      bigBlind: this.config.bigBlind,
      ante: this.config.ante,
      rng,
    });

    hand.start();
    this.handInProgress = true;
    return hand;
  }

  /** Zapíše výsledek handy do stacků a posune button. */
  finishHand(hand: Hand): void {
    if (!this.handInProgress) {
      throw new Error("Žádná handa neběží — chybí startHand()");
    }

    for (let i = 0; i < this.stacks.length; i++) {
      this.stacks[i] = hand.seats[i].stack;
    }

    this.button = (this.button + 1) % this.config.numSeats;
    this.handCount++;
    this.handInProgress = false;
  }

  /**
   * Odehraje jednu handu od začátku do konce.
   *
   * `policy` může být jedna politika pro všechny, nebo pole politik po
   * seatedech — to používají archetypy (každý hráč má jinou povahu).
   */
  playHand(rng: Rng, policy: Policy | readonly Policy[] = randomPolicy): Hand {
    const policyFor = (seat: number): Policy =>
      Array.isArray(policy) ? (policy[seat] ?? randomPolicy) : (policy as Policy);

    const hand = this.startHand(rng);

    let guard = 0;
    while (!hand.complete) {
      if (hand.actor === null) throw new Error("Handa běží, ale nikdo není na řadě");
      if (++guard > 5000) throw new Error("Zacyklení ve hře — příliš mnoho akcí");
      const actor = hand.actor;
      const action = policyFor(actor)(hand, actor, rng);
      try {
        hand.apply(action);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Nelegální akce v handě #${this.handCount + 1}, seat ${actor}: ` +
            `${JSON.stringify(action)} — ${message}`,
        );
      }
    }

    this.finishHand(hand);
    return hand;
  }

  get chipCount(): number {
    return this.stacks.reduce((sum, stack) => sum + stack, 0);
  }
}

export type { HandResult };
