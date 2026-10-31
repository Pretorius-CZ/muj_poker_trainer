/**
 * Headless simulace — nejdůležitější test celého enginu.
 *
 * Pustí tisíce hand a po každé zkontroluje invarianty:
 *   - součet žetonů na stole se rovná vloženým žetonům (nic se neztratilo),
 *   - nikdo nemá záporný stack ani NaN,
 *   - handa vždy skončí.
 *
 * Umí hrát třemi způsoby:
 *   - náhodnou politikou (fuzz test stavového automatu),
 *   - presetem stolu (live-soft, micro-online, reg-mixed, maniak),
 *   - simulací "hrdiny": jeden hráč hraje jinou strategii než zbytek stolu.
 */

import { Table } from "./table.ts";
import type { TableConfig } from "./table.ts";
import { createRng } from "./rng.ts";
import type { Policy } from "./bots.ts";
import { randomPolicy } from "./bots.ts";
import type { BotProfile } from "./archetypes.ts";
import { createArchetypePolicy } from "./archetypes.ts";
import { getArchetype } from "./archetypes.ts";
import { DEFAULT_PRESET, getPreset, presetProfiles } from "./presets.ts";

export interface SimulationOptions extends Partial<TableConfig> {
  hands: number;
  seed?: number;
  policy?: Policy;
  /** Když je zadáno, hraje se podle archetypů místo náhodné politiky. */
  profiles?: readonly BotProfile[];
  /** Iterace Monte Carla v archetypech (výchozí 80). */
  archetypeIterations?: number;
}

export interface SimulationStats {
  hands: number;
  seed: number;
  durationMs: number;
  handsPerSecond: number;
  showdowns: number;
  showdownRate: number;
  handsWithSidePots: number;
  biggestPot: number;
  averagePot: number;
  vpip: number;
  pfr: number;
  rebuys: number;
  totalChips: number;
  finalStacks: number[];
  errors: string[];
}

function defaultConfig(options: Partial<TableConfig>): TableConfig {
  return {
    numSeats: options.numSeats ?? 9,
    startStack: options.startStack ?? 100,
    smallBlind: options.smallBlind ?? 1,
    bigBlind: options.bigBlind ?? 2,
    ante: options.ante ?? 0,
  };
}

export function runSimulation(options: SimulationOptions): SimulationStats {
  const seed = options.seed ?? 12345;
  const config = defaultConfig(options);
  const rng = createRng(seed);
  const table = new Table(config);

  const policies: Policy[] | null = options.profiles
    ? options.profiles.map((profile) =>
        createArchetypePolicy(profile, {
          iterations: options.archetypeIterations ?? 80,
        }),
      )
    : null;

  const errors: string[] = [];
  let showdowns = 0;
  let handsWithSidePots = 0;
  let biggestPot = 0;
  let potSum = 0;
  let voluntaryActions = 0;
  let preflopRaises = 0;
  let seatHands = 0;

  const started = Date.now();

  for (let i = 0; i < options.hands; i++) {
    const hand = policies
      ? table.playHand(rng, policies)
      : table.playHand(rng, options.policy ?? randomPolicy);

    const pot = hand.pot;
    potSum += pot;
    if (pot > biggestPot) biggestPot = pot;
    if (hand.result?.showdown) showdowns++;
    if (hand.result && hand.result.pots.length > 1) handsWithSidePots++;

    const voluntary = new Set<number>();
    const raisers = new Set<number>();
    for (const event of hand.log) {
      if (event.street !== "preflop") continue;
      if (event.action === "call" || event.action === "bet" || event.action === "raise") {
        voluntary.add(event.seat);
      }
      if (event.action === "bet" || event.action === "raise") {
        raisers.add(event.seat);
      }
    }
    voluntaryActions += voluntary.size;
    preflopRaises += raisers.size;
    seatHands += hand.seats.length;

    for (const seat of hand.seats) {
      if (!Number.isFinite(seat.stack) || seat.stack < 0) {
        errors.push(
          `Handa ${i + 1}, seat ${seat.seat}: neplatný stack ${seat.stack}`,
        );
      }
    }

    const chipCount = table.chipCount;
    if (chipCount !== table.totalChips) {
      errors.push(
        `Handa ${i + 1}: žetony nesedí — na stole ${chipCount}, má být ${table.totalChips} ` +
          `(rozdíl ${chipCount - table.totalChips})`,
      );
    }

    if (errors.length > 5) break;
  }

  const durationMs = Date.now() - started;
  const hands = table.handCount;

  return {
    hands,
    seed,
    durationMs,
    handsPerSecond: durationMs > 0 ? Math.round((hands / durationMs) * 1000) : 0,
    showdowns,
    showdownRate: hands > 0 ? showdowns / hands : 0,
    handsWithSidePots,
    biggestPot,
    averagePot: hands > 0 ? potSum / hands : 0,
    vpip: seatHands > 0 ? voluntaryActions / seatHands : 0,
    pfr: seatHands > 0 ? preflopRaises / seatHands : 0,
    rebuys: table.rebuys,
    totalChips: table.totalChips,
    finalStacks: [...table.stacks],
    errors,
  };
}

