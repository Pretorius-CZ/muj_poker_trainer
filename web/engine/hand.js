// GENEROVÁNO z engine/src/hand.ts — neupravuj přímo.
// Znovu vygeneruješ: node tools/build-web.mjs

/**
 * Betting state machine jedné handy.
 *
 * Záměrně bez UI a bez AI: dostane konfiguraci, vydává legální akce a přijímá
 * rozhodnutí. Díky tomu se dá testovat deterministicky a později na něj
 * navěsit web, boti i review režim.
 *
 * Pravidla, která jsou tu implementovaná a která se v hobby projektech pletou:
 *
 *   1. Min-raise = velikost posledního plného navýšení, ne velikost potu.
 *   2. Short all-in (all-in menší než min-raise) NEOTEVÍRÁ znovu sázku.
 *      Hráč, který už jednou jednal, může jen dorovnat nebo foldnout.
 *   3. Nevolaná část sázky se vrací (řeší se samo přes vrstvené poty).
 *   4. Big blind má opci, i když všichni jen dorovnali.
 *   5. Heads-up: button je small blind a jedná první preflop, ale na flopu
 *      a dál jedná první big blind.
 *   6. Když už nikdo nemůže dorovnat (všichni all-in), board se dorozdá
 *      a jde se na showdown.
 */

                                       
import { FULL_DECK } from "./cards.js";
                                    
import { shuffleInPlace } from "./rng.js";
import { evaluate7, describeScore, scoreCategory } from "./evaluator.js";
import { buildPots } from "./pots.js";

                                                                                     
                                                                     

                         
                   
                                                                            
                  
 

                           
                
                
 

                             
                             
                 
                     
                   
                
           
                                                                             
                         
                      
 

                            
               
               
                
               
                  
                 
                                       
                          
                              
                        
                    
                                                                                  
                            
                                  
              
 

                               
               
                                                       
                 
                   
                    
                   
                  
                    
                                                                     
                     
                                              
                     
 

                            
                 
                     
                        
 

                             
                
                    
                                              
                    
                                                                                          
 

                            
                 
               
                     
                                           
                
                                                       
                   
                   
 

const NEXT_STREET                         = {
  preflop: "flop",
  flop: "turn",
  turn: "river",
};

export class Hand {
           seats             ;
           config            ;
           button        ;
           smallBlindSeat        ;
           bigBlindSeat        ;

  street         = "preflop";
  board         = [];
  actor                = null;
  complete = false;
  result                    = null;
           log              = [];
           initialStacks          ;

                   rng     ;
                   smallBlind        ;
                   bigBlind        ;
                   ante        ;
                   maxActions        ;
          deck         = [];
          deckIndex = 0;
          currentBet = 0;
          lastRaiseSize = 0;
          raiseLevel = 0;
          actionCount = 0;

  constructor(config            ) {
    const count = config.seats.length;
    if (count < 2 || count > 10) {
      throw new Error(`Hra potřebuje 2 až 10 hráčů, dostal ${count}`);
    }
    if (config.button < 0 || config.button >= count) {
      throw new Error(`Neplatný button ${config.button}`);
    }
    if (config.smallBlind <= 0 || config.bigBlind <= 0 || config.smallBlind > config.bigBlind) {
      throw new Error("Blindy musí být kladné a small blind <= big blind");
    }
    for (const seat of config.seats) {
      if (!Number.isInteger(seat.stack) || seat.stack < 0) {
        throw new Error(`Neplatný stack ${seat.stack}`);
      }
    }

    this.config = config;
    this.rng = config.rng;
    this.smallBlind = config.smallBlind;
    this.bigBlind = config.bigBlind;
    this.ante = config.ante ?? 0;
    this.maxActions = config.maxActions ?? 2000;
    this.button = config.button;

    this.seats = config.seats.map((spec, index) => ({
      seat: index,
      name: spec.name ?? `Seat ${index + 1}`,
      stack: spec.stack,
      hole: [],
      folded: false,
      allIn: false,
      committedStreet: 0,
      committedHand: 0,
      hasActed: false,
      actedAtRaiseLevel: 0,
      won: 0,
    }));

    this.initialStacks = this.seats.map((s) => s.stack);

    if (count === 2) {
      // Heads-up: button je malý blind.
      this.smallBlindSeat = config.button;
      this.bigBlindSeat = (config.button + 1) % count;
    } else {
      this.smallBlindSeat = (config.button + 1) % count;
      this.bigBlindSeat = (config.button + 2) % count;
    }
  }

