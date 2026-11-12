import { seededRandom } from "./random";
import {
  FEATURE_LEAD,
  FIELD_ROCKS,
  FIELD_SPACING,
  FORK_ISLAND,
  FORK_ROCK_RADIUS,
  GATE_MARGIN,
  GRIP,
  GUARD_TREE_RADIUS,
  PINCH_OFFSET,
  ROCK_GATE_HALF,
  WALL_RADIUS,
  WEAVE_OFFSET,
  WEAVE_STEP,
  WIDE_ROCK_RADIUS,
  gateAt,
  hazardAt,
  type Course,
  type Gate,
  type Hazard,
  type Coin,
  type MoverSpec,
  type Slope,
  type Zone,
  SLOPE_MARGIN,
} from "./levels";
import { CHASM_LENGTH, COIN_CLEAR, FULL_WIDTH, JUMP_GRAVITY, LEAP_HALF, RAMP_HALF, RAMP_LENGTH, RAMP_LIP, iceSheet, jumpFor } from "./extras";
import { createTrail, extendTrail, trailAt, trailHalf } from "./trail";

/** The pace an endless run starts at, the pace it has all but reached after ten kilometres or so, and what every kilometre adds on top of that for ever. */
export const ENDLESS_START_SPEED = 22;
export const ENDLESS_SETTLE_SPEED = 34;
export const ENDLESS_SPEED_CREEP = 0.35;
/** The first of the run, with nothing on it but flags. */
export const ENDLESS_WARMUP = 300;
/** How often a stretch with nothing standing on it carries a trail of coins. */
export const COIN_TRAILS = 0.75;

/** What a section of the run is about. Each is met once, the gentler ones first, before any comes round again. */
export const ENDLESS_EASY = ["rocks", "learners", "kickers", "deer", "ice"] as const;
export const ENDLESS_HARD = ["rails", "leap", "herd", "snowcat", "fields", "ploughs", "boulders", "forks", "shaped"] as const;
/** What a section may be skied in besides clear daylight, and the things that are fair to meet in the dark: whatever stands still, carries a light, or is the snow itself. */
export type EndlessLight = "night" | "fog" | "blizzard";
export const ENDLESS_BY_NIGHT: readonly string[] = ["rocks", "learners", "kickers", "deer", "ice", "rails", "snowcat", "ploughs", "forks", "shaped"];
/** A night section is skied this much slower than the snow would otherwise run: the lamp reaches only so far. */
export const ENDLESS_NIGHT_PACE = 0.9;
export type EndlessTheme = "plain" | (typeof ENDLESS_EASY)[number] | (typeof ENDLESS_HARD)[number];
export interface EndlessSection {
  from: number;
  to: number;
  theme: EndlessTheme;
  /** Far enough down, a section is about two things at once. */
  also?: EndlessTheme;
  /** By headlamp, in fog or in a blizzard; daylight if not given. */
  light?: EndlessLight;
}

export interface EndlessCourse extends Course {
  endless: true;
  seed: number;
  /** The sections laid so far, in order down the trail. */
  sections: EndlessSection[];
  /** Generates trail, gates and everything else until the course reaches this distance. */
  extend(untilS: number, here?: number): void;
  speedAt(s: number): number;
}
/** From one value toward another that it never quite reaches: most of the way after `k` kilometres. */
const toward = (from: number, to: number, km: number, k: number) => to + (from - to) * Math.exp(-km / k);
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const round = (n: number) => Math.round(n * 10) / 10;

