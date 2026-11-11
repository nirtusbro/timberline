import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { METRES_PER_COIN, SaveGame, dailySeed, dayKey, starCoins } from "../src/save";

const STAR_COINS = starCoins(0);
import { LEVEL_COUNT, WORLDS, WORLD_SIZE } from "../src/levels";
import { DEFAULT_OUTFIT, DEFAULT_SKIS, OUTFITS, SKIS } from "../src/gear";

describe("the saved game", () => {
  let data: Map<string, string>;
  beforeEach(() => {
    data = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("starts with the first level open, no stars, no coins and the free gear", () => {
    const save = new SaveGame();
    expect(save.totalStars).toBe(0);
    expect(save.coins).toBe(0);
    expect(save.isUnlocked(0)).toBe(true);
    expect(save.isUnlocked(1)).toBe(false);
    expect(save.isUnlocked(WORLD_SIZE)).toBe(false);
    expect(save.nextLevel()).toBe(0);
    expect(save.outfit).toBe(DEFAULT_OUTFIT);
    expect(save.skis).toBe(DEFAULT_SKIS);
    expect([...save.owned].sort()).toEqual([DEFAULT_OUTFIT, DEFAULT_SKIS].sort());
  });
  it("keeps the best stars and score, pays coins, and opens the next level on one star", () => {
    const save = new SaveGame();
    // No star: the score still counts as a best, the run's coins are kept, nothing opens.
    expect(save.complete(0, 900, 0, 7)).toEqual({
      newBest: true,
      newStars: 0,
      starCoins: 0,
      coins: 7,
      unlockedWorld: -1,
    });
    expect(save.isUnlocked(1)).toBe(false);
    expect(save.coins).toBe(7);
    const first = save.complete(0, 2500, 2, 10);
    expect(first.newStars).toBe(2);
    expect(first.starCoins).toBe(2 * STAR_COINS);
    expect(first.coins).toBe(10 + 2 * STAR_COINS);
    expect(save.coins).toBe(7 + 10 + 2 * STAR_COINS);
    expect(save.isUnlocked(1)).toBe(true);
    expect(save.nextLevel()).toBe(1);
    // A worse run never takes stars or the best score away, and pays no star bonus.
    const worse = save.complete(0, 1200, 1, 3);
    expect(worse).toMatchObject({ newBest: false, newStars: 0, starCoins: 0, coins: 3 });
    expect(save.stars[0]).toBe(2);
    expect(save.best[0]).toBe(2500);
    // The third star pays once.
    expect(save.complete(0, 5000, 3, 0).starCoins).toBe(STAR_COINS);
    expect(save.complete(0, 5200, 3, 0)).toMatchObject({ newBest: true, starCoins: 0 });
    const again = new SaveGame();
    expect(again.stars[0]).toBe(3);
    expect(again.best[0]).toBe(5200);
    expect(again.coins).toBe(save.coins);
    expect(again.isUnlocked(1)).toBe(true);
  });
  it("opens each mountain at its star count, wherever the stars come from", () => {
    const save = new SaveGame();
    for (let level = 0; level < WORLD_SIZE; level++) save.complete(level, 1000, 1, 0);
    // Ten levels cleared with one star each is not enough for the second mountain.
    expect(save.totalStars).toBe(WORLD_SIZE);
    expect(save.worldUnlocked(1)).toBe(false);
    expect(save.isUnlocked(WORLD_SIZE)).toBe(false);
    expect(save.nextLevel()).toBe(WORLD_SIZE - 1);
    let unlocked = -1;
    for (let level = 0; save.totalStars < WORLDS[1].starsToUnlock; level++)
      unlocked = save.complete(level, 3000, 2, 0).unlockedWorld;
    expect(unlocked).toBe(1);
    expect(save.worldUnlocked(1)).toBe(true);
    expect(save.isUnlocked(WORLD_SIZE)).toBe(true);
    expect(save.isUnlocked(WORLD_SIZE + 1)).toBe(false);
    expect(save.nextLevel()).toBe(WORLD_SIZE);
    expect(save.worldStars(0)).toBe(save.totalStars);
    expect(save.worldStars(1)).toBe(0);
    // Three stars everywhere opens everything.
    for (let level = 0; level < LEVEL_COUNT; level++) save.complete(level, 9999, 3, 0);
    for (let level = 0; level < LEVEL_COUNT; level++) expect(save.isUnlocked(level)).toBe(true);
    expect(save.totalStars).toBe(LEVEL_COUNT * 3);
  });
  it("sells gear for coins once, and wears only what is owned", () => {
    const save = new SaveGame();
    const outfit = OUTFITS[1],
      skis = SKIS[1];
    expect(save.buy(outfit.id)).toBe(false);
    expect(save.equip(outfit.id)).toBe(false);
    expect(save.outfit).toBe(DEFAULT_OUTFIT);
    save.complete(0, 1000, 3, outfit.price + skis.price - 3 * STAR_COINS);
    expect(save.coins).toBe(outfit.price + skis.price);
    expect(save.buy(outfit.id)).toBe(true);
    expect(save.coins).toBe(skis.price);
    // Buying it again costs nothing.
    expect(save.buy(outfit.id)).toBe(true);
    expect(save.coins).toBe(skis.price);
    expect(save.equip(outfit.id)).toBe(true);
    expect(save.buy(skis.id)).toBe(true);
    expect(save.equip(skis.id)).toBe(true);
    expect(save.coins).toBe(0);
    expect(save.buy("no-such-thing")).toBe(false);
    const again = new SaveGame();
    expect(again.outfit).toBe(outfit.id);
    expect(again.skis).toBe(skis.id);
    expect(again.owned.has(outfit.id)).toBe(true);
    expect(again.equip(DEFAULT_OUTFIT)).toBe(true);
    // Free gear is free, and the catalogue has no two pieces with one id.
    expect(OUTFITS[0].price).toBe(0);
    expect(SKIS[0].price).toBe(0);
    const ids = [...OUTFITS, ...SKIS].map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const item of [...OUTFITS.slice(1), ...SKIS.slice(1)]) expect(item.price).toBeGreaterThan(0);
  });
  it("keeps endless and daily records apart, and starts the daily fresh each day", () => {
    const save = new SaveGame();
    const run = save.completeEndless(4000, 1234.9, 6, false);
    expect(run).toEqual({ newBest: true, coins: 6 + Math.floor(1234 / METRES_PER_COIN), distanceCoins: 12 });
    expect(save.endlessBest).toBe(4000);
    expect(save.endlessDistance).toBe(1234);
    expect(save.completeEndless(3000, 2000, 0, false).newBest).toBe(false);
    expect(save.endlessBest).toBe(4000);
    expect(save.endlessDistance).toBe(2000);
    expect(save.dailyOn("2026-11-11").runs).toBe(0);
    expect(save.completeEndless(900, 500, 0, true, "2026-11-11").newBest).toBe(true);
    expect(save.completeEndless(700, 800, 0, true, "2026-11-11").newBest).toBe(false);
    expect(save.dailyOn("2026-11-11")).toEqual({ day: "2026-11-11", best: 900, distance: 800, runs: 2 });
    expect(save.endlessBest).toBe(4000);
    // Tomorrow the slate is clean.
    expect(save.dailyOn("2026-11-12")).toEqual({ day: "2026-11-12", best: 0, distance: 0, runs: 0 });
    expect(save.completeEndless(100, 50, 0, true, "2026-11-12").newBest).toBe(true);
    expect(new SaveGame().dailyOn("2026-11-12").best).toBe(100);
  });
  it("gives everyone the same daily course for a day and a different one the next", () => {
    expect(dayKey(new Date(2026, 10, 11, 23, 59))).toBe("2026-11-11");
    expect(dayKey(new Date(2027, 0, 5))).toBe("2027-01-05");
    expect(dailySeed("2026-11-11")).toBe(dailySeed("2026-11-11"));
    expect(dailySeed("2026-11-11")).not.toBe(dailySeed("2026-11-12"));
    expect(Number.isInteger(dailySeed())).toBe(true);
    expect(dailySeed()).toBeGreaterThanOrEqual(0);
  });
  it("pays more for a star on each mountain", () => {
    for (let level = WORLD_SIZE; level < LEVEL_COUNT; level += WORLD_SIZE)
      expect(starCoins(level)).toBeGreaterThan(starCoins(level - 1));
    expect(starCoins(WORLD_SIZE - 1)).toBe(starCoins(0));
    const save = new SaveGame();
    for (let level = 0; level < LEVEL_COUNT; level++) save.complete(level, 1, 3, 0);
    // Three-starring the whole game buys most of the shop, not all of it.
    const shop = [...OUTFITS, ...SKIS].reduce((sum, item) => sum + item.price, 0);
    expect(save.coins).toBeGreaterThan(shop * 0.2);
    expect(save.coins).toBeLessThan(shop);
  });
  it("resets to a fresh game", () => {
    const save = new SaveGame();
    save.complete(0, 5000, 3, 500);
    save.buy(OUTFITS[1].id);
    save.equip(OUTFITS[1].id);
    save.completeEndless(100, 100, 0, false);
    save.reset();
    expect(save.totalStars).toBe(0);
    expect(save.coins).toBe(0);
    expect(save.outfit).toBe(DEFAULT_OUTFIT);
    expect(save.endlessBest).toBe(0);
    expect(new SaveGame().totalStars).toBe(0);
    expect(new SaveGame().owned.size).toBe(2);
  });
  it("ignores damaged saves and impossible values", () => {
    data.set("timberline:save-v1", "{not json");
    expect(new SaveGame().totalStars).toBe(0);
    data.set(
      "timberline:save-v1",
      JSON.stringify({
        version: 1,
        stars: [9, -2, "x", 2],
        best: [100, null, 1.5],
        coins: -40,
        owned: ["podium", "nonsense", 7],
        outfit: "lava",
        skis: "nonsense",
        lastLevel: 4000,
      }),
    );
    const save = new SaveGame();
    expect(save.stars.slice(0, 4)).toEqual([3, 0, 0, 2]);
    expect(save.best.slice(0, 3)).toEqual([100, 0, 0]);
    expect(save.coins).toBe(0);
    expect(save.owned.has("podium")).toBe(true);
    expect(save.owned.has("nonsense")).toBe(false);
    // Gear that is not owned cannot be worn, however the save got that way.
    expect(save.outfit).toBe(DEFAULT_OUTFIT);
    expect(save.skis).toBe(DEFAULT_SKIS);
    expect(save.lastLevel).toBe(0);
    data.set("timberline:save-v1", JSON.stringify({ version: 99, coins: 5 }));
    expect(new SaveGame().coins).toBe(0);
  });
  it("keeps session progress if browser storage is blocked", () => {
    vi.stubGlobal("localStorage", {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    });
    const save = new SaveGame();
    expect(save.complete(0, 1000, 1, 5).coins).toBe(5 + STAR_COINS);
    expect(save.isUnlocked(1)).toBe(true);
  });
});
