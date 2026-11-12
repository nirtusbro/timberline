import { EXTRAS_BASE } from "./extras";
import type { GateSpec, LevelDesign, MoverKind, PowerKind, SlopeSpec } from "./levels";
import type { Leg } from "./trail";

/**
 * The campaign: forty levels in five worlds of eight. Every world runs the
 * same way: two levels that teach its ideas where a mistake costs little, a
 * twist, tests and one breather, a race against Rusty the fox, and a hard
 * last word. Each level is written as phrases of gates (a rhythm, a set of
 * flicks, a staircase, a funnel), usually an opening, a set piece and a
 * finale, and each stretch between two gates may carry tags that say what is
 * on it:
 *
 *   c coins        t gold token    L rock on the line   J ramp (over the rock)
 *   G rock gate    W weave         w stray rock         i ice
 *   X chasm        N7..N10 walls this far either side of the line
 *   S learner      D deer crossing H deer of the herd   K snowcat
 *   P plough       B boulder (B! lands on the line)
 *   sh mg x2       shield, magnet, double
 *   cam+ cam- dish crown roll step+ step-   shaped snow
 *
 * House rules, kept by tests: gold always comes with a coin trail to it; a
 * rock gate is only ever threaded nearly straight on; nothing that needs a
 * long lead (learners, the herd, ploughs, snowcats) stands in the first four
 * stretches; the stretch into a fork is never walled; a chasm lands within
 * five metres of a wide gate.
 */
interface G {
  x: number;
  gap: number;
  /** Width as a multiple of the level's flag spacing. */
  w?: number;
  /** Tags for the stretch from this gate to the next. */
  t: string;
  /** A moving gate: how far it slides, how fast, and whether at a steady pace. */
  drift?: [amp: number, rate: number, saw?: boolean];
  /** A fork: where the second opening stands. */
  alt?: number;
  /** This gap is not stretched to the tempo of the level: a leap is as long as a leap is. */
  fixed?: boolean;
}
const g = (x: number, gap: number, t = "", more: Partial<G> = {}): G => ({ x, gap, t, ...more });
/** A rhythm: gates alternating either side of the middle. */
const sway = (n: number, amp: number, gap: number, t = "", first = 1, more: Partial<G> = {}) =>
  Array.from({ length: n }, (_, i) => g((i % 2 ? -1 : 1) * first * amp, gap, t, more));
/** A rhythm that swings wider (or tighter) as it goes. */
const grow = (n: number, from: number, to: number, gap: number, t = "", first = 1) =>
  Array.from({ length: n }, (_, i) =>
    g(Math.round((i % 2 ? -1 : 1) * first * (from + ((to - from) * i) / Math.max(1, n - 1)) * 10) / 10, gap, t),
  );
/** A staircase: gates stepping across the slope, each nearly below the last. */
const stairs = (n: number, from: number, step: number, gap: number, t = "") =>
  Array.from({ length: n }, (_, i) => g(Math.round((from + i * step) * 10) / 10, gap, t));
/** Quick flicks about a centre line. */
const flicks = (n: number, amp: number, centre = 0, t = "", first = 1, gap = 32) =>
  Array.from({ length: n }, (_, i) => g(centre + (i % 2 ? -1 : 1) * first * amp, gap, t));
/** Adds tags to some gates of a phrase. */
const on = (gates: G[], which: number[], t: string) => {
  for (const i of which) if (gates[i]) gates[i] = { ...gates[i], t: `${gates[i].t} ${t}`.trim() };
  return gates;
};
/** Replaces the tags of a phrase's last gate: what follows it is usually different. */
const last = (gates: G[], t: string) => {
  gates[gates.length - 1] = { ...gates[gates.length - 1], t };
  return gates;
};

type Options = Partial<
  Pick<
    LevelDesign,
    "speed" | "baseWidth" | "turnAngle" | "forkRocks" | "detour" | "parFactor" | "timeBonusRate" | "weather" | "night" | "twist" | "rivalPace" | "avalanchePace"
  >
> & {
  /** The trail, leg by leg: see `T`. Left short, it carries on in easy sweeps for as long as the gates need. */
  path?: Leg[];
  /** Every gap between gates is stretched by this much: the phrases are written at a rhythm, the level sets the tempo. */
  stretch?: number;
  /** Gates to set easier: see LevelDesign. */
  soften?: number[];
  /** How far across the trail the gates are swung, as a share of what is usual in its world: less on shaped snow, which swings the skier itself. */
  swing?: number;
};
const MOVERS: Record<string, MoverKind> = { S: "skier", D: "deer", K: "snowcat", H: "herd", P: "plough", B: "boulder" };
const POWERS: Record<string, PowerKind> = { sh: "shield", mg: "magnet", x2: "double" };
const SLOPES: Record<string, SlopeSpec extends [number, ...infer R] ? R : never> = {
  "cam+": [1, "camber"],
  "cam-": [-1, "camber"],
  dish: [1, "dish"],
  crown: [1, "crown"],
  roll: [1, "roller"],
  "step+": [1, "step"],
  "step-": [-1, "step"],
};
/**
 * The setting of a course, by world. The phrases of a level are written as a
 * rhythm about the middle of the trail; this is how far across the trail that
 * rhythm is swung, how far apart its gates are set, and how hard the trail
 * itself bends. Later worlds swing wider on tighter bends: there the line into
 * a gate has to be chosen two gates ahead, not found at the last moment.
 */
