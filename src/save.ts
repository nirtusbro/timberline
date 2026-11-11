import { LEVEL_COUNT, WORLDS, WORLD_COUNT, WORLD_SIZE, worldOf } from "./levels";
import { DEFAULT_OUTFIT, DEFAULT_SKIS, OUTFITS, SKIS, gearItem } from "./gear";
import { readValue, writeValue } from "./storage";

const KEY = "save-v1";
/** Coins for each star the first time it is earned on a level: more on each mountain. */
export const starCoins = (level: number) => 10 + 5 * worldOf(level);
/** An endless or daily run pays a coin for every this many metres. */
export const METRES_PER_COIN = 100;
const validLevel = (n: unknown): n is number =>
  Number.isInteger(n) && (n as number) >= 0 && (n as number) < LEVEL_COUNT;
const count = (n: unknown, max = Number.MAX_SAFE_INTEGER) =>
  Number.isSafeInteger(n) && (n as number) > 0 ? Math.min(max, n as number) : 0;
/** The date as the daily run knows it, in the player's own time zone. */
export function dayKey(now = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
/** Everyone skiing on the same day gets the same daily course. */
export function dailySeed(day = dayKey()) {
  let hash = 2166136261;
  for (let i = 0; i < day.length; i++) hash = Math.imul(hash ^ day.charCodeAt(i), 16777619);
  return hash >>> 0;
}
const blank = () => ({
  stars: Array<number>(LEVEL_COUNT).fill(0),
  best: Array<number>(LEVEL_COUNT).fill(0),
  coins: 0,
  owned: new Set<string>([DEFAULT_OUTFIT, DEFAULT_SKIS]),
  outfit: DEFAULT_OUTFIT,
  skis: DEFAULT_SKIS,
  endlessBest: 0,
  endlessDistance: 0,
  daily: { day: "", best: 0, distance: 0, runs: 0 },
  lastLevel: 0,
});

/**
 * Everything the game remembers: stars and best score per level, coins, the
 * gear owned and worn, and the endless and daily records.
 */
export class SaveGame {
  stars!: number[];
  best!: number[];
  coins!: number;
  owned!: Set<string>;
  outfit!: string;
  skis!: string;
  endlessBest!: number;
  endlessDistance!: number;
  daily!: { day: string; best: number; distance: number; runs: number };
  /** The level last played, so the home screen can offer it again. */
  lastLevel!: number;
  constructor() {
    Object.assign(this, blank());
    try {
      const saved = JSON.parse(readValue(KEY, "null"));
      if (saved?.version !== 1) return;
      for (const [key, max] of [["stars", 3], ["best", undefined]] as const)
        if (Array.isArray(saved[key]))
          saved[key].forEach((value: unknown, level: number) => {
            if (validLevel(level)) this[key][level] = count(value, max);
          });
      this.coins = count(saved.coins);
      if (Array.isArray(saved.owned))
        for (const id of saved.owned) if (typeof id === "string" && gearItem(id)) this.owned.add(id);
      if (OUTFITS.some((o) => o.id === saved.outfit) && this.owned.has(saved.outfit)) this.outfit = saved.outfit;
      if (SKIS.some((s) => s.id === saved.skis) && this.owned.has(saved.skis)) this.skis = saved.skis;
      this.endlessBest = count(saved.endlessBest);
      this.endlessDistance = count(saved.endlessDistance);
      if (typeof saved.daily?.day === "string")
        this.daily = {
          day: saved.daily.day,
          best: count(saved.daily.best),
          distance: count(saved.daily.distance),
          runs: count(saved.daily.runs),
        };
      if (validLevel(saved.lastLevel)) this.lastLevel = saved.lastLevel;
    } catch {
      /* A damaged save never prevents skiing. */
    }
  }
  get totalStars() {
    return this.stars.reduce((sum, n) => sum + n, 0);
  }
  worldStars(world: number) {
    return this.stars.slice(world * WORLD_SIZE, (world + 1) * WORLD_SIZE).reduce((sum, n) => sum + n, 0);
  }
  /** A mountain opens once enough stars have been earned anywhere. */
  worldUnlocked(world: number) {
    return world >= 0 && world < WORLD_COUNT && this.totalStars >= WORLDS[world].starsToUnlock;
  }
  /** A level opens with its mountain if it is the first, or when the level before it has a star. */
  isUnlocked(level: number) {
    if (!validLevel(level) || !this.worldUnlocked(worldOf(level))) return false;
    return level % WORLD_SIZE === 0 || this.stars[level - 1] > 0;
  }
  /** The level to offer next: the first open one without a star, or the last one played. */
  nextLevel() {
    for (let level = 0; level < LEVEL_COUNT; level++)
      if (this.isUnlocked(level) && this.stars[level] === 0) return level;
    return this.isUnlocked(this.lastLevel) ? this.lastLevel : 0;
  }
  /**
   * Records a finished level run: the best score, any new stars and the coins
   * the run earned, plus a bonus for each star earned for the first time.
   */
  complete(level: number, score: number, stars: number, runCoins: number) {
    if (!validLevel(level)) return { newBest: false, newStars: 0, starCoins: 0, coins: 0, unlockedWorld: -1 };
    const worldsBefore = WORLDS.map((_, world) => this.worldUnlocked(world));
    const newBest = score > this.best[level];
    if (newBest) this.best[level] = score;
    const newStars = Math.max(0, Math.min(3, stars) - this.stars[level]);
    this.stars[level] += newStars;
    const bonus = newStars * starCoins(level);
    const coins = Math.max(0, Math.floor(runCoins)) + bonus;
    this.coins += coins;
    this.lastLevel = level;
    this.save();
    const unlockedWorld = WORLDS.findIndex((_, world) => !worldsBefore[world] && this.worldUnlocked(world));
    return { newBest, newStars, starCoins: bonus, coins, unlockedWorld };
  }
  /** Records an endless or daily run and pays its coins, a few of them for the distance. */
  completeEndless(score: number, distance: number, runCoins: number, daily: boolean, day = dayKey()) {
    const metres = Math.max(0, Math.floor(distance));
    const distanceCoins = Math.floor(metres / METRES_PER_COIN);
    const coins = Math.max(0, Math.floor(runCoins)) + distanceCoins;
    this.coins += coins;
    let newBest: boolean;
    if (daily) {
      if (this.daily.day !== day) this.daily = { day, best: 0, distance: 0, runs: 0 };
      newBest = score > this.daily.best;
      if (newBest) this.daily.best = score;
      this.daily.distance = Math.max(this.daily.distance, metres);
      this.daily.runs++;
    } else {
      newBest = score > this.endlessBest;
      if (newBest) this.endlessBest = score;
      this.endlessDistance = Math.max(this.endlessDistance, metres);
    }
    this.save();
    return { newBest, coins, distanceCoins };
  }
  /** The daily record for a day: blank if the last daily run was on another day. */
  dailyOn(day = dayKey()) {
    return this.daily.day === day ? this.daily : { day, best: 0, distance: 0, runs: 0 };
  }
  /** Buys a piece of gear if it can be afforded; returns whether it is now owned. */
  buy(id: string) {
    const item = gearItem(id);
    if (!item) return false;
    if (this.owned.has(id)) return true;
    if (this.coins < item.price) return false;
    this.coins -= item.price;
    this.owned.add(id);
    this.save();
    return true;
  }
  /** Wears a piece of owned gear. */
  equip(id: string) {
    if (!this.owned.has(id)) return false;
    if (OUTFITS.some((o) => o.id === id)) this.outfit = id;
    else if (SKIS.some((s) => s.id === id)) this.skis = id;
    else return false;
    this.save();
    return true;
  }
  /** Wipes all progress back to a fresh game. */
  reset() {
    Object.assign(this, blank());
    this.save();
  }
  private save() {
    writeValue(
      KEY,
      JSON.stringify({
        version: 1,
        stars: this.stars,
        best: this.best,
        coins: this.coins,
        owned: [...this.owned],
        outfit: this.outfit,
        skis: this.skis,
        endlessBest: this.endlessBest,
        endlessDistance: this.endlessDistance,
        daily: this.daily,
        lastLevel: this.lastLevel,
      }),
    );
  }
}