  get pot()         {
    return this.seats.reduce((sum, s) => sum + s.committedHand, 0);
  }

  /** Aktuální sázka na street, kterou je potřeba dorovnat. */
  get currentBetSize()         {
    return this.currentBet;
  }

  /** Velikost posledního plného navýšení (základ pro min-raise). */
  get lastFullRaiseSize()         {
    return this.lastRaiseSize;
  }

  /** Rozdá karty a rozjede handu. */
  start()       {
    if (this.deck.length > 0 || this.deckIndex > 0) {
      throw new Error("Handa už byla zahájena");
    }
    this.deck = this.config.deck
      ? [...this.config.deck]
      : shuffleInPlace([...FULL_DECK], this.rng);

    for (let round = 0; round < 2; round++) {
      for (const seat of this.seats) {
        seat.hole.push(this.draw());
      }
    }

    if (this.ante > 0) {
      for (const seat of this.seats) {
        const paid = this.takeChips(seat, this.ante, /* countsToStreet */ false);
        if (paid < this.ante) {
          // Ante nestačilo → hráč je all-in, ale do hry o tuhle handu už nic nepřidá.
          seat.allIn = true;
        }
      }
    }

    this.takeChips(this.seats[this.smallBlindSeat], this.smallBlind, true);
    this.takeChips(this.seats[this.bigBlindSeat], this.bigBlind, true);

    this.currentBet = this.bigBlind;
    this.lastRaiseSize = this.bigBlind;
    this.raiseLevel = 0;

    this.actor = this.firstToActPreflop();
    if (this.actor === null || this.isBettingRoundComplete()) {
      this.endStreet();
    }
    return this;
  }

  legalActions()               {
    if (this.complete || this.actor === null) {
      throw new Error("Handa už skončila");
    }
    const seat = this.seats[this.actor];
    return this.legalActionsFor(seat);
  }

  legalActionsFor(seat           )               {
    const toCall = Math.max(0, this.currentBet - seat.committedStreet);
    const toCallCapped = Math.min(toCall, seat.stack);
    const maxRaiseTo = seat.committedStreet + seat.stack;

    const hasRaiseRights = !seat.hasActed || seat.actedAtRaiseLevel < this.raiseLevel;
    const someoneCanRespond = this.seats.some(
      (other) =>
        other.seat !== seat.seat && !other.folded && !other.allIn && other.stack > 0,
    );
    const canAggress = hasRaiseRights && someoneCanRespond && seat.stack > toCall;

    const fullMinRaiseTo =
      this.currentBet === 0 ? this.bigBlind : this.currentBet + this.lastRaiseSize;

    return {
      seat: seat.seat,
      toCall: toCallCapped,
      // Fold, když nic neplatíš, je sice formálně legální, ale rozbíjí
      // účtování: hráč, který dal víc než ostatní, by mohl foldnout a jeho
      // nevolaná část by zůstala v potu bez nárokujícího hráče. Zakazujeme ho.
      canFold: toCall > 0,
      canCheck: toCall === 0,
      canCall: toCall > 0 && seat.stack > 0,
      canBet: canAggress && this.currentBet === 0,
      canRaise: canAggress && this.currentBet > 0,
      minRaiseTo: Math.min(fullMinRaiseTo, maxRaiseTo),
      maxRaiseTo,
    };
  }

