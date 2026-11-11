import type { ExtrasDesign } from "./extras";

/**
 * The cast of each level: what lives on the course laid out in levels.ts.
 * One entry per level, in order. Each level has a headline (the thing it is
 * remembered for) and each mountain has its own company:
 *
 *  1 Sunrise Glades  the resort: coin trails, learners, jumps, the fox
 *  2 Golden Ridge    wildlife and ice: deer, ice sheets, an avalanche
 *  3 Granite Dusk    the working mountain: snowcats, fog, blizzards
 *  4 North Face      shaped snow under the aurora, and everything at once
 *
 * A new thing is always met first on a stretch where getting it wrong costs
 * little. Ice lies only on the second mountain and banked snow only on the
 * fourth; ramps, once learned on the first, come back where there is a rock
 * on the line to fly, and can always be skied round.
 */
export type Cast = Partial<ExtrasDesign> & { name?: string; hint?: string };

export const CAST: Cast[] = [
  // ------------------------------------------------------------ Sunrise Glades
  {
    hint: "Follow the coins between the flags. Thread the glowing spot in a gate for a burst of speed.",
    coins: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  },
  {
    hint: "Coins lead out to the gold, and a rock sits on the short way round. Wide for gold, or tight for time.",
    coins: [0, 1, 3, 4, 6, 8, 10],
  },
  {
    name: "Ski school",
    hint: "Learners are out, wobbling down the piste. Overtake them wide, or skim past for a close call.",
    coins: [0, 4, 11],
    movers: [
      [2, "skier"],
      [7, "skier"],
      [9, "skier"],
    ],
  },
  {
    hint: "The first snowfall, and two funnels that close in as they go. Bullseye after bullseye keeps the carve boost lit.",
    weather: "snow",
    coins: [2, 3, 4, 5, 10, 11, 12, 15],
  },
  {
    name: "Fox's dare",
    hint: "Rusty the fox takes a head start and dares you to catch him. Beat him to the line for 1,000 points.",
    twist: "rival",
    rivalPace: 0.9,
    coins: [1, 5, 9, 14],
  },
  {
    name: "Big air",
    hint: "A ramp before every rock on the line. Hit it straight, fly the rock, and grab the coins in the air.",
    ramps: [2, 4, 8],
    coins: [3, 10, 12],
  },
  {
    name: "Bubble wrap",
    hint: "A shield takes one knock for you. Pick it up, then thread the learners in the chicanes.",
    powers: [
      [0, "shield"],
      [5, "shield"],
    ],
    movers: [
      [1, "skier"],
      [6, "skier"],
      [11, "skier"],
    ],
    coins: [13],
  },
  {
    name: "Magnetic",
    hint: "The magnet pulls in every coin you pass, even the ones out by the rocks.",
    powers: [
      [3, "magnet"],
      [8, "magnet"],
    ],
    coins: [4, 5, 6, 9, 10, 12, 13],
  },
  {
    name: "Gold rush",
    hint: "The whole slope is paved with coins and your magnet never runs out. Jump the staircase rocks, leave nothing.",
    twist: "goldrush",
    powers: [[5, "shield"]],
    ramps: [1, 3, 7],
    coins: [0, 2, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14],
  },
  {
    name: "Rush hour",
    hint: "Hairpins from edge to edge, in the snow, with the whole ski school in the way.",
    weather: "snow",
    powers: [[1, "shield"]],
    movers: [
      [3, "skier"],
      [6, "skier"],
      [10, "skier"],
      [12, "skier"],
    ],
    coins: [1, 14],
  },
  // -------------------------------------------------------------- Golden Ridge
  {
    name: "Deer country",
    hint: "Deer cross the ridge here. One stops, stares, then bolts: go behind it, never in front.",
    movers: [
      [9, "deer"],
      [14, "deer"],
      [18, "deer"],
      [20, "deer"],
    ],
    coins: [7, 8, 11, 16, 21],
  },
  {
    name: "Double or nothing",
    hint: "The ×2 doubles everything for eight seconds. Keep the combo alive through the corridor while it runs.",
    powers: [
      [2, "double"],
      [9, "double"],
    ],
    coins: [4, 7, 13, 14, 17],
  },
  {
    name: "Black ice",
    hint: "On ice the skis barely turn. Set your line before the blue, and ride it out.",
    ice: [2, 5, 12],
    coins: [11, 14, 17],
  },
  {
    name: "Stampede",
    hint: "A zigzag at short spacing, and the herd is on the move. Read each crossing early.",
    movers: [
      [2, "deer"],
      [6, "deer"],
      [10, "deer"],
      [14, "deer"],
      [18, "deer"],
    ],
    powers: [[4, "shield"]],
    coins: [1, 12, 16, 19],
  },
  {
    name: "Fox's revenge",
    hint: "Rusty has been practising, and he knows where the ice is. Beat him again.",
    twist: "rival",
    rivalPace: 0.92,
    ice: [1, 13],
    coins: [2, 10, 16, 19],
  },
  {
    name: "Frozen lake",
    hint: "Sheet after sheet of ice, a tight par and a huge time bonus. Aim early, turn on the snow between.",
    ice: [1, 3, 5, 7, 11, 13, 15, 17, 19],
    coins: [4, 14, 21],
  },
  {
    hint: "The fastest snow yet, and ramps on the straights. Stay loose in the air: the flicks come quick.",
    ramps: [5, 7, 12],
    coins: [3, 10, 15, 21],
    powers: [[9, "shield"]],
  },
  {
    hint: "Weaves, rock gates, hairpins and flicks, one after another, and deer in the gaps.",
    movers: [
      [7, "deer"],
      [14, "deer"],
      [20, "deer"],
    ],
    powers: [
      [1, "shield"],
      [10, "double"],
    ],
    coins: [0, 2, 9, 11, 18, 23],
  },
  {
    hint: "Twenty-six gates and every trick on the ridge: learners, deer, ice and a ×2 to hold through it.",
    movers: [
      [2, "skier"],
      [12, "deer"],
      [17, "deer"],
    ],
    ice: [4],
    powers: [[14, "double"]],
    coins: [6, 7, 9, 10, 19, 20, 25],
  },
  {
    name: "Avalanche!",
    hint: "The summit has let go. Bullseyes are speed, a missed gate lets the slide gain, and a tumble may be your last.",
    powers: [[2, "shield"]],
    twist: "avalanche",
    avalanchePace: 0.87,
    coins: [3, 8, 15, 16, 24, 25],
  },
  // -------------------------------------------------------------- Granite Dusk
  {
    name: "Groomers",
    hint: "The snowcats are out grooming, back and forth across the run. Watch the beacon and pass behind.",
    movers: [
      [2, "snowcat"],
      [9, "snowcat"],
      [14, "snowcat"],
      [21, "snowcat"],
    ],
    coins: [0, 5, 11, 17, 23],
  },
  {
    hint: "Weave after weave in falling snow, coins strung through the gaps, and deer coming down to the rocks.",
    weather: "snow",
    movers: [
      [8, "deer"],
      [14, "deer"],
      [20, "deer"],
    ],
    powers: [[2, "magnet"]],
    coins: [4, 6, 8, 10, 14, 16, 18, 20, 23],
  },
  {
    name: "Fog bank",
    hint: "Funnels that close to nothing, in fog. The flags come out of the grey late: trust the rhythm.",
    weather: "fog",
    powers: [[5, "double"]],
    coins: [1, 2, 3, 13, 14, 15, 25],
  },
  {
    hint: "Hairpin after hairpin at full tilt, and the deer come down to the piste at dusk.",
    movers: [
      [1, "deer"],
      [7, "deer"],
      [13, "deer"],
      [19, "deer"],
    ],
    powers: [[4, "shield"]],
    coins: [10, 16, 22, 25],
  },
  {
    name: "Fox in the couloir",
    hint: "Rusty picked the narrowest run on the mountain for round three. Twenty-eight gates of flicks.",
    twist: "rival",
    rivalPace: 0.93,
    coins: [0, 1, 26, 27],
  },
  {
    hint: "Staircases with a rock on every step, and a ramp before every other one. Fly two steps at a time.",
    ramps: [1, 3, 7, 9, 13, 15, 19, 21],
    coins: [24, 25, 26, 27],
  },
  {
    hint: "Hairpins into chicanes into hairpins, with a snowcat working each of the long crossings.",
    weather: "snow",
    movers: [
      [1, "snowcat"],
      [7, "snowcat"],
      [25, "snowcat"],
    ],
    powers: [[11, "shield"]],
    coins: [5, 17, 23, 27],
  },
  {
    hint: "A blizzard. Thirty gates of everything the mountain has, and you will not see much of it coming.",
    weather: "blizzard",
    movers: [
      [4, "deer"],
      [18, "snowcat"],
    ],
    powers: [
      [1, "shield"],
      [12, "double"],
    ],
    coins: [0, 6, 19, 20, 21, 27, 29],
  },
  {
    hint: "Tighter, faster, rockier, with a cat on the hairpins and a ramp over the last rock. One tumble is one too many.",
    movers: [
      [4, "snowcat"],
      [14, "deer"],
      [19, "snowcat"],
    ],
    ramps: [17],
    powers: [[9, "shield"]],
    coins: [2, 7, 16, 21, 29],
  },
  {
    hint: "The last word on rock: deer, cats, a staircase to fly and thirty gates with nothing to spare.",
    weather: "snow",
    movers: [
      [3, "snowcat"],
      [11, "deer"],
      [17, "snowcat"],
      [27, "deer"],
    ],
    ramps: [12, 14],
    powers: [
      [1, "shield"],
      [19, "double"],
    ],
    coins: [0, 4, 5, 18, 20, 21, 29],
  },
  // ---------------------------------------------------------------- North Face
  {
    hint: "Banked snow drags you sideways. Aim upslope, into the tilt, and hold it through the band.",
    powers: [[2, "shield"]],
    coins: [5, 6, 16],
  },
  {
    hint: "Walls that pull you to the middle, rock gates high up them, a staircase back down. Climb on purpose.",
    ramps: [10],
    coins: [3, 4, 15, 16, 21],
  },
  {
    hint: "A crown down the middle tips you off it. Hold a flank, cross it into rock gates, cross it blind.",
    powers: [[5, "magnet"]],
    coins: [6, 7, 17, 18],
  },
  {
    hint: "Two shelves and a bank between. Ride it down into rock gates, climb it against the push, and never twice the same way.",
    powers: [[3, "shield"]],
    coins: [4, 14, 15],
  },
  {
    name: "Fox over the rollers",
    hint: "Rusty knows what is behind every crest, and you do not. The last race, and the fastest.",
    twist: "rival",
    rivalPace: 0.94,
    coins: [3, 4, 13, 14, 21, 22],
  },
  {
    hint: "Sixty-metre stretches: the skid builds to full speed and carries past the bank. Then four banks into rock gates.",
    powers: [[5, "double"]],
    coins: [6, 10, 11, 12, 13],
  },
  {
    hint: "A crown throws you out, the dish after it pulls you in, and the flags sit up the wall. Read two bands ahead.",
    weather: "snow",
    powers: [[4, "shield"]],
    coins: [3, 5, 19, 20],
  },
  {
    hint: "A crest, then a flick you could not see. Steps into rock gates, both ways, and a staircase to fly.",
    ramps: [12, 14],
    coins: [1, 2, 6, 7, 8, 17, 18, 24, 25],
  },
  {
    name: "Loaded slope",
    hint: "Staircases, weaves and rock gates, each behind the shape of snow that makes it hardest. Tread lightly.",
    weather: "snow",
    powers: [[8, "shield"]],
    coins: [7, 9, 13, 20, 21, 22],
  },
  {
    name: "North face",
    hint: "The whole face is coming down behind you. Everything it taught, in order: miss a gate and the slide gains.",
    powers: [[9, "shield"]],
    twist: "avalanche",
    avalanchePace: 0.9,
    weather: "snow",
    coins: [7, 8, 9, 24, 25],
  },
];
