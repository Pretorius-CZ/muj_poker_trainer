/**
 * Demo: odehraje jednu handu u devítičlenného stolu a vypíše ji po streetech.
 *
 * Slouží k tomu, aby bylo vidět, že engine opravdu hraje — a aby se dalo
 * okem zkontrolovat, že se akce, pot a board chovají rozumně.
 *
 * Spuštění:
 *   node src/demo.ts [seed] [preset]
 *   node src/demo.ts 11 live-soft
 *   node src/demo.ts 11 reg-mixed
 *   node src/demo.ts 11            # náhodní boti
 */

import { Hand } from "./hand.ts";
import type { HandEvent } from "./hand.ts";
import { createRng } from "./rng.ts";
import { randomPolicy } from "./bots.ts";
import { cardsToString } from "./cards.ts";
import { createArchetypePolicy } from "./archetypes.ts";
import { DEFAULT_PRESET, getPreset, presetProfiles } from "./presets.ts";

const SEATS = 9;
const STACK = 100;
const SMALL_BLIND = 1;
const BIG_BLIND = 2;

function positionName(offset: number): string {
  switch (offset) {
    case 0:
      return "BTN";
    case 1:
      return "SB";
    case 2:
      return "BB";
    case 3:
      return "UTG";
    case 4:
      return "UTG+1";
    case 5:
      return "UTG+2";
    case 6:
      return "MP";
    case 7:
      return "HJ";
    case 8:
      return "CO";
    default:
      return `Seat ${offset}`;
  }
}

const ACTION_LABEL: Record<string, string> = {
  fold: "fold",
  check: "check",
  call: "call",
  bet: "bet",
  raise: "raise na",
};

function printEvent(event: HandEvent, names: string[]): void {
  const who = names[event.seat].padEnd(20);
  const action = ACTION_LABEL[event.action] ?? event.action;
  const amount =
    event.raiseTo !== undefined ? String(event.raiseTo) : event.added > 0 ? String(event.added) : "";
  console.log(`  ${who} ${action.padEnd(9)} ${amount.padStart(4)}  pot ${event.potAfter}`);
}

const seed = Number(process.argv[2] ?? 2026);
const presetArg = process.argv[3];
const presetId =
  presetArg === undefined || presetArg === "random"
    ? null
    : presetArg === "archetypes"
      ? DEFAULT_PRESET
      : presetArg;
const preset = presetId ? getPreset(presetId) : null;
const profiles = preset ? presetProfiles(preset.id, SEATS) : null;

const rng = createRng(seed);

const hand = new Hand({
  seats: Array.from({ length: SEATS }, () => ({ stack: STACK })),
  button: 0,
  smallBlind: SMALL_BLIND,
  bigBlind: BIG_BLIND,
  rng,
});

const policies = profiles
  ? profiles.map((profile) => createArchetypePolicy(profile, { iterations: 80 }))
  : null;

const names = hand.seats.map((seat) => {
  const offset = (seat.seat - hand.button + SEATS) % SEATS;
  const position = positionName(offset);
  return profiles ? `${position} ${profiles[seat.seat].name}` : position;
});

console.log(`\n${"─".repeat(56)}`);
console.log(
  `Handa · ${SEATS} hráčů · blindy ${SMALL_BLIND}/${BIG_BLIND} · stack ${STACK} bb` +
    (preset ? ` · ${preset.name}` : " · náhodní boti"),
);
console.log(`${"─".repeat(56)}\n`);

hand.start();

while (!hand.complete) {
  const actor = hand.actor!;
  hand.apply(
    policies ? policies[actor](hand, actor, rng) : randomPolicy(hand, actor, rng),
  );
}

const STREETS = [
  { name: "preflop", boardCount: 0 },
  { name: "flop", boardCount: 3 },
  { name: "turn", boardCount: 4 },
  { name: "river", boardCount: 5 },
] as const;

for (const street of STREETS) {
  if (hand.board.length < street.boardCount) break;

  if (street.boardCount === 0) {
    console.log("[preflop]");
  } else {
    const label = `[${street.name}]`;
    console.log(`\n${label.padEnd(8)} ${cardsToString(hand.board.slice(0, street.boardCount))}`);
  }

  for (const event of hand.log) {
    if (event.street === street.name) printEvent(event, names);
  }
}

console.log(`\n${"─".repeat(56)}`);

if (hand.result?.showdown) {
  for (const result of hand.result.hands) {
    console.log(
      `  ${names[result.seat].padEnd(20)} ${cardsToString(result.cards).padEnd(6)} ${result.name}`,
    );
  }
  console.log("");
}

const totals = new Map<number, number>();
for (const payout of hand.result?.payouts ?? []) {
  totals.set(payout.seat, (totals.get(payout.seat) ?? 0) + payout.amount);
}
for (const [seat, amount] of totals) {
  console.log(
    `  ${names[seat].padEnd(20)} vyhrává ${amount}${hand.result?.showdown ? "" : " (nikdo nedorovnal)"}`,
  );
}
console.log(`${"─".repeat(56)}\n`);
