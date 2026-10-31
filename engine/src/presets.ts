/**
 * Presety stolů — od soft live poolu po regy.
 *
 * Tohle je odpověď na „realismus můžeme škálovat": nemění se jeden slider,
 * ale **složení poolu**. Člověk pak nehraje proti náhodné změti povah, ale
 * proti prostředí, které má charakter — a které se dá porazit.
 *
 * Výchozí preset je `live-soft`: většina hráčů jsou calling stations a loose-
 * passive, jeden TAG a jeden nit. Je to nejbližší realitě nízkých live stakes
 * a zároveň nejlepší místo na učení: vydělává se na tom value betem, ne na
 * tom, že přehráváš regy.
 */

import type { BotProfile } from "./archetypes.ts";
import { getArchetype } from "./archetypes.ts";

export interface TablePreset {
  id: string;
  name: string;
  description: string;
  /** Archetypy po seatedech (9). */
  lineup: readonly string[];
}

export const PRESETS: readonly TablePreset[] = [
  {
    id: "live-soft",
    name: "Live 1/2 (měkký)",
    description:
      "Tři volumeči, tři pasivní hráči, bázlivý, solidní a nit. " +
      "Hodně limping, málo 3-betů, bluf skoro žádný. Tady se učí hodnota.",
    lineup: [
      "station",
      "loose-passive",
      "weak-tight",
      "station",
      "loose-passive",
      "tag",
      "station",
      "nit",
      "loose-passive",
    ],
  },
  {
    id: "micro-online",
    name: "Mikro online",
    description:
      "Víc solidních a učebnicových hráčů, jeden záludný. Agresivnější, ale pořád hratelné.",
    lineup: ["tag", "abc", "station", "tag", "loose-passive", "abc", "tricky", "tag", "abc"],
  },
  {
    id: "reg-mixed",
    name: "Regové",
    description:
      "Jen solidní, učebnicoví a záludní. Slušně vyvážení, trestají víc chyb. Až později.",
    lineup: ["tag", "abc", "tricky", "tag", "abc", "tricky", "tag", "abc", "tricky"],
  },
  {
    id: "maniak",
    name: "Maniacký stůl",
    description:
      "Dva maniaci, volumeči a pár solidních. Vysoká variance, hodně akce. " +
      "Trénink využívání slabin, ne každodenní hra.",
    lineup: ["maniac", "station", "maniac", "loose-passive", "tag", "station", "tricky", "loose-passive", "tag"],
  },
];

export const DEFAULT_PRESET = "live-soft";

export function getPreset(id: string): TablePreset {
  const preset = PRESETS.find((candidate) => candidate.id === id);
  if (!preset) {
    const known = PRESETS.map((candidate) => candidate.id).join(", ");
    throw new Error(`Neznámý preset "${id}". Známé: ${known}`);
  }
  return preset;
}

/** Vrátí profily pro stůl — když je seatů víc než lineup, cyklí se. */
export function presetProfiles(id: string, seats = 9): BotProfile[] {
  const preset = getPreset(id);
  const profiles = preset.lineup.map((archetypeId) => getArchetype(archetypeId));
  return Array.from({ length: seats }, (_, index) => profiles[index % profiles.length]);
}
