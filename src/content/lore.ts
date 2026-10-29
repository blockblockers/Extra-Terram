// Extra Terram — src/content/lore.ts v0.1.0 — why these creeps on this world: the premise, and each home world under attack
// The premise: four worlds, each invaded by the race its own people cannot fight well — the matchup
// cycle made into a story. The invader of a world is the home race's weakness (its weapon barely
// scratches the invader's armour), which is why the world is losing and calls for help; any army can
// answer, and the one whose weapon bites the invader is the smart answer. Raiders of a third race
// follow the invader in on some worlds. Shown on the world intro before a solo level and in How to play.
import { content, raceById } from './index';

export interface WorldLore {
  /** The world's name as the game says it ("Forest moon"). */
  world: string;
  /** The home race's id. */
  home: string;
  /** The invader: the home race's weakness. */
  invader: string;
  /** One line: what is happening, for the intro screen. */
  line: string;
  /** Two or three sentences: who, why, and what the player holds. */
  story: string;
  /** What the invader wants here, for the artist and the intro's small print. */
  prize: string;
}

export const PREMISE = 'Four worlds, each under attack by the one race it cannot fight alone. Any army can answer the call — the one whose weapon bites the invader is the right one to bring.';

export const WORLD_LORE: Record<string, WorldLore> = {
  rootkin: {
    world: 'Forest moon',
    home: 'rootkin',
    invader: 'chitin',
    line: 'The Chitin Swarm has found the grove.',
    story: 'The Rootkin grew this moon from a seed, and the swarm has come to eat it: carapace turns thorns aside, and the hive feeds on what the roots grew. The trail runs to the heart-tree. Hold it.',
    prize: 'the sap and the heart-tree',
  },
  assembly: {
    world: 'Scrap plains',
    home: 'assembly',
    invader: 'rootkin',
    line: 'Rootkin growth is splitting the foundry.',
    story: 'Bark the machine guns barely scratch is pushing up through the plates of the Assembly’s foundry world, and the Lumenari raid the scrap in the confusion. The trench is the last cut line before the forge. Hold it.',
    prize: 'the scrap, and the forge’s heat',
  },
  chitin: {
    world: 'Hive tunnels',
    home: 'chitin',
    invader: 'lumenari',
    line: 'The Lumenari are burning into the brood gallery.',
    story: 'Shields that acid cannot bite carry the light down the tunnels toward the brood, and the Assembly follow for the resin. The gallery is the way to the queen. Hold it.',
    prize: 'the resin and the brood',
  },
  lumenari: {
    world: 'Crystal fields',
    home: 'lumenari',
    invader: 'assembly',
    line: 'The Assembly are mining the span.',
    story: 'Plated machines that light cannot cut are stripping the crystal fields, and Chitin and Rootkin raiders follow the noise. The span is the bridge to the Prism itself. Hold it.',
    prize: 'the crystal, cut and carried off',
  },
};

/** The lore for a map's world, with the invader as the level's own wave script says it. */
export function loreFor(world: string, invader?: string): WorldLore {
  const base = WORLD_LORE[world] ?? WORLD_LORE[content.races[0].id];
  return invader && invader !== base.invader ? { ...base, invader, line: `${raceById(invader).name} are on the trail.` } : base;
}
