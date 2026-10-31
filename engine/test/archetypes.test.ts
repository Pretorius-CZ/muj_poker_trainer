import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ARCHETYPES,
  getArchetype,
  seatArchetypes,
  createArchetypePolicy,
} from "../src/archetypes.ts";
import { runSimulation } from "../src/sim.ts";
import { createRng } from "../src/rng.ts";
import { Table } from "../src/table.ts";

test("neznámý archetyp je chyba", () => {
  assert.throws(() => getArchetype("neexistuje"), /Neznámý archetyp/);
});

test("rozesazení archetypů se opakuje", () => {
  const profiles = seatArchetypes(ARCHETYPES.slice(0, 3), 7);
  assert.equal(profiles.length, 7);
  assert.equal(profiles[3].id, profiles[0].id);
});

test("každý archetyp umí odehrát handu legálně", () => {
  for (const profile of ARCHETYPES) {
    const table = new Table({
      numSeats: 6,
      startStack: 100,
      smallBlind: 1,
      bigBlind: 2,
    });
    const policy = createArchetypePolicy(profile, { iterations: 20 });
    let completed = 0;

    for (let hand = 0; hand < 4; hand++) {
      table.playHand(createRng(hand + 1), policy);
      completed++;
    }

    assert.equal(completed, 4, `archetyp ${profile.id} nedohrál všech 4 handy`);
  }
});

test("calling station hraje víc hand než nit", () => {
  const nit = getArchetype("nit");
  const station = getArchetype("station");

  const nitStats = runSimulation({
    hands: 120,
    seed: 5,
    profiles: Array.from({ length: 9 }, () => nit),
    archetypeIterations: 30,
  });
  const stationStats = runSimulation({
    hands: 120,
    seed: 5,
    profiles: Array.from({ length: 9 }, () => station),
    archetypeIterations: 30,
  });

  assert.deepEqual(nitStats.errors, []);
  assert.deepEqual(stationStats.errors, []);

  assert.ok(
    stationStats.vpip > nitStats.vpip + 0.15,
    `station VPIP ${stationStats.vpip.toFixed(2)} má být výrazně vyšší než nit ${nitStats.vpip.toFixed(2)}`,
  );
  assert.ok(nitStats.vpip < 0.3, `nit VPIP ${nitStats.vpip.toFixed(2)} má být nízký`);
});

test("maniak raisuje preflop víc než nit", () => {
  const nit = getArchetype("nit");
  const maniac = getArchetype("maniac");

  const nitStats = runSimulation({
    hands: 120,
    seed: 6,
    profiles: Array.from({ length: 9 }, () => nit),
    archetypeIterations: 30,
  });
  const maniacStats = runSimulation({
    hands: 120,
    seed: 6,
    profiles: Array.from({ length: 9 }, () => maniac),
    archetypeIterations: 30,
  });

  assert.ok(
    maniacStats.pfr > nitStats.pfr + 0.1,
    `maniak PFR ${maniacStats.pfr.toFixed(2)} vs nit ${nitStats.pfr.toFixed(2)}`,
  );
  assert.ok(maniacStats.errors.length === 0);
});

test("smíchaný stůl archetypů drží invarianty", () => {
  const stats = runSimulation({
    hands: 150,
    seed: 7,
    profiles: seatArchetypes(ARCHETYPES, 9),
    archetypeIterations: 30,
  });

  assert.deepEqual(stats.errors, []);
  assert.ok(stats.vpip > 0.15 && stats.vpip < 0.6, `VPIP ${stats.vpip.toFixed(2)}`);
  assert.equal(
    stats.finalStacks.reduce((sum, stack) => sum + stack, 0),
    stats.totalChips,
  );
});