const SWING = [1.65, 2.0, 2.1, 2.2, 2.3];
const SPACING = [1.1, 1.12, 1.14, 1.16, 1.18];
/** A leg that turns is laid in this share of its written length, so the bend is tighter; a leg that holds its line is laid longer. */
const BEND = [0.8, 0.72, 0.7, 0.68, 0.66];
const HOLD = 1.12;
/** A course whose gates run to more than this along its trail has plain gates taken out, as far as it has them to spare. */
const LONGEST = 1300;
let built = 0;
function level(name: string, role: LevelDesign["role"], hint: string, { stretch = 1, swing = 1, path = [], ...options }: Options, ...phrases: G[][]): LevelDesign {
  const world = Math.min(4, Math.floor(built++ / 8));
  const wide = SWING[world] * swing;
  let gates = phrases.flat().map((gate) => ({
    ...gate,
    // A leap is aimed before the lip and cannot be corrected: its gates stay where they were written.
    x: gate.fixed ? gate.x : Math.round(gate.x * wide * 10) / 10,
    alt: gate.alt === undefined ? undefined : Math.round(gate.alt * wide * 10) / 10,
    gap: gate.fixed ? gate.gap : Math.round(gate.gap * stretch * SPACING[world]),
  }));
  // Too long: every so often a gate with nothing on its stretch but coins is left out.
  const plain = (gate: G) => !gate.fixed && !gate.drift && gate.alt === undefined && (gate.t === "" || gate.t === "c");
  for (let every = 6; every >= 3 && gates.reduce((sum, gate) => sum + gate.gap, 0) > LONGEST; every--) {
    let run = 0;
    gates = gates.filter((gate, i) => {
      if (i < 3 || i > gates.length - 3 || !plain(gate) || gates[i + 1]?.fixed) return true;
      return ++run % every !== 0;
    });
  }
  // The three levels that are already what the rest should be are left exactly as written.
  const level0 = built - 1;
  const asWritten = level0 === 17 || level0 === 38 || level0 === 39;
  if (!asWritten) {
    // Every second stretch with nothing on it gets something in the way: rock beside the line, on it or strewn across it, a learner, a deer, a falling boulder, by turns.
    // From the river on, every fifth plain gate rides a rail. At night there is only ever the one rock: the lamp shows no more.
    const rocks = [
      ["w", "L", "S", "w", "L"],
      ["w", "D", "L", "F", "w"],
      ["w", "F", "L", "w", "F"],
      ["F", "B", "w", "L", "F"],
      ["F", "L", "B", "w", "F"],
    ][world];
    // A level of ice is ice nearly all the way down: every open stretch that gets no rock gets a sheet.
    const icy = gates.filter((gate) => /(^| )i( |$)/.test(gate.t)).length >= 3;
    let bare = 0,
      railed = 0;
    gates = gates.map((gate, i) => {
      const before = gates[i - 1],
        after = gates[i + 1];
      if (i < 2 || i > gates.length - 3 || !plain(gate) || !after || after.fixed || before?.fixed || /X/.test(before?.t ?? "")) return gate;
      bare++;
      // The first level of all is left clear: it is where the turning is learned.
      // The switchback road has its ploughs: it gets no more than that.
      if (bare % 2 === 0 && level0 > 0 && level0 !== 26) {
        // Something that needs a long lead is not put where it could not be seen coming.
        let what = options.night ? ["w", "L"][(bare / 2) % 2] : rocks[(bare / 2) % rocks.length];
        if (what === "S" && i < 5) what = "w";
        return { ...gate, t: (gate.t + " " + what).trim() };
      }
      if (icy && bare % 2 === 1) return { ...gate, t: (gate.t + " i").trim() };
      if (world >= 2 && !options.night && bare % 6 === 1 && plain(after) && ++railed) {
        const saw = railed % 2 === 0;
        return { ...gate, x: Math.round(gate.x * 0.3 * 10) / 10, w: 1.12, drift: [saw ? 7 : 6, saw ? 1.25 : 1.2, saw] as [number, number, boolean] };
      }
      return gate;
    });
  }
  path = path.map((leg, i) => {
    const before = path.slice(0, i).reverse().find((l) => l.to !== undefined)?.to ?? 0;
    const turns = leg.to !== undefined && leg.to !== before;
    return { ...leg, len: Math.round(leg.len * (i === 0 ? 1 : turns ? BEND[world] : HOLD)) };
  });
  gates[0] = { ...gates[0], gap: Math.max(72, gates[0].gap) };
  const d: LevelDesign = {
    ...EXTRAS_BASE,
    coins: [],
    ramps: [],
    chasms: [],
    ice: [],
    powers: [],
    movers: [],
    name,
    hint,
    role,
    path: [...path],
    gates: gates.map((gate): GateSpec => [gate.x, gate.gap, gate.w ?? 1]),
    baseWidth: 8,
    speed: 26,
    turnAngle: 0.88,
    pickupRadius: 2.2,
    detour: 4.8,
    tokenFraction: 0.5,
    tokens: [],
    forkRocks: true,
    guards: [],
    wideRocks: [],
    lineRocks: [],
    soften: [],
    fields: [],
    rockGates: [],
    weaves: [],
    slopes: [],
    drifts: [],
    forks: [],
    narrows: [],
    parFactor: 1.12,
    timeBonusRate: 120,
    ...options,
  };
  // And they are skied faster, between narrower flags; a night run only as fast as its lamp allows.
  if (!asWritten) {
    d.speed = Math.round(d.speed * (d.night ? 1 : 1.08) * 10) / 10;
    d.baseWidth = Math.round(d.baseWidth * 0.9 * 10) / 10;
  }
  gates.forEach((gate, i) => {
    if (gate.drift) d.drifts.push([i, ...gate.drift]);
    if (gate.alt !== undefined) d.forks.push([i, gate.alt]);
    for (const tag of gate.t.split(" ").filter(Boolean)) {
      if (tag === "c") d.coins.push(i);
      else if (tag === "t") d.tokens.push(i);
      else if (tag === "L") d.lineRocks.push(i);
      else if (tag === "J") d.ramps.push(i);
      else if (tag === "G") d.rockGates.push(i);
      else if (tag === "W") d.weaves.push(i);
      else if (tag === "w") d.wideRocks.push(i);
      else if (tag === "F") d.fields.push(i);
      else if (tag === "i") d.ice.push(i);
      else if (tag === "X") d.chasms.push(i);
      else if (/^N\d+$/.test(tag)) d.narrows.push([i, Number(tag.slice(1))]);
      else if (MOVERS[tag]) d.movers.push([i, MOVERS[tag]]);
      else if (POWERS[tag]) d.powers.push([i, POWERS[tag]]);
      else if (SLOPES[tag]) d.slopes.push([i, ...SLOPES[tag]] as SlopeSpec);
      else throw new Error(`${name}: unknown tag "${tag}"`);
    }
  });
  // A trail that stops short of its gates carries on in easy sweeps, as wide and as steep as it ended.
  const need = gates.reduce((sum, gate) => sum + gate.gap, 0) + 80;
  let laid = d.path.reduce((sum, leg) => sum + leg.len, 0);
  const lastTurn = [...d.path].reverse().find((leg) => leg.to !== undefined)?.to ?? 0;
  for (let k = lastTurn > 0 ? 1 : 0; laid < need; k++, laid += 150) d.path.push({ len: 150, to: k % 2 ? -24 : 24 });
  return d;
}
/** A trail, leg by leg: metres, then the direction it has come round to (degrees off the fall line, + to the skier's left), half-width and pitch, each kept from the leg before when left out. */
export const T = (...legs: [len: number, to?: number, half?: number, pitch?: number][]): Leg[] =>
  legs.map(([len, to, half, pitch]) => ({ len, to, half, pitch }));