  apply(action        )       {
    if (this.complete || this.actor === null) {
      throw new Error("Handa už skončila, nelze hrát další akci");
    }

    const seat = this.seats[this.actor];
    const legal = this.legalActionsFor(seat);

    switch (action.type) {
      case "fold":
        if (!legal.canFold) throw new Error("Není co folovat, můžeš checkovat");
        seat.folded = true;
        this.record(seat, "fold", 0);
        break;

      case "check":
        if (!legal.canCheck) throw new Error("Nelze checkovat, soupeř vsadil");
        this.record(seat, "check", 0);
        break;

      case "call": {
        if (!legal.canCall) throw new Error("Není co dorovnávat");
        const pay = Math.min(legal.toCall, seat.stack);
        this.takeChips(seat, pay, true);
        this.record(seat, "call", pay);
        break;
      }

      case "bet":
      case "raise": {
        if (action.amount === undefined) {
          throw new Error("Bet/raise potřebuje částku");
        }
        const target = action.amount;
        if (!Number.isInteger(target)) throw new Error("Částka musí být celé číslo");

        const isBet = action.type === "bet";
        if (isBet && !legal.canBet) throw new Error("Teď nelze betovat");
        if (!isBet && !legal.canRaise) throw new Error("Teď nelze raisovat");

        if (target > legal.maxRaiseTo) {
          throw new Error(`Na ${target} nemáš žetony (max ${legal.maxRaiseTo})`);
        }
        if (target <= seat.committedStreet) {
          throw new Error("Navýšení musí být vyšší než tvoje současný vklad");
        }
        if (target <= this.currentBet) {
          throw new Error(`Navýšení musí být vyšší než současná sázka ${this.currentBet}`);
        }

        const fullMinRaiseTo =
          this.currentBet === 0 ? this.bigBlind : this.currentBet + this.lastRaiseSize;
        const isFullRaise = target >= fullMinRaiseTo;
        if (!isFullRaise && target !== legal.maxRaiseTo) {
          throw new Error(
            `Minimální navýšení je na ${fullMinRaiseTo} (nebo all-in za ${legal.maxRaiseTo})`,
          );
        }

        const pay = target - seat.committedStreet;
        this.takeChips(seat, pay, true);

        if (isFullRaise) {
          this.lastRaiseSize = target - this.currentBet;
          this.raiseLevel++;
          for (const other of this.seats) {
            if (other.seat !== seat.seat && !other.folded && !other.allIn) {
              other.hasActed = false;
            }
          }
        }
        // U short all-inu se raiseLevel ani lastRaiseSize nemění — tím pádem
        // hráči, kteří už jednali, ztrácí právo re-raise.

        this.currentBet = target;
        this.record(seat, action.type, pay, target);
        break;
      }

      default:
        throw new Error(`Neznámá akce ${String(action.type)}`);
    }

    seat.hasActed = true;
    seat.actedAtRaiseLevel = this.raiseLevel;

    this.afterAction();
  }

  seatState(seat        )            {
    const state = this.seats[seat];
    if (!state) throw new Error(`Neexistující seat ${seat}`);
    return state;
  }

  // ── interní ────────────────────────────────────────────────────────────────

          draw()       {
    if (this.deckIndex >= this.deck.length) {
      throw new Error("Došly karty v balíčku");
    }
    return this.deck[this.deckIndex++];
  }

  /** Vezme žetony ze stacku. Vrací skutečně zaplacenou částku. */
          takeChips(seat           , amount        , countsToStreet         )         {
    const pay = Math.min(amount, seat.stack);
    seat.stack -= pay;
    seat.committedHand += pay;
    if (countsToStreet) seat.committedStreet += pay;
    if (seat.stack === 0 && seat.hole.length > 0) seat.allIn = true;
    return pay;
  }

          record(seat           , action            , added        , raiseTo         )       {
    this.log.push({
      street: this.street,
      seat: seat.seat,
      action,
      added,
      raiseTo,
      potAfter: this.pot,
    });
  }

          afterAction()       {
    this.actionCount++;
    if (this.actionCount > this.maxActions) {
      throw new Error(`Překročen limit ${this.maxActions} akcí v handě — možná zacyklení`);
    }

    const live = this.seats.filter((s) => !s.folded);
    if (live.length === 1) {
      this.finishWithoutShowdown(live[0]);
      return;
    }

    if (this.isBettingRoundComplete()) {
      this.endStreet();
      return;
    }

    const next = this.nextToAct(this.actor );
    if (next === null) {
      this.endStreet();
    } else {
      this.actor = next;
    }
  }

          isBettingRoundComplete()          {
    const live = this.seats.filter((s) => !s.folded);
    const canAct = live.filter((s) => !s.allIn);
    if (canAct.length === 0) return true;
    return canAct.every((s) => s.hasActed && s.committedStreet === this.currentBet);
  }

          nextToAct(from        )                {
    const count = this.seats.length;
    for (let step = 1; step <= count; step++) {
      const index = (from + step) % count;
      const seat = this.seats[index];
      if (seat.folded || seat.allIn) continue;
      if (!seat.hasActed || seat.committedStreet !== this.currentBet) return index;
    }
    return null;
  }