/** How fast the snow is at a distance down an endless run: it never stops getting faster. */
export function endlessSpeed(s: number) {
  const km = Math.max(0, s) / 1000;
  return toward(ENDLESS_START_SPEED, ENDLESS_SETTLE_SPEED, km, 3.5) + ENDLESS_SPEED_CREEP * km;
}
/** How the course is set at a distance down the run. Nothing here levels off: each either creeps for ever or closes on a limit the skis can still meet. */
export function endlessSettings(s: number) {
  const km = Math.max(0, s) / 1000,
    speed = endlessSpeed(s),
    // Seconds from one gate to the next.
    // It closes on 1.6 s and then goes on shortening, a hundredth of a second a kilometre, down to the least the skis can answer.
    beat = Math.max(1.25, toward(3.1, 1.6, km, 2.5) - 0.012 * km);
  return {
    speed,
    beat,
    gap: Math.max(40, beat * speed),
    width: toward(9.5, 5.6, km, 2.5),
    amplitude: toward(6, 12.5, km, 2),
    // The widest swing the skis can make in the time between two gates.
    swing: (0.9 * 0.85 * GRIP * beat * beat) / 4,
    flick: km < 0.9 ? 0 : toward(0.06, 0.2, km, 3),
    // How often a stretch that is not given to its section's own thing has rock on it anyway, and a tree by the line.
    clutter: s < ENDLESS_WARMUP ? 0 : toward(0.05, 0.92, km, 4),
    trees: s < ENDLESS_WARMUP ? 0 : Math.min(0.95, toward(0.05, 0.6, km, 2.5) + 0.012 * km),
    // Past six kilometres a stretch with rock on it more and more often has a second, out on the far side of the line.
    second: km < 6 ? 0 : toward(0, 0.85, km - 6, 8),
    // How many of a section's stretches carry what the section is about: ice and rails nearly all of them from the start,
    // things that block the line fewer at first, so there is a stretch to recover on between two of them.
    themed: toward(0.6, 1, km, 4),
    blocked: toward(0.4, 0.92, km, 5),
    // How often a section is about two things.
    mixed: toward(0, 0.9, km, 5),
    // And, late on, how often a stretch carries its section's thing and a rock as well.
    piled: km < 4 ? 0 : toward(0, 0.6, km - 4, 6),
  };
}

/** Straight trail a leap needs under it, and a kicker: the run-in, the flight and the landing. */
const LEAP_STRETCH = 104;
const LEAP_STRAIGHT = 40 + LEAP_STRETCH + 8;
const KICKER_STRAIGHT = 40 + 70 + 8;

/**
 * An endless course: a trail that wanders down the mountain for ever, laid
 * in sections. Each section is about one of the things the campaign is made
 * of (rock, learners, kickers, deer, ice, moving gates, leaps, the herd, a
 * snowcat, rock fields, ploughs, falling boulders, forks); the first run of
 * sections brings each in once, the gentler ones first, and after that they
 * come in any order and two at a time. All the while the snow gets faster,
 * the gates closer, narrower and further apart across the trail, and more
 * stands in the way. It is generated on demand from its seed.
 */