/** A leap: the gate before the lip, and the wide gate that catches the landing. These distances are the leap's own, whatever the tempo. */
const leap = (from: number, to: number): G[] => [g(from, 62, "X", { fixed: true }), g(to, 100, "c", { w: 1.2, fixed: true })];
/** A moving gate: the middle of its rail, how far it slides either way and how fast, and how wide it is. */
const slide = (x: number, gap: number, amp: number, rate: number, t = "c", more: Partial<G> = {}) => g(x, gap, t, { drift: [amp, rate], w: 1.12, ...more });
/** One that shuttles at a steady pace and turns on the spot at each end of a shorter rail: quicker to read, quicker to be wrong about. */
const shuttle = (x: number, gap: number, amp: number, rate: number, t = "c") => g(x, gap, t, { drift: [amp + 2, rate * 0.78, true], w: 1.05 });

export const CAMPAIGN: LevelDesign[] = [
  // ================================================================ 1 Sunny Side
  level(
    "First Tracks",
    "teach",
    "The piste swings down the hill in long easy bends. Hold your thumb over to turn with it, and pass between the flags.",
    { speed: 22.5, baseWidth: 10, forkRocks: false, parFactor: 1.25, stretch: 1.2, path: T([110, 0, 23], [150, 24], [170, -26], [160, 22], [150, -20], [120, 0]) },
    on(grow(12, 3, 5, 50, "c"), [3, 6, 9], "t"),
  ),
  level(
    "Bullseye Alley",
    "teach",
    "A lane of flags that closes in. Thread the glowing spots back to back and feel the boost build; mind the two rocks near the end.",
    { speed: 23, baseWidth: 9.4, parFactor: 1.22, stretch: 1.2, path: T([100, 0, 22], [170, -28], [120, -28], [170, 26], [140, 0], [150, -22]) },
    on(
      Array.from({ length: 16 }, (_, i) => g(Math.round((i % 2 ? -1 : 1) * (4.6 - i * 0.06) * 10) / 10, 44, i % 2 ? "" : "c", { w: 1 - i * 0.016 })),
      [10, 13],
      "w",
    ),
  ),
  level(
    "Ski School",
    "teach",
    "The ski school is out, each of them making long slow turns right across the piste. Read which way they are going and pass behind.",
    { speed: 23.5, baseWidth: 9.2, stretch: 1.2, path: T([110, 0, 26], [160, 26], [150, -10], [170, -30], [160, 18], [150, -16]) },
    on(sway(14, 4.6, 48, "c"), [3, 5, 8, 10, 12], "S"),
  ),
  level(
    "Kicker Park",
    "twist",
    "A rock on the line, and a kicker before it. Line up and fly it for the coins, or ski round and lose the time.",
    { speed: 24, baseWidth: 9, forkRocks: false, stretch: 1.2, path: T([110, 0, 24], [150, 20, 24, 1.05], [140, -24], [130, -24, 26, 1.1], [150, 22], [140, 0]) },
    [g(3, 60, "L J"), g(6, 50, "c"), g(-3, 54, "L J"), g(-6, 50, "c"), g(4.5, 54, "t c"), g(-4.5, 52, "F J")],
    [g(-5, 54, "c"), g(3.5, 54, "L J"), g(6, 50, "c"), g(-4.5, 54, "t c"), g(-1, 50, "F J"), g(3, 54, "c"), g(-4, 52, "w"), g(4.5, 52, "c")],
  ),
  level(
    "Stadium Slalom",
    "test",
    "A steep pitch, red and blue all the way down and the clock running. A smooth round line keeps the speed; a jerky one bleeds it.",
    { speed: 24.5, baseWidth: 8.6, parFactor: 1.04, timeBonusRate: 300, stretch: 1.2, path: T([100, 0, 21, 1.08], [200, 14], [200, -16, 21, 1.14], [200, 12], [200, -8]) },
    sway(9, 4.4, 46),
    [g(0, 50, "x2")],
    sway(8, 5.2, 44, "", -1),
  ),
  level(
    "Gold Rush",
    "breather",
    "A great open bowl paved with coins, and a magnet that never runs out. Swing as wide as you like and leave nothing.",
    { speed: 24, baseWidth: 9, twist: "goldrush", stretch: 1.2, path: T([100, 0, 24], [150, 30, 32], [150, 30, 34], [170, -34], [140, -34], [170, 28, 30], [150, 0, 26]) },
    sway(5, 5.5, 50, "c"),
    [g(-4, 52, "L J"), g(-8, 50, "c"), g(5, 56, "c"), g(2, 48, "L J"), g(-2, 48, "c")],
    sway(6, 6.5, 50, "c"),
  ),
  level(
    "The Merge",
    "test",
    "The piste traverses the hill and funnels between the trees, with the ski school in it and a snowcat grooming across the way.",
    { speed: 25, baseWidth: 8.6, stretch: 1.2, path: T([100, 0, 24], [140, 38], [130, 38, 20], [150, -10, 14], [140, -36, 13], [120, -36, 16], [150, 20, 22], [150, 0]) },
    sway(5, 5, 52, "c"),
    on(sway(4, 3.6, 50, "", -1), [1, 3], "S"),
    [g(0, 54, "K"), g(3, 54, "c")],
    on(sway(5, 3.8, 50, "", -1), [0, 2], "S"),
    [g(-3, 50, "w"), g(3, 50, "c")],
  ),
  level(
    "Fox's Dare",
    "race",
    "Rusty the fox takes a head start down the long way round the hill and dares you to catch him. The third star is his.",
    { speed: 25.5, baseWidth: 8.4, twist: "rival", rivalPace: 0.96, stretch: 1.2, path: T([100, 0, 22], [150, -34], [130, -34], [170, 40], [140, 40], [170, -30, 22, 1.08], [150, 0]) },
    grow(6, 3.5, 6, 48, "c"),
    [g(0, 50, "w"), g(4, 46, ""), g(-3, 46, "L J")],
    sway(5, 5.5, 46, "c"),
    [g(2, 50, "w"), g(-3, 50, "c"), g(3, 48, "c")],
  ),
  // ================================================================ 2 Pinewood
  level(
    "Into the Trees",
    "teach",
    "A narrow trail that winds through the pines. The deep snow at its edge drags; the trunks beyond it do worse. Turn early.",
    { speed: 28, baseWidth: 7.9, stretch: 1.14, path: T([100, 0, 15], [120, 40, 13], [110, 40], [140, -42], [100, -42], [140, 36, 14], [120, 36], [150, -30], [140, 0]) },
    // The flags stand on the inside of each bend: the trail turns left, right, left, right.
    [g(0, 60, "c"), g(4, 50, "c"), g(5, 50, "c"), g(2, 50, "c"), g(-4, 50, "c"), g(-5, 50, "c"), g(-2, 50, "c")],
    [g(4, 50, "c"), g(5, 50, "c"), g(2, 50, "w"), g(-4, 50, "c"), g(-5, 50, "c"), g(0, 50, "c"), g(3, 50, "c")],
  ),
  level(
    "Deer Meadow",
    "teach",
    "Out of the trees into a clearing, and deer crossing it. Each trots out, stops on your line to stare, then bolts on: go behind, never in front.",
    { speed: 28.5, baseWidth: 7.9, stretch: 1.14, path: T([100, 0, 15], [130, 32, 14], [120, 32, 26], [160, -20, 30], [160, -34, 30], [130, -34, 16], [140, 20, 14], [140, 0]) },
    sway(3, 3.5, 50, "c"),
    [g(-5, 52, "c")],
    on(stairs(4, -3, 3, 48, "c"), [0, 2], "D"),
    [g(-5, 52, "D"), g(5, 50, "c"), g(-5, 50, "D"), g(5, 50, "c"), g(0, 50, "D")],
    sway(3, 3.5, 48, "c", -1),
  ),
  level(
    "Fork in the Woods",
    "teach",
    "The trail splits round a stand of trees. Either side counts; the far one has the coins, and the logs.",
    { speed: 29, baseWidth: 7.7, stretch: 1.14, path: T([100, 0, 18], [130, -30, 18], [130, -30, 20], [150, 34], [120, 34], [150, -28], [140, 10], [140, -10]) },
    [g(3.5, 60, "c"), g(-3.5, 50, "c"), g(3.5, 50, "c")],
    [g(-5.5, 58, "c", { alt: 5.5 }), g(0, 54, "L"), g(4, 50, "c")],
    [g(5.5, 58, "c", { alt: -5.5 }), g(0, 54, "w"), g(-4, 50, "c")],
    [g(-6, 58, "c", { alt: 6 }), g(0, 54, "L")],
    sway(4, 4.2, 48, "c"),
  ),
  level(
    "Timber!",
    "twist",
    "The loggers left their piles across the trail, and a kicker before each. Fly them in staircases, or thread round and lose your rhythm.",
    { swing: 1.3, speed: 29.5, baseWidth: 7.7, stretch: 1.14, path: T([100, 0, 18], [140, 28, 18, 1.06], [130, 28], [160, -32, 19], [130, -32, 19, 1.1], [150, 24], [140, 0]) },
    stairs(4, -5, 3.2, 46, "L J"),
    [g(5, 48, "c"), g(-4.5, 52, "w")],
    stairs(4, 5, -3.2, 46, "L J"),
    [g(-5, 48, "c"), g(5, 52, "F J")],
    stairs(3, 2, -3.2, 46, "L J"),
    [g(-5, 48, "c"), g(4.5, 50, "c")],
  ),
  level(
    "Hollow Way",
    "breather",
    "A sunken lane that snakes down through the wood. Its banks carry you back to the middle like a bobsled: climb them for the flags.",
    { swing: 0.7, speed: 29, baseWidth: 8.1, stretch: 1.14, path: T([100, 0, 17], [110, -34], [70, -34], [190, 46], [130, 46], [120, 8], [150, -44], [120, -44], [160, 12]) },
    on(grow(15, 3.6, 5.6, 52, "dish c"), [4, 9], "mg"),
  ),
  level(
    "Lost Trail",
    "test",
    "Fog in the pines. You cannot see the next bend until you are in it: follow the poles at the edge of the trail, and trust nothing to be where you guessed.",
    { speed: 28, baseWidth: 7.9, weather: "fog", stretch: 1.14, path: T([100, 0, 16], [110, -36, 15], [90, -36], [120, 30], [80, 30], [110, -10], [100, 44], [90, 44], [130, -38], [90, -38], [120, 20], [120, -20]) },
    [g(3, 60, "c"), g(-2, 46, "c"), g(-5, 46, "c"), g(-1, 46, "w"), g(4, 46, "c"), g(5.5, 44, "c")],
    [g(0, 46, "D"), g(-4, 46, "c"), g(-1, 44, "L"), g(4.5, 46, "c"), g(1, 44, "c")],
    [g(-4.5, 46, "c"), g(-5.5, 44, "F"), g(4.5, 50, "c"), g(1, 46, "D"), g(4, 46, "c")],
    [g(5.5, 44, "c"), g(0, 46, "w"), g(-4, 46, "c")],
  ),
  level(
    "Stampede",
    "test",
    "Deer are running down the glade ahead of you, two and three at a time, each in its own lane. Pick the lane that is empty when you get there.",
    { speed: 29.5, baseWidth: 7.7, stretch: 1.14, path: T([100, 0, 20], [140, 26, 20], [140, -28, 22], [150, -28, 20], [150, 30], [140, 0, 22], [150, -22]) },
    sway(3, 4.5, 50, "c"),
    on(stairs(4, -5, 3.2, 48, ""), [0, 2], "H"),
    [g(-4, 52, "c"), g(4, 50, "c")],
    on(stairs(4, 5, -3.2, 48, ""), [0, 2], "H"),
    [g(4, 52, "c"), g(-4, 50, "c")],
    on(sway(4, 4.6, 48, ""), [0, 2], "H"),
  ),
  level(
    "Fox's Shortcut",
    "race",
    "Rusty knows these woods. At every fork he takes the other side, and he does not wait. Catch him anyway.",
    { speed: 30, baseWidth: 7.5, twist: "rival", rivalPace: 0.92, stretch: 1.14, path: T([100, 0, 18], [140, 36, 18], [110, 36], [150, -38], [110, -38, 20], [150, 30], [130, 30], [150, -24], [140, 0]) },
    sway(3, 4.5, 48, "c"),
    [g(-6, 54, "c", { alt: 6 }), g(0, 50, "w"), g(5, 46, "c"), g(-5, 48, "c")],
    [g(6, 54, "c", { alt: -6 }), g(0, 50, "L J"), g(-5.5, 46, "c"), g(5.5, 46, "c")],
    [g(-6, 54, "c", { alt: 6 }), g(0, 50, "D")],
    flicks(4, 3, 0, "", 1, 42),
    sway(3, 5.5, 46, "c"),
  ),
  // ================================================================ 3 Blue River
  level(
    "Thin Blue Line",
    "teach",
    "The river bends, and on its ice the skis barely turn and slide for the fall line. Set your line on the snow, high, before the blue.",
    { soften: [6, 10], speed: 33, baseWidth: 7, stretch: 1.1, path: T([100, 0, 17], [150, 30, 17], [140, 30], [170, -32], [140, -32], [160, 26], [150, 0]) },
    [g(3.5, 60, "c"), g(-3.5, 50, "c")],
    [g(-2, 50, "i"), g(0, 48, "c"), g(4.5, 52, "c"), g(3, 48, "i"), g(1, 48, "c"), g(-4.5, 52, "c")],
    [g(-3, 48, "i"), g(-1, 48, "c"), g(4.5, 52, "w"), g(3, 48, "i"), g(1, 48, "c"), g(-4, 52, "c"), g(4, 52, "c")],
    [g(2, 48, "i"), g(0, 48, "c")],
  ),
  level(
    "Shuttle Gates",
    "teach",
    "Some flags ride a rail from bank to bank, and they never stop. Watch one swing, then ski to where it will be.",
    { speed: 33.5, baseWidth: 6.6, stretch: 1.1, path: T([100, 0, 18], [160, -24, 19], [150, -24], [170, 26], [150, 26], [160, -20], [150, 0]) },
    sway(3, 4, 50, "c"),
    ...[0, 1, 2, 3, 4].map((k) => [slide(k < 2 ? 0 : k % 2 ? 1.5 : -1.5, 58, k < 2 ? 5 : 6, k < 2 ? 1.0 : 1.2), g(k % 2 ? -3 : 3, 52, "c")]),
    [shuttle(0, 58, 5, 1.5), slide(0, 60, 6.5, 1.25)],
    sway(2, 4.5, 50, "c"),
  ),
  level(
    "Slingshot",
    "twist",
    "Ice is the fast line and snow is the brake, and the par is brutal. Stay on the blue through the bends and let it run.",
    { speed: 34, baseWidth: 6.6, parFactor: 1.0, timeBonusRate: 300, stretch: 1.1, path: T([100, 0, 18, 1.05], [170, 22], [170, -24], [170, 20], [170, -18], [150, 0]) },
    [g(3.5, 60, ""), g(-3.5, 50, "")],
    ...[0, 1, 2, 3].map((k) => {
      const s = k % 2 ? -1 : 1;
      return [g(s * 1, 48, "i c"), g(s * 2.5, 48, "i c"), g(s * 4, 48, "c"), g(-s * 4, 50, k === 1 ? "w" : "")];
    }),
    [g(3.5, 48, "c"), g(-3.5, 48, "c")],
  ),
  level(
    "Stepping Stones",
    "test",
    "Islands of snow in a river of ice. Do your turning on the white and your waiting on the blue, and mind the rocks the river left.",
    { soften: [10], speed: 34, baseWidth: 6.6, stretch: 1.1, path: T([100, 0, 19], [150, 28], [130, 28], [160, -30], [130, -30], [160, 24], [150, 0]) },
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => {
      const s = k % 2 ? -1 : 1;
      return [g(s * 5, k ? 50 : 60, "i"), g(s * 3, 46, k === 3 || k === 6 ? "w" : "c")];
    }),
    [g(0, 48, "c")],
  ),
  level(
    "The Luge",
    "breather",
    "An iced channel that snakes between its banks. The banks turn you and the ice keeps you going: it is all speed, and the clock is running.",
    { soften: [9], swing: 0.7, speed: 33.5, baseWidth: 7.2, parFactor: 1.02, timeBonusRate: 300, stretch: 1.1, path: T([100, 0, 14], [140, 36, 13], [110, 36], [160, -38], [110, -38], [160, 34], [110, 34], [150, -24], [140, 0]) },
    on(grow(17, 2.5, 3.6, 48, "dish c"), [2, 5, 8, 11, 14], "i"),
  ),
  level(
    "Pendulum",
    "test",
    "Shuttle gates in pairs, swinging against each other, then four back to back. Each has to be led: none of them will wait for you.",
    { speed: 34.5, baseWidth: 6.4, stretch: 1.1, path: T([100, 0, 20], [160, 22, 20], [160, -24], [150, -24], [170, 24], [160, 0]) },
    sway(2, 4.5, 50, "c"),
    ...[0, 1, 2, 3].map((k) => [k % 2 ? shuttle(0, 56, 5, 1.6) : slide(k ? -1.5 : 1.5, 56, 6.5, 1.3), g(k % 2 ? -3 : 3, 50, k === 2 ? "w" : "")]),
    [0, 1, 2, 3].map((k) => (k % 2 ? shuttle(k === 1 ? 1.5 : -1.5, 58, 4.5, 1.9) : slide(0, 58, 7, 1.35))),
    sway(3, 5, 48, "c"),
  ),
  level(
    "Curling",
    "twist",
    "One great sheet of ice across a bend of the river. Four shots, each longer than the last: line it up on the snow, then slide through every flag.",
    { swing: 1.5, speed: 34.5, baseWidth: 6.8, stretch: 1.1, path: T([100, 0, 20], [170, 20, 21], [160, 20], [180, -22], [160, -22], [160, 0]) },
    [g(3.5, 60, "c"), g(-5, 52, "i c")],
    [g(-3, 46, "i c"), g(-1, 46, "c")],
    [g(5.5, 52, "i c")],
    [g(3.5, 46, "i c"), g(1.5, 46, "i c"), g(-0.5, 46, "c")],
    [g(-6, 52, "i c")],
    [g(-3.5, 46, "i c"), g(-1, 46, "i c"), g(1.5, 46, "i c"), g(4, 46, "c")],
    [g(-2, 50, "w"), g(-6, 50, "i c")],
    [g(-3, 44, "i c"), g(0, 44, "i c"), g(3, 44, "c")],
    [g(-3, 48, "c")],
  ),
  level(
    "Fox on Ice",
    "race",
    "Rusty slides wide on the blue. Hold your lines tighter than he does, lead the shuttle gates, and take him on the snow.",
    { soften: [10, 17, 18], speed: 35, baseWidth: 6.4, twist: "rival", rivalPace: 0.97, stretch: 1.1, path: T([100, 0, 19], [150, -30, 19], [130, -30], [170, 32], [130, 32], [160, -26], [150, 0]) },
    sway(3, 4.5, 48, "c"),
    [g(5.5, 48, "i c"), g(3, 46, "i c"), g(0.5, 46, "c")],
    [g(-4.5, 48, "c"), shuttle(-1, 54, 5, 1.6), g(3, 50, "w")],
    [g(-5.5, 52, "i c"), g(-3, 46, "i c"), g(-0.5, 46, "c")],
    [g(5, 48, "c"), g(-5, 50, "c")],
    [slide(0, 56, 6.5, 1.3), shuttle(1, 58, 5, 1.8)],
    [g(5, 50, "i c"), g(2.5, 46, "i c"), g(0, 46, "c")],
    sway(2, 5, 46, "c"),
  ),
  // ================================================================ 4 Granite Gorge
  level(
    "The Narrows",
    "teach",
    "The gorge closes in, opens, and closes tighter, and it is steep. The rock does not forgive: turn before the wall, not at it.",
    { soften: [13], speed: 35, baseWidth: 6.5, stretch: 1.08, path: T([100, 0, 18, 1.05], [130, 30, 12], [110, 30, 11], [140, -34, 20, 1.12], [110, -34, 20], [140, 28, 10], [110, 28, 10], [140, -20, 18], [140, 0]) },
    sway(3, 4, 50, "c"),
    sway(4, 3, 48, "", -1),
    [g(4.5, 50, "c"), g(-1, 50, "G")],
    sway(3, 3, 48, "", -1),
    [g(-4.5, 50, "F"), g(1, 50, "G")],
    sway(4, 2.6, 46, "", -1),
    [g(0, 48, "c")],
  ),
  level(
    "Leap of Faith",
    "teach",
    "The trail ends at a drop and starts again on the far side. One kicker throws you across: hit it, or go into the gap. You cannot steer in the air.",
    { speed: 35.5, baseWidth: 6.5, stretch: 1.08, path: T([100, 0, 18, 1.05], [150, -22, 18], [200, -22], [170, 24], [200, 24], [150, 0]) },
    grow(5, 3, 4.5, 50, "c"),
    leap(0, 3),
    sway(4, 4.5, 50, "c"),
    [g(0, 50, "w")],
    leap(-2, 3),
    sway(4, 4.5, 48, "c", -1),
  ),
  level(
    "Cat Track",
    "twist",
    "The service road zigzags down the gorge, and the ploughs are grinding up it in your lane. Go round, and still make the flags.",
    { speed: 33, baseWidth: 6.5, stretch: 1.08, path: T([100, 0, 15], [130, 42, 14], [120, 42], [160, -42], [110, -42], [160, 42], [110, 42], [160, -42], [110, -42], [150, 0]) },
    sway(3, 3.5, 50, "c"),
    on(stairs(4, -4, 2.6, 48, ""), [1, 3], "P"),
    [g(3, 50, "c")],
    on(stairs(4, 4, -2.6, 48, ""), [2], "P"),
    [g(-3, 50, "K"), g(0, 54, "c")],
    on(stairs(4, -4, 2.6, 48, ""), [2], "P"),
    sway(2, 4, 48, "c"),
  ),
  level(
    "Three Bridges",
    "test",
    "Three gaps and no bridges left. Leap, thread the rocks on the far side, find your rhythm, and do it again from a bend.",
    { speed: 36.5, baseWidth: 6.3, stretch: 1.08, path: T([100, 0, 18, 1.05], [130, 20, 18], [200, 20], [140, -24], [200, -24], [140, 18], [220, 18], [140, 0]) },
    sway(3, 4.5, 48, "c"),
    leap(-2, 2.5),
    [g(4.5, 50, "c"), g(1.5, 50, "G"), g(-1, 50, "c")],
    sway(2, 5, 46, "c", -1),
    leap(2, -2.5),
    [g(-4.5, 50, "F"), g(-1.5, 50, "c"), g(1, 50, "c")],
    sway(2, 5, 46, "c"),
    leap(-2.5, 3),
    sway(3, 5, 46, "c", -1),
  ),
  level(
    "Echo Bowl",
    "breather",
    "The gorge opens into a bowl. Its floor tilts one way down the first half, then the other: aim upslope and hold it.",
    { swing: 0.7, speed: 36, baseWidth: 6.9, stretch: 1.08, path: T([100, 0, 20], [160, 30, 30], [170, 30, 32], [190, -32], [170, -32], [160, 0, 24]) },
    [g(3.5, 60, "c"), g(-4.5, 54, "c")],
    on(sway(7, 4.5, 58, "cam+", 1, { w: 1.2 }), [1, 4], "c"),
    [g(-4, 52, "c")],
    on(sway(7, 4.5, 58, "cam-", -1, { w: 1.2 }), [1, 4], "c"),
    [g(3, 50, "c")],
  ),
  level(
    "Rockfall",
    "test",
    "Between the walls, and the walls are letting go onto your line. A ring on the snow marks where each rock will land, more or less.",
    { speed: 36.5, baseWidth: 6.3, weather: "snow", stretch: 1.08, path: T([100, 0, 16, 1.02], [120, 24, 14], [150, 24, 13, 1.06], [130, -36, 16], [110, -36, 13], [140, 14, 13, 1.08], [150, 14], [140, -30, 14], [140, 0, 16]) },
    on(sway(3, 4.5, 50, "c"), [1], "sh"),
    on(sway(5, 3, 50, "", -1), [1, 3], "B"),
    [g(4.5, 52, "c"), g(-4.5, 52, "F")],
    on(sway(5, 3, 50, ""), [1, 3], "B"),
    [g(-4.5, 52, "c"), g(4.5, 52, "w")],
    on(sway(4, 2.8, 50, "", -1), [1], "B"),
    [g(0, 48, "c")],
  ),
  level(
    "Fox's Leap",
    "race",
    "Rusty jumps like he was born to it. Three gaps between you and the third star, and rock on the landings.",
    { speed: 37, baseWidth: 6.1, twist: "rival", rivalPace: 0.97, stretch: 1.08, path: T([100, 0, 18, 1.05], [140, 24, 18], [190, 24], [150, -26], [190, -26], [150, 20], [200, 20], [140, 0]) },
    sway(3, 4.5, 48, "c"),
    leap(-2.5, 2.5),
    [g(-4.5, 50, "w"), g(4.5, 50, "c")],
    leap(2.5, -2.5),
    [g(4.5, 50, "c"), g(-4.5, 50, "F")],
    leap(-2.5, 2.5),
    sway(4, 5, 46, "c", -1),
  ),
  level(
    "Gorge Slide",
    "boss",
    "The gorge is coming down behind you, and it follows the trail. Every second you lose it takes; every gap you clear swallows the front of it.",
    { speed: 37.5, baseWidth: 6.1, twist: "avalanche", avalanchePace: 0.82, stretch: 1.08, path: T([100, 0, 17, 1.08], [140, -28, 15], [190, -28], [150, 30, 12], [130, 30, 12], [150, -24, 17], [200, -24], [150, 20], [150, 0]) },
    on(sway(4, 5, 48, "c"), [1], "sh"),
    leap(-2, 0),
    [g(3.5, 50, "G"), g(0, 50, "c")],
    sway(3, 5, 46, "c", -1),
    [g(-2, 50, "B"), g(2.5, 48, "B"), g(-2.5, 48, "w"), g(2, 48, "c")],
    leap(0, 2),
    sway(3, 5.5, 46, "c", -1),
    leap(-2, 0),
    sway(4, 5.5, 46, "c"),
  ),
  // ================================================================ 5 Midnight Face
  level(
    "Aurora",
    "teach",
    "The open face, crossed in long traverses, and the snow tilts with the hill. Aim above each flag and let the tilt bring you down to it.",
    { swing: 0.7, speed: 37.5, baseWidth: 6.1, stretch: 1.06, path: T([100, 0, 24], [140, 44, 26], [150, 44], [170, -46], [150, -46], [170, 44], [150, 44], [150, 0]) },
    // On each traverse the snow falls away to the downhill side.
    [g(3.5, 60, "c"), g(-3.5, 54, "c"), g(4, 54, "cam-"), g(-4, 54, "c"), g(4, 54, "cam-")],
    [g(-4, 54, "c"), g(4.5, 54, "cam+"), g(-4.5, 54, "c"), g(4.5, 54, "cam+"), g(-4.5, 54, "w")],
    [g(4.5, 54, "cam-"), g(-4.5, 54, "c"), g(5, 54, "cam-"), g(-5, 54, "c"), g(5, 50, "c"), g(-4, 48, "c")],
  ),
  level(
    "Headlamp",
    "teach",
    "Night. You see what your lamp lights and nothing else: flags, rock, the poles at the edge of the trail. Ski slower than you dare and look where you are going.",
    { soften: [17], swing: 0.62, speed: 30, baseWidth: 6.5, night: true, stretch: 1.12, path: T([100, 0, 20], [150, 26, 20], [130, 26], [170, -28], [130, -28], [160, 22], [150, 0]) },
    on(sway(4, 4, 48, "c"), [1], "sh"),
    [g(1.5, 50, "G"), g(-1.5, 50, "c")],
    on(sway(3, 4.5, 48, "c"), [1], "w"),
    [g(-1.5, 50, "L"), g(1.5, 50, "c")],
    sway(3, 4.5, 48, "c", -1),
    [g(2, 50, "w"), g(-1, 50, "D")],
    on(sway(3, 4.5, 48, "c"), [0], "F"),
  ),
  level(
    "The Bowl",
    "breather",
    "Wall to wall across a great dish of snow. Carry your speed up each side and let it bring you back.",
    { swing: 0.7, speed: 37.5, baseWidth: 6.3, stretch: 1.06, path: T([100, 0, 24], [170, 22, 24], [180, -24], [180, 22], [180, -20], [150, 0]) },
    on(grow(18, 4.5, 6.6, 50, "dish"), [0, 3, 6, 9, 12, 15], "c"),
  ),
  level(
    "Knife Ridge",
    "test",
    "The trail runs along a ridge, and a crown of snow down its middle tips you off either side. Hold a flank, cross the spine clean, then ski it.",
    { swing: 0.55, speed: 38.5, baseWidth: 5.9, stretch: 1.06, path: T([100, 0, 20, 1.05], [150, -36, 20], [140, -36], [170, 38], [140, 38], [160, -24], [150, 0]) },
    [g(-3.5, 60, "c"), g(-6.5, 48, "crown"), g(-4, 48, "crown"), g(-6.5, 48, "crown")],
    [g(6.5, 54, "crown"), g(4, 48, "crown"), g(6.5, 48, "c")],
    [g(-4.5, 50, "c"), g(4.5, 48, "w"), g(-1, 50, "G")],
    [g(-4, 48, "crown"), g(-7, 48, "crown"), g(7, 56, "crown"), g(4, 48, "crown"), g(7, 48, "crown"), g(-4, 56, "c")],
    flicks(4, 2.5, 0, "crown", 1, 42),
    sway(3, 5, 46, "c", -1),
  ),
  level(
    "Rollercoaster",
    "twist",
    "Crest after crest down a steep pitch, with rock and kickers on the far sides. The crests throw your line: set it before the top, and learn what is behind each one.",
    { swing: 0.7, speed: 38.5, baseWidth: 5.9, stretch: 1.06, path: T([100, 0, 22, 1.1], [130, -34, 22], [150, -34, 24, 1.18], [170, 30, 22, 1.02], [140, 30, 22, 1.18], [150, -12], [160, -12, 22, 1.05]) },
    [g(3.5, 60, "c"), g(-3.5, 52, "roll"), g(4.5, 52, "c"), g(1, 48, "L J"), g(-3, 48, "c")],
    [g(-5.5, 52, "roll"), g(4.5, 54, "w"), g(-4.5, 52, "roll"), g(4.5, 52, "c"), g(1.5, 48, "F J"), g(-2, 48, "c")],
    [g(5, 52, "roll"), g(-4.5, 54, "roll"), g(4.5, 54, "c"), g(-4, 50, "roll"), g(4, 52, "L")],
    [g(-5.5, 52, "roll"), g(5, 54, "c"), g(-2, 48, "L J"), g(2, 48, "c")],
  ),
  level(
    "Fox's Lantern",
    "race",
    "Night again, and Rusty carries a lantern. It lights the snow round him, rock and all, for as long as you can stay with it.",
    { swing: 0.62, speed: 30, baseWidth: 6.3, night: true, twist: "rival", rivalPace: 0.95, stretch: 1.12, path: T([100, 0, 20], [150, -28, 20], [130, -28], [170, 30], [130, 30], [160, -22], [150, 0]) },
    sway(4, 4.5, 48, "c"),
    [g(2, 50, "G"), g(-1, 50, "c")],
    flicks(3, 3, 0, "", -1, 44),
    [g(5, 48, "c"), g(-5, 50, "w"), g(-2, 50, "c")],
    [g(-3, 48, "L J"), g(3.5, 50, "c")],
    sway(3, 5, 46, "c", -1),
    [g(2, 50, "F"), g(-1, 50, "c")],
  ),
  level(
    "The Exam",
    "test",
    "One page from every mountain, in order, down one long trail: the school, the woods, the river, the gorge, the face.",
    { speed: 39, baseWidth: 5.7, stretch: 1.06, path: T([100, 0, 22], [140, 34, 22], [120, 34, 15], [150, -38, 15], [120, -38, 19], [150, 28, 17], [200, 28, 17], [150, -40, 26], [160, -40, 26], [150, 0]) },
    [g(3.5, 60, "c"), g(-3.5, 50, "c"), g(3.5, 50, "c"), g(-3.5, 50, "S"), g(1, 48, "L J"), g(-3, 48, "S")],
    [g(3, 50, "D"), g(-3, 48, "c"), g(-5, 54, "c", { alt: 5 }), g(0, 50, "w")],
    [g(4, 50, "i c"), g(1.5, 48, "c"), shuttle(0, 56, 5, 1.7), g(3, 50, "c")],
    leap(0, -2),
    [g(2, 50, "G"), g(-1, 50, "P"), g(-3, 50, "B")],
    [g(4.5, 52, "cam-"), g(-4.5, 52, "crown"), g(4.5, 52, "roll"), g(-5, 50, "c"), g(4, 48, "c")],
  ),
  level(
    "The Face",
    "boss",
    "The whole face has let go. Long traverses, leaps, rock on the line and a shuttle gate, with the slide coming down the trail behind you.",
    { speed: 39.5, baseWidth: 5.7, twist: "avalanche", avalanchePace: 0.84, weather: "snow", stretch: 1.06, path: T([100, 0, 22, 1.08], [140, 40, 24], [130, 40], [160, -42, 24], [200, -42], [160, 38], [130, 38, 18], [150, -30, 18], [200, -30], [150, 0, 22]) },
    on(sway(4, 5, 48, "c"), [1], "sh"),
    [g(-4.5, 50, "cam-"), g(4.5, 52, "c"), g(1.5, 50, "G")],
    leap(0, 2),
    sway(3, 5.5, 46, "w", -1),
    [slide(0, 56, 6.5, 1.35), g(-3, 50, "F"), g(0, 52, "c")],
    leap(0, -2),
    [g(3, 50, "B"), g(-3, 48, "B"), g(3, 48, "c")],
    leap(0, 0),
    grow(4, 5, 6.5, 46, "c"),
  ),
];