export interface HeroSimulationOptions {
  hands: number;
  seed?: number;
  presetId?: string;
  heroProfile?: BotProfile;
  heroSeat?: number;
  heroIterations?: number;
  table?: Partial<TableConfig>;
}

export interface HeroSimulationStats {
  hands: number;
  presetId: string;
  presetName: string;
  heroSeat: number;
  heroName: string;
  /** Čistý zisk hrdiny v bb (bez rebuyů). */
  netBb: number;
  /** Zisk na 100 hand. */
  bbPer100: number;
  /** 95% interval spolehlivosti k bbPer100 (v bb/100). */
  bbPer100Ci: number;
  heroVpip: number;
  poolVpip: number;
  showdownRate: number;
  averagePot: number;
  handsPerSecond: number;
  errors: string[];
}

/**
 * Odehraje session, kde jeden seat hraje jinou strategii než zbytek stolu.
 *
 * Slouží k jediné otázce: **dá se na tomhle stole vyhrát?** Sleduje se čistý
 * zisk hrdiny v bb na 100 hand, ne výsledek jedné handy. Auto top-up se do
 * zisku nepočítá (měří se z initialStacks, tedy už po dorovnání).
 */
export function runHeroSimulation(options: HeroSimulationOptions): HeroSimulationStats {
  const seed = options.seed ?? 42;
  const presetId = options.presetId ?? DEFAULT_PRESET;
  const preset = getPreset(presetId);
  const heroSeat = options.heroSeat ?? 4;
  const heroProfile = options.heroProfile ?? getArchetype("tag");
  const config = defaultConfig({ numSeats: 9, ...options.table });

  if (heroSeat < 0 || heroSeat >= config.numSeats) {
    throw new Error(`Neplatný heroSeat ${heroSeat}`);
  }

  const profiles = presetProfiles(presetId, config.numSeats);
  profiles[heroSeat] = heroProfile;

  const policies = profiles.map((profile) =>
    createArchetypePolicy(profile, {
      iterations: options.heroIterations ?? 60,
    }),
  );

  const rng = createRng(seed);
  const table = new Table(config);

  let netChips = 0;
  let showdowns = 0;
  let potSum = 0;
  let heroVoluntary = 0;
  let heroHands = 0;
  let poolVoluntary = 0;
  let poolHands = 0;
  const heroResults: number[] = [];

  const errors: string[] = [];
  const started = Date.now();

  for (let i = 0; i < options.hands; i++) {
    const hand = table.playHand(rng, policies);

    netChips += hand.seats[heroSeat].stack - hand.initialStacks[heroSeat];
    heroResults.push(hand.seats[heroSeat].stack - hand.initialStacks[heroSeat]);
    potSum += hand.pot;
    if (hand.result?.showdown) showdowns++;

    const voluntary = new Set<number>();
    for (const event of hand.log) {
      if (event.street !== "preflop") continue;
      if (event.action === "call" || event.action === "bet" || event.action === "raise") {
        voluntary.add(event.seat);
      }
    }

    for (let seat = 0; seat < config.numSeats; seat++) {
      if (seat === heroSeat) {
        heroHands++;
        if (voluntary.has(seat)) heroVoluntary++;
      } else {
        poolHands++;
        if (voluntary.has(seat)) poolVoluntary++;
      }
    }

    if (table.chipCount !== table.totalChips) {
      errors.push(`Handa ${i + 1}: žetony nesedí`);
      break;
    }
  }

  const durationMs = Date.now() - started;
  const hands = table.handCount;

  // Směrodatná odchylka výsledků na handu → interval spolehlivosti.
  const count = Math.max(1, heroResults.length);
  const mean = heroResults.reduce((sum, value) => sum + value, 0) / count;
  const variance =
    heroResults.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    Math.max(1, count - 1);
  const standardError = Math.sqrt(variance) / Math.sqrt(count);
  const ciBbPer100 = 1.96 * (standardError / config.bigBlind) * 100;

  return {
    hands,
    presetId,
    presetName: preset.name,
    heroSeat,
    heroName: heroProfile.name,
    netBb: netChips / config.bigBlind,
    bbPer100:
      hands > 0 ? (netChips / config.bigBlind / hands) * 100 : 0,
    bbPer100Ci: ciBbPer100,
    heroVpip: heroHands > 0 ? heroVoluntary / heroHands : 0,
    poolVpip: poolHands > 0 ? poolVoluntary / poolHands : 0,
    showdownRate: hands > 0 ? showdowns / hands : 0,
    averagePot: hands > 0 ? potSum / hands : 0,
    handsPerSecond: durationMs > 0 ? Math.round((hands / durationMs) * 1000) : 0,
    errors,
  };
}