export function createEndlessCourse(seed: number): EndlessCourse {
  const random = seededRandom(seed >>> 0, 0x9e3779b9);
  const trail = createTrail();
  const gates: Gate[] = [];
  const hazards: Hazard[] = [];
  const coins: Coin[] = [];
  const movers: MoverSpec[] = [];
  const zones: Zone[] = [];
  const sections: EndlessSection[] = [];
  /** Straight trail kept for a leap or a kicker. */
  const spots: { from: number; to: number; kind: "leap" | "kicker"; armed?: boolean }[] = [];
  let spotCursor = 0;
  let lastS = 0;
  const shuffled = <T>(list: readonly T[]) => {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  // Every run meets everything once before anything comes back: the gentler things first, in an order of its own.
  const intro: EndlessTheme[] = ["plain", ...shuffled(ENDLESS_EASY), ...shuffled(ENDLESS_HARD)];
  const all: EndlessTheme[] = [...ENDLESS_EASY, ...ENDLESS_HARD];
  // The first night falls on the first of the harder sections, from the third of them on, that is fair in the dark.
  const firstHard = 1 + ENDLESS_EASY.length;
  let nightAt = intro.findIndex((theme, i) => i >= firstHard + 2 && ENDLESS_BY_NIGHT.includes(theme));
  if (nightAt < 0) nightAt = intro.findIndex((theme, i) => i >= firstHard && ENDLESS_BY_NIGHT.includes(theme));

  // ---------------------------------------------------------------- the trail, a section at a time
  const bend = (len: number) => {
    const km = trail.endS / 1000,
      t = 1 - Math.exp(-km / 2.5);
    const from = (trail.endDir * 180) / Math.PI;
    const turn = (22 + 26 * t) * (0.5 + 0.5 * random());
    const side = trail.endDir > 0.05 ? -1 : trail.endDir < -0.05 ? 1 : random() < 0.5 ? -1 : 1;
    const straighten = random() < 0.2;
    // A short leg does not come round as far as a long one.
    const most = len * 0.75;
    extendTrail(trail, {
      len,
      to: clamp(straighten ? 0 : side * turn, from - most, from + most),
      half: Math.round(22 - 4 * t + (random() < 0.25 ? 10 : 0) - (random() < 0.2 ? 5 : 0)),
      pitch: 0.92 + random() * 0.2,
    });
  };
  const straight = (len: number, kind: "leap" | "kicker") => {
    extendTrail(trail, { len });
    spots.push({ from: trail.endS - len, to: trail.endS, kind });
  };
  const laySection = () => {
    const from = trail.endS,
      km = from / 1000,
      n = sections.length,
      last = sections[n - 1];
    const fresh = () => {
      for (;;) {
        const theme = all[Math.floor(random() * all.length)];
        if (theme !== last?.theme && theme !== last?.also) return theme;
      }
    };
    const meeting = n < intro.length;
    const theme = meeting ? intro[n] : fresh();
    let also: EndlessTheme | undefined;
    if (n >= intro.length && random() < endlessSettings(from).mixed) {
      // The second thing is one that needs no trail of its own.
      do also = fresh();
      while (also === theme || also === "leap" || also === "kickers");
    }
    const t = 1 - Math.exp(-km / 2.5);
    const legLength = () => Math.round(150 - 40 * t + random() * 80);
    if (theme === "leap") {
      bend(Math.round((meeting ? 50 : 100) + random() * 40));
      straight(LEAP_STRAIGHT, "leap");
      bend(Math.round((meeting ? 50 : 110) + random() * 50));
      if (km > 5 && random() < 0.6) {
        straight(LEAP_STRAIGHT, "leap");
        bend(Math.round(90 + random() * 40));
      }
    } else if (theme === "kickers") {
      const count = meeting ? 2 : 2 + (random() < 0.3 + 0.5 * t ? 1 : 0);
      for (let k = 0; k < count; k++) {
        bend(Math.round(70 + random() * 40));
        straight(KICKER_STRAIGHT, "kicker");
      }
      if (!meeting) bend(Math.round(70 + random() * 40));
    } else {
      const length = n === 0 ? ENDLESS_WARMUP : meeting ? 230 + random() * 50 : 300 + random() * 140 + Math.min(160, km * 16);
      // The last leg of a section is cut to what is left of it.
      while (trail.endS - from < length - 50) bend(Math.min(legLength(), Math.max(70, Math.round(length - (trail.endS - from)))));
    }
    // Fog is met on the last of the gentler sections and night on one of the harder ones that is fair in the dark;
    // after that either may come down on any section, more often the further down, and past eight kilometres a blizzard too.
    const dark = ENDLESS_BY_NIGHT.includes(theme) && (!also || ENDLESS_BY_NIGHT.includes(also));
    let light: EndlessLight | undefined;
    if (meeting) light = n === ENDLESS_EASY.length ? "fog" : n === nightAt ? "night" : undefined;
    else if (!last?.light && random() < toward(0.15, 0.45, km, 8)) {
      const pick = random();
      light = pick < 0.45 && dark ? "night" : km > 8 && pick > 0.8 ? "blizzard" : "fog";
    }
    sections.push({ from, to: trail.endS, theme, ...(also ? { also } : {}), ...(light ? { light } : {}) });
  };
  const lay = (untilS: number) => {
    while (trail.endS < untilS) laySection();
  };
  let sectionCursor = 0;
  const sectionAt = (s: number) => {
    while (sectionCursor + 1 < sections.length && sections[sectionCursor].to <= s) sectionCursor++;
    return sections[sectionCursor];
  };

  // ---------------------------------------------------------------- what stands on it
  const rock = (u: number, s: number, radius: number) => hazards.push(hazardAt(trail, Math.round(s), u, radius));
  const tree = (u: number, s: number) => hazards.push(hazardAt(trail, Math.round(s), u, GUARD_TREE_RADIUS, "tree"));
  const zone = (kind: Zone["kind"], s: number, u: number, halfWidth: number, length: number) => {
    const p = trailAt(trail, s, u);
    const z: Zone = { kind, s, u, halfWidth, length, x: p.x, z: p.z, rot: p.dir };
    zones.push(z);
    return z;
  };
  const coin = (u: number, s: number, y = 0) => coins.push({ ...trailAt(trail, s, u), s: round(s), u: round(u), y });
  /** Coins along the flight of a jump from a lip, taken at the pace of the snow there. */
  const flightCoins = (lip: number, lineAt: (s: number) => number, chasm: boolean) => {
    const speed = endlessSpeed(lip),
      { time, vy } = jumpFor(speed, chasm),
      count = chasm ? 6 : 5;
    for (let k = 1; k <= count; k++) {
      const t = (time * k) / (count + 1),
        s = lip + speed * t;
      coin(lineAt(s), s, round(RAMP_LIP + vy * t - (JUMP_GRAVITY / 2) * t * t));
    }
  };
  // When each kind of thing that needs room to itself was last put down.
  const lastAt: Partial<Record<EndlessTheme, number>> = {};
  const slopes: Slope[] = [];
  let shapes = 0,
    here = 0;
  const sectionOf = (s: number) => {
    for (let i = sections.length - 1; i >= 0; i--) if (sections[i].from <= s) return sections[i];
    return sections[0];
  };
  let stretchInSection = 0,
    shownInSection = 0,
    sectionOfLast: EndlessSection | undefined,
    railed = 0;

  const addGate = () => {
    const first = gates.length === 0;
    const S = endlessSettings(lastS);
    const prev = first ? null : gates[gates.length - 1];
    lay(lastS + 1000);
    // A straight kept for a leap or a kicker is coming up: the gate before it stands at its head, and the next stretch is the jump.
    while (spotCursor < spots.length && spots[spotCursor].to < lastS + 60) spotCursor++;
    const spot = spots[spotCursor];
    const jump = prev && spot?.armed ? spot.kind : undefined;
    const arming = prev && spot && !spot.armed && spot.from <= lastS + S.gap + 20;

    // A section that has not yet shown what it is about gets a full open stretch to show it on.
    const coming = sections.find((x) => x.to > lastS + S.gap) ?? sections[sections.length - 1];
    const waiting = coming.theme !== "plain" && (coming !== sectionOfLast || shownInSection === 0);
    let gap = first ? 70 : Math.max(waiting ? 48 : 0, S.gap * (0.9 + random() * 0.2));
    let u: number,
      quick = false,
      lineRock = false;
    if (!prev) u = (random() < 0.5 ? -1 : 1) * (2.5 + random() * 2);
    else if (jump) {
      // Across the trail a little, so the kicker has to be steered for; never so far that it cannot be.
      gap = jump === "leap" ? LEAP_STRETCH : clamp(S.speed * 2.1, 62, 70);
      const away = -(Math.sign(prev.u) || 1);
      u = prev.u + away * (3 + random() * 4);
    } else if (!arming && !waiting && random() < S.flick) {
      // A quick flick: a short way on, at least a gate width across.
      gap = Math.max(38, S.speed * 1.2);
      quick = true;
      const away = -(Math.sign(prev.u) || 1);
      u = prev.u + away * Math.max(S.width + 0.6, 4 + random() * 3);
    } else if (!arming && !waiting && S.clutter > 0 && random() < 0.14) {
      // A same-side pair with a rock on the line between the two.
      lineRock = true;
      const toward = Math.abs(prev.u) > 6 ? -Math.sign(prev.u) : Math.sign(prev.u) || 1;
      u = prev.u + toward * (2.5 + random() * 1.5);
    } else {
      const away = -(Math.sign(prev.u) || 1);
      u = away * S.amplitude * (0.5 + 0.5 * random());
      if (Math.abs(u - prev.u) < S.width + 0.6) u = prev.u + away * (S.width + 0.6);
    }
    let s = Math.round(lastS + gap);
    if (arming) {
      s = Math.round(Math.max(lastS + 38, spot.from + 4));
      spot.armed = true;
    }
    if (jump) spotCursor++;
    // No further across than the skis can get in the time there is.
    const most = prev && !quick ? Math.max(S.width + 0.6, S.swing * Math.min(1, ((s - prev.s) / S.gap) ** 2)) : Infinity;
    if (prev) u = prev.u + clamp(u - prev.u, -most, most);
    const section = sectionAt(s);
    if (section !== sectionOfLast) {
      sectionOfLast = section;
      stretchInSection = 0;
      shownInSection = 0;
    }
    const is = (theme: EndlessTheme) => section.theme === theme || section.also === theme;
    let width = round(S.width);
    const half = trailHalf(trail, s);
    const room = Math.min(13, half - GATE_MARGIN);
    u = round(clamp(u, -room, room));
    // A moving gate rides a rail about the middle of the trail and never stops.
    let drift: Gate["drift"];
    if (prev && !jump && !arming && !quick && is("rails") && !prev.drift && (stretchInSection === 0 || random() < S.themed)) {
      const saw = ++railed % 2 === 0;
      const railU = round(prev.u + clamp(u * 0.3 - prev.u, -most, most)),
        railWidth = round(S.width * 1.12),
        amp = Math.min(saw ? 7 : 6, half - GATE_MARGIN - Math.abs(railU) - railWidth / 2);
      if (amp >= railWidth / 2 + 0.5) {
        u = railU;
        width = railWidth;
        const km = s / 1000;
        drift = { amp: round(amp), rate: round(toward(1.15, 1.6, km, 6)), phase: round(random() * Math.PI * 2), ...(saw ? { saw } : {}) };
      }
    }
    const gate = gateAt(trail, s, u, width, gates.length);
    if (drift) gate.drift = drift;

    // ---------------------------------------------------------------- the stretch that leads into this gate
    if (prev) {
      const length = s - prev.s,
        side = Math.sign(prev.u) || 1,
        dir = (Math.sign(u - prev.u) || 1) as 1 | -1,
        lineAt = (f: number) => prev.u + (u - prev.u) * f,
        lineU = (at: number) => lineAt((at - prev.s) / length);
      const km = s / 1000;
      const since = (theme: EndlessTheme) => s - (lastAt[theme] ?? -1e9);
      const stood = hazards.length;
      const open = !quick && !lineRock && !jump && length >= 46 && prev.s >= ENDLESS_WARMUP;
      let taken = false,
        // Shaped snow carries the skis sideways: nothing stands on it.
        bare = false,
        // Rock may share a stretch with ice, a moving gate or a fork, never with something that moves or a jump.
        rockToo = true;
      if (jump === "leap") {
        const lip = Math.round(prev.s + length * 0.42);
        zone("ramp", lip - RAMP_LENGTH, round(lineU(lip)), LEAP_HALF, RAMP_LENGTH).leap = true;
        zone("chasm", lip, 0, FULL_WIDTH, CHASM_LENGTH);
        flightCoins(lip, lineU, true);
        taken = true;
        rockToo = false;
      } else if (jump === "kicker") {
        const lip = Math.round(prev.s + Math.max(16, length * 0.32));
        zone("ramp", lip - RAMP_LENGTH, round(lineU(lip - RAMP_LENGTH / 2)), RAMP_HALF, RAMP_LENGTH);
        // More often than not there is a rock to fly: take the kicker, or ski round.
        if (random() < 0.7) rock(lineU(lip + 8), lip + 8, FORK_ROCK_RADIUS);
        flightCoins(lip, lineU, false);
        taken = true;
        rockToo = false;
      } else if (open) {
        // What the section is about goes on its first stretch, and on most of the rest; a second thing takes what the first leaves.
        const wants = (theme: EndlessTheme) => {
          if (!is(theme)) return false;
          const share = theme === "ice" || theme === "forks" || theme === "shaped" ? S.themed : S.blocked;
          // Its first stretch always, and the one after next: a short section still shows its thing twice.
          return section.theme === theme ? shownInSection === 0 || stretchInSection === 2 || random() < share : random() < share * 0.6;
        };
        const mover = (kind: MoverSpec["kind"], at: number, mu: number, toward: 1 | -1 = dir) =>
          movers.push({ kind, s: Math.round(prev.s + length * at), u: round(mu), dir: toward });
        if (wants("ice")) {
          zones.push(iceSheet(trail, prev.s, length, lineU, gates.length + (seed >>> 0)));
          taken = true;
        }
        const due = (theme: EndlessTheme, apart: number) => since(theme) > apart || (section.theme === theme && shownInSection === 0);
        if (!taken && wants("learners") && due("learners", 90)) {
          mover("skier", 0.5, 0, random() < 0.5 ? -1 : 1);
          // Late on they come two at a time, going opposite ways.
          if (km > 5 && random() < 0.5) mover("skier", 0.72, 0, random() < 0.5 ? -1 : 1);
          lastAt.learners = s;
          taken = true;
          rockToo = false;
        }
        if (!taken && wants("deer")) {
          mover("deer", 0.6, lineAt(0.6));
          taken = true;
          rockToo = false;
        }
        if (!taken && wants("herd") && due("herd", 260)) {
          // Three abreast, each in a lane of its own; late on, five.
          const lanes = km > 6 ? [-4.5, 4.5, 0, -9, 9] : [-4.5, 4.5, 0];
          for (const lane of lanes) if (Math.abs(lane) < half - 3) mover("herd", 0.5, lane);
          lastAt.herd = s;
          taken = true;
          rockToo = false;
        }
        if (!taken && wants("snowcat") && due("snowcat", 170)) {
          mover("snowcat", 0.5, 0);
          lastAt.snowcat = s;
          taken = true;
          rockToo = false;
        }
        if (!taken && wants("ploughs") && due("ploughs", 110)) {
          mover("plough", 0.45, lineAt(0.45));
          lastAt.ploughs = s;
          taken = true;
          rockToo = false;
        }
        if (!taken && wants("boulders")) {
          mover("boulder", 0.45, lineAt(0.45));
          // Late on a second comes down beside the way round the first.
          if (km > 5 && random() < 0.5) mover("boulder", 0.7, lineAt(0.7) + (random() < 0.5 ? -4 : 4));
          taken = true;
          rockToo = false;
        }
        if (!taken && wants("shaped")) {
          // Shaped snow: the piste tilts, dishes, crowns, rolls or steps between the two gates, each in turn.
          const kind = (["camber", "dish", "crown", "roller", "step"] as const)[shapes++ % 5];
          slopes.push({ from: prev.s + SLOPE_MARGIN, to: s - SLOPE_MARGIN, dir: kind === "camber" || kind === "step" ? dir : 1, kind, stretch: gates.length - 1 });
          taken = true;
          rockToo = false;
          bare = true;
        }
        if (!taken && wants("fields")) {
          // Rocks strewn on the direct line and either side of it, never two so close that nothing fits between.
          // Four at first, the campaign's six by the sixth kilometre, and more after that.
          const placed: { s: number; u: number }[] = [],
            count = Math.min(FIELD_ROCKS + 3, Math.round(4 + km / 3));
          for (let tries = 0; tries < 60 && placed.length < count; tries++) {
            const f = 0.4 + random() * 0.36,
              fs = prev.s + length * f,
              fu = lineAt(f) + (placed.length < 1 + (km > 3 ? 1 : 0) ? (random() - 0.5) * 1.6 : (random() - 0.5) * 17);
            if (s - fs < 12 || placed.some((p) => Math.hypot(p.s - fs, p.u - fu) < FIELD_SPACING)) continue;
            placed.push({ s: fs, u: fu });
            rock(fu, fs, 0.9 + random() * 0.35);
          }
          taken = true;
          rockToo = false;
        }
        if (!taken && !gate.drift && wants("forks") && Math.abs(u) >= 5 && Math.abs(u) + width / 2 <= half - 2) {
          // A second opening on the far side of the trail, an island of trees between the two, gold in the far one.
          gate.alt = round(-u);
          for (let back = 9; back <= Math.min(FORK_ISLAND, length - 12); back += 6) hazards.push(hazardAt(trail, Math.round(s - back), 0, WALL_RADIUS, "tree", true));
          for (let back = 16; back >= -6; back -= 3.6) coin(-u, s - back);
          taken = true;
          rockToo = false;
        }
        if (!taken && wants("rocks")) {
          // The section about rock: a pair to thread, three to weave through, or one on the line itself.
          const pick = stretchInSection === 0 ? 1 : random();
          if (length >= 2 * WEAVE_STEP + FEATURE_LEAD + 12 && pick < 0.22)
            for (const [k, ds] of [2 * WEAVE_STEP, WEAVE_STEP, 0].entries()) rock(u + (k % 2 ? -1 : 1) * WEAVE_OFFSET * side, s - FEATURE_LEAD - ds, WIDE_ROCK_RADIUS);
          else if (pick < 0.47) for (const k of [-1, 1]) rock(u + k * ROCK_GATE_HALF, s - FEATURE_LEAD, WIDE_ROCK_RADIUS);
          else if (pick < 0.75) rock(lineAt(0.5) + dir * PINCH_OFFSET, prev.s + length * 0.5, WIDE_ROCK_RADIUS);
          else rock(lineAt(0.5), prev.s + length / 2, FORK_ROCK_RADIUS);
          taken = true;
          rockToo = false;
        }
      }
      if (taken && !jump) shownInSection++;
      // Rock anyway: on the line of a same-side pair, pinching the line from the inside of the turn, or a pair before the flags.
      const clutter = taken ? (rockToo ? Math.max(S.piled, S.clutter * 0.35) : 0) : S.clutter;
      if (lineRock) rock(lineAt(0.5), prev.s + length / 2, FORK_ROCK_RADIUS);
      else if (!quick && !jump && length >= 36 && random() < clutter) {
        const iced = taken && zones[zones.length - 1]?.kind === "ice";
        if (!iced && !gate.drift && gate.alt === undefined && length >= FEATURE_LEAD + 12 && random() < toward(0, 0.35, km, 4))
          for (const k of [-1, 1]) rock(u + k * ROCK_GATE_HALF, s - FEATURE_LEAD, WIDE_ROCK_RADIUS);
        // A rock close beside the line, on the side a corner-cutter would take.
        else if (gate.alt === undefined) rock(lineAt(0.5) + dir * PINCH_OFFSET, prev.s + length * 0.5, WIDE_ROCK_RADIUS);
        if (gate.alt === undefined && length >= 50 && random() < S.second) rock(lineAt(0.72) - dir * 4.6, prev.s + length * 0.72, WIDE_ROCK_RADIUS);
      }
      // Trees stand near the line on the outside of the turn, never within 12 m of a flag.
      if (!quick && !jump && !bare && gate.alt === undefined && length >= 40 && random() < S.trees) {
        const f = 0.36 + random() * 0.26;
        tree(lineAt(f) - side * (4.2 + random() * 1.4), Math.max(prev.s + 12.5, prev.s + length * f));
      }
      // A trail of coins down the line of a stretch with nothing else on it: no rock, no tree, nothing that moves.
      const clear = (cu: number, cs: number) => !hazards.some((h) => Math.hypot(h.u - cu, h.s - cs) < h.radius + COIN_CLEAR);
      if (!quick && !lineRock && !taken && random() < COIN_TRAILS && hazards.length === stood)
        for (let k = 0; k < 5; k++) {
          const f = 0.3 + k * 0.1,
            cu = round(lineAt(f)),
            cs = Math.round(prev.s + length * f);
          if (clear(cu, cs)) coin(cu, cs);
        }
      stretchInSection++;
    }
    gates.push(gate);
    lastS = s;
    hazards.sort((a, b) => a.s - b.s);
    coins.sort((a, b) => a.s - b.s);
  };
  const course: EndlessCourse = {
    endless: true,
    seed: seed >>> 0,
    sections,
    level: -1,
    name: "Endless run",
    hint: "Slow and easy at first, then everything the mountain has, harder every metre. Three misses or tumbles and the run is over.",
    trail,
    gates,
    finishS: Infinity,
    stretches: [],
    tokens: [],
    hazards,
    slopes,
    speed: ENDLESS_START_SPEED,
    turnAngle: 0.88,
    pickupRadius: 2,
    parTime: 0,
    timeBonusRate: 0,
    maxGateScore: 0,
    starScores: [0, 0, 0],
    starBullseyes: 0,
    coins,
    zones,
    powers: [],
    movers,
    twist: "",
    role: "endless",
    cratePowers: ["shield", "magnet", "double"],
    rivalPace: 0,
    avalanchePace: 0,
    extend(untilS: number, at?: number) {
      while (lastS < untilS) addGate();
      if (at !== undefined) {
        here = at;
        // Shaped snow long behind is forgotten, so the list never grows.
        while (slopes.length && slopes[0].to < here - 400) slopes.shift();
      }
    },
    // By night the snow is skied a little slower, easing down into the dark and up out of it over sixty metres.
    speedAt(s: number) {
      const section = sectionOf(s);
      if (section?.light !== "night") return endlessSpeed(s);
      const edge = clamp(Math.min(s - section.from, section.to - s) / 60, 0, 1);
      return endlessSpeed(s) * (1 - (1 - ENDLESS_NIGHT_PACE) * edge);
    },
    // The light and the weather are those of the section the skier is in.
    get night() {
      return sectionOf(here)?.light === "night";
    },
    get weather() {
      const light = sectionOf(here)?.light;
      return light === "fog" || light === "blizzard" ? light : "clear";
    },
  };
  course.extend(600);
  return course;
}
