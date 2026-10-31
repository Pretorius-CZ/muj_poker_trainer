import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PRESETS,
  DEFAULT_PRESET,
  getPreset,
  presetProfiles,
} from "../src/presets.ts";
import { getArchetype } from "../src/archetypes.ts";
import { runHeroSimulation } from "../src/sim.ts";

test("každý preset má devět platných archetypů", () => {
  for (const preset of PRESETS) {
    assert.equal(preset.lineup.length, 9, `preset ${preset.id}`);
    for (const archetypeId of preset.lineup) {
      assert.doesNotThrow(() => getArchetype(archetypeId));
    }
  }
});

test("výchozí preset je soft live stůl bez maniaka", () => {
  assert.equal(DEFAULT_PRESET, "live-soft");
  const lineup = getPreset(DEFAULT_PRESET).lineup;

  assert.ok(!lineup.includes("maniac"), "výchozí stůl nemá být chaos");
  const passive = lineup.filter(
    (id) => id === "station" || id === "loose-passive",
  ).length;
  assert.ok(passive >= 5, `výchozí stůl má být loose-passive, má ${passive}`);
});

test("neznámý preset je chyba", () => {
  assert.throws(() => getPreset("neexistuje"), /Neznámý preset/);
});

test("presetProfiles naplní stůl a zacyklí lineup", () => {
  const nine = presetProfiles("live-soft", 9);
  assert.equal(nine.length, 9);
  assert.ok(nine.every((profile) => typeof profile.name === "string"));

  const six = presetProfiles("live-soft", 6);
  assert.equal(six.length, 6);
});

test("soft stůl jde odehrát a je loose", () => {
  const stats = runHeroSimulation({
    hands: 80,
    seed: 3,
    presetId: "live-soft",
    heroIterations: 30,
  });

  assert.deepEqual(stats.errors, []);
  assert.equal(stats.hands, 80);
  assert.ok(
    stats.poolVpip > 0.25,
    `pool VPIP ${stats.poolVpip.toFixed(2)} má být loose (soft live stůl)`,
  );
});
