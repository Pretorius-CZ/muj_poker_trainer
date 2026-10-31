/**
 * „Dá se na tomhle stole vyhrát?"
 *
 * Odehraje session, kde jeden seat (hrdina) hraje slušnou TAG strategii proti
 * zbytku stolu. Sleduje čistý zisk v bb/100 — tedy jestli je stůl porazitelný,
 * nebo jen frustrující.
 *
 * Spuštění:
 *   node src/hero.ts [hand] [preset] [archetyp hrdiny]
 *   node src/hero.ts 3000 live-soft tag
 */

import { runHeroSimulation } from "./sim.ts";
import { getArchetype } from "./archetypes.ts";
import { DEFAULT_PRESET, getPreset } from "./presets.ts";

const hands = Number(process.argv[2] ?? 2000);
const presetId = process.argv[3] ?? DEFAULT_PRESET;
const heroId = process.argv[4] ?? "tag";

const hero = getArchetype(heroId);
const preset = getPreset(presetId);

const stats = runHeroSimulation({
  hands,
  presetId,
  heroProfile: hero,
  heroIterations: 60,
  seed: 2024,
});

const sign = stats.netBb >= 0 ? "+" : "";

console.log("─".repeat(62));
console.log(`Stůl:   ${preset.name}  (${preset.lineup.length} hráčů)`);
console.log(`Hrdina: ${stats.heroName} na seat ${stats.heroSeat + 1}`);
console.log(`Hand:   ${stats.hands.toLocaleString("cs-CZ")}`);
console.log("─".repeat(62));
console.log(`Čistý zisk:        ${sign}${stats.netBb.toFixed(1)} bb`);
console.log(
  `Výsledek:          ${sign}${stats.bbPer100.toFixed(1)} bb/100 ± ${stats.bbPer100Ci.toFixed(1)}`,
);
console.log(
  `VPIP hrdiny/poolu: ${(stats.heroVpip * 100).toFixed(1)} % / ${(stats.poolVpip * 100).toFixed(1)} %`,
);
console.log(`Showdown:          ${(stats.showdownRate * 100).toFixed(1)} %`);
console.log(`Průměrný pot:      ${stats.averagePot.toFixed(1)} bb`);
console.log(`Rychlost:          ${stats.handsPerSecond.toLocaleString("cs-CZ")} hand/s`);

if (stats.errors.length > 0) {
  console.error("\n❌ " + stats.errors.join("\n❌ "));
  process.exitCode = 1;
} else {
  console.log("\n✅ Invarianty drží.");
}

console.log(
  `\nInterval je 95% a počítá se z rozptylu výsledků na handu. ` +
    `Po ${stats.hands.toLocaleString("cs-CZ")} handách je to orientační — ` +
    `na skutečné bb/100 potřebuješ desítky tisíc hand.`,
);