if (import.meta.main) {
  const hands = Number(process.argv[2] ?? 10000);
  const seed = Number(process.argv[3] ?? 12345);
  const lineupArg = process.argv[4];

  const presetId =
    lineupArg === undefined || lineupArg === "random"
      ? null
      : lineupArg === "archetypes"
        ? DEFAULT_PRESET
        : lineupArg;

  const profiles = presetId ? presetProfiles(presetId, 9) : undefined;
  const stats = runSimulation({
    hands,
    seed,
    profiles,
    archetypeIterations: 60,
  });

  console.log("─".repeat(62));
  console.log(
    `Simulace: ${stats.hands.toLocaleString("cs-CZ")} hand, seed ${stats.seed}` +
      (presetId ? `, preset ${getPreset(presetId).name}` : ", náhodní boti"),
  );
  console.log("─".repeat(62));
  console.log(
    `Trvání:             ${(stats.durationMs / 1000).toFixed(2)} s ` +
      `(${stats.handsPerSecond.toLocaleString("cs-CZ")} hand/s)`,
  );
  console.log(
    `Showdown:           ${stats.showdowns.toLocaleString("cs-CZ")} ` +
      `(${(stats.showdownRate * 100).toFixed(1)} %)`,
  );
  console.log(`VPIP / PFR:         ${(stats.vpip * 100).toFixed(1)} % / ${(stats.pfr * 100).toFixed(1)} %`);
  console.log(`Průměrný pot:       ${stats.averagePot.toFixed(1)} bb`);
  console.log(`Největší pot:       ${stats.biggestPot} bb`);
  console.log(`Handy se side poty: ${stats.handsWithSidePots.toLocaleString("cs-CZ")}`);
  console.log(`Rebuyů:             ${stats.rebuys.toLocaleString("cs-CZ")}`);
  console.log(`Žetony ve hře:      ${stats.totalChips.toLocaleString("cs-CZ")}`);

  if (stats.errors.length > 0) {
    console.error("\n❌ INVARIANTY PORUŠENY:");
    for (const error of stats.errors) console.error("   " + error);
    process.exitCode = 1;
  } else {
    console.log(
      "\n✅ Všechny invarianty drží: žetony sedí, žádný záporný stack, každá handa skončila.",
    );
  }
}