          firstToActPreflop()                {
    if (this.seats.length === 2) {
      // Heads-up: preflop začíná button (small blind).
      return this.seats[this.button].allIn ? null : this.button;
    }
    return this.firstLiveFrom(this.bigBlindSeat);
  }

          firstToActPostflop()                {
    return this.firstLiveFrom(this.button);
  }

  /** První hráč po `from`, který ještě může jednat. */
          firstLiveFrom(from        )                {
    const count = this.seats.length;
    for (let step = 1; step <= count; step++) {
      const index = (from + step) % count;
      const seat = this.seats[index];
      if (!seat.folded && !seat.allIn) return index;
    }
    return null;
  }

          endStreet()       {
    for (;;) {
      if (this.street === "river") {
        this.doShowdown();
        return;
      }

      this.street = NEXT_STREET[this.street];
      for (const seat of this.seats) {
        seat.committedStreet = 0;
        seat.hasActed = false;
        seat.actedAtRaiseLevel = 0;
      }
      this.currentBet = 0;
      this.lastRaiseSize = this.bigBlind;
      this.raiseLevel = 0;

      this.dealBoard();

      const live = this.seats.filter((s) => !s.folded);
      if (live.length === 1) {
        this.finishWithoutShowdown(live[0]);
        return;
      }

      if (this.isBettingRoundComplete()) {
        // Všichni all-in → dorozdat board a jít dál.
        continue;
      }

      this.actor = this.firstToActPostflop();
      if (this.actor !== null) return;
      // Nikdo nemůže jednat → další street.
    }
  }

          dealBoard()       {
    const count = this.street === "flop" ? 3 : this.street === "turn" || this.street === "river" ? 1 : 0;
    for (let i = 0; i < count; i++) this.board.push(this.draw());
  }

          award(seat        , amount        )       {
    const state = this.seats[seat];
    state.stack += amount;
    state.won += amount;
  }

          finishWithoutShowdown(winner           )       {
    const total = this.pot;
    this.award(winner.seat, total);
    this.complete = true;
    this.street = "complete";
    this.actor = null;
    this.result = {
      board: [...this.board],
      showdown: false,
      payouts: [{ seat: winner.seat, amount: total }],
      pots: [{ amount: total, eligible: [winner.seat], winnerSeats: [winner.seat] }],
      hands: [],
    };
  }

          doShowdown()       {
    this.street = "showdown";
    this.complete = true;
    this.actor = null;

    const pots = buildPots(
      this.seats.map((s) => ({
        seat: s.seat,
        amount: s.committedHand,
        folded: s.folded,
      })),
    );

    const scores = new Map                ();
    for (const seat of this.seats) {
      if (!seat.folded) scores.set(seat.seat, evaluate7(seat.hole.concat(this.board)));
    }

    const order = this.seatOrderFromButton();
    const potResults              = [];
    const payouts                                     = [];

    for (const pot of pots) {
      const eligible = pot.eligible.filter((seat) => scores.has(seat));
      if (eligible.length === 0) {
        throw new Error(`Pot ${pot.amount} nemá žádného oprávněného hráče`);
      }
      const best = Math.max(...eligible.map((seat) => scores.get(seat) ));
      const winners = order.filter(
        (seat) => eligible.includes(seat) && scores.get(seat) === best,
      );

      const share = Math.floor(pot.amount / winners.length);
      let remainder = pot.amount - share * winners.length;

      for (const seat of winners) {
        // Nezvyklý žeton dostává první výherce po buttonu.
        const extra = remainder > 0 ? 1 : 0;
        if (extra) remainder--;
        this.award(seat, share + extra);
        payouts.push({ seat, amount: share + extra });
      }

      potResults.push({ amount: pot.amount, eligible: pot.eligible, winnerSeats: winners });
    }

    this.result = {
      board: [...this.board],
      showdown: true,
      payouts,
      pots: potResults,
      hands: this.seats
        .filter((s) => !s.folded)
        .map((s) => {
          const score = scores.get(s.seat) ;
          return {
            seat: s.seat,
            cards: [...s.hole],
            score,
            name: describeScore(score),
            category: scoreCategory(score),
          };
        }),
    };
  }

          seatOrderFromButton()           {
    const order           = [];
    const count = this.seats.length;
    for (let step = 1; step <= count; step++) {
      order.push((this.button + step) % count);
    }
    return order;
  }
}
