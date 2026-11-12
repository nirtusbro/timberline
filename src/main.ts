import "./style.css";
import {
  createEndlessRun,
  createRun,
  stepRun,
  ENDLESS_LIVES,
  CRATES_PER_LIFE,
  COMBO_CAP,
  CRASH_PENALTY,
  TOKEN_COINS,
  surfaceHeight,
  gateU,
  type Fx,
} from "./physics";
import { trailAt, trailDir } from "./trail";
import { LEVEL_COUNT, WORLDS, WORLD_COUNT, WORLD_SIZE, getCourse, worldOf, type PowerKind } from "./levels";
import { BOOST_TIME, DOUBLE_TIME, MAGNET_TIME, RIVAL_POINTS } from "./extras";
import { SkiInput } from "./input";
import { SkiScene } from "./scene";
import { SkiAudio } from "./audio";
import { readValue, writeValue } from "./storage";
import { CRATE_COINS } from "./crates";
import { SaveGame, dailySeed } from "./save";
import { OUTFITS, SKIS, gearItem, type Outfit, type Skis } from "./gear";
import { THEMES, endlessTheme } from "./themes";
import { POWER_COLORS, paintPowerIcon } from "./props";
import { gearIcon, mapArt, mapSpots } from "./mapart";
import { setupInstall, setupPwa } from "./pwa";
import { SKILLS, createPilot } from "./pilot";
import { version } from "../package.json";

type RunKind = "level" | "endless" | "daily";
type Mode =
  | "home"
  | "levels"
  | "gear"
  | "settings"
  | "how"
  | "playing"
  | "paused"
  | "celebrating"
  | "finished";

/** Past this many lives the HUD draws one heart with a count instead of a row. */
const MAX_HEART_ICONS = 5;
/** Seconds the name and hint of a level stay up at the start of a run. */
const INTRO_TIME = 2.6;
/** The sim holds still for this long on a tumble, so the hit lands. */
const HIT_STOP = 0.09;
/** How long each line of the results tally shows before the next flips in. */
const TICK_TIME = 1.1;
const POWER_NAMES: Record<PowerKind, [title: string, sub: string]> = {
  magnet: ["Magnet", "Coins come to you"],
  shield: ["Shield", "Takes one knock"],
  double: ["Double", "Every point ×2"],
};
/** What Rusty has to say after a race, by world: when he loses, and when he wins. */
const QUIPS: [lost: string, won: string][] = [
  ["Beginner's luck. I let you have that one.", "Too slow, pup. Try keeping up next time."],
  ["You went the long way round and still… hmph.", "I told you I knew these woods."],
  ["My skis slipped. Ice does that. To some of us.", "Slide wide, lose time. First rule of the river."],
  ["Fine. You can jump. Anyone can jump.", "Mind the gap, wolf."],
  ["…All right. You're faster. Don't tell anyone.", "Thanks for following my lantern. All the way down."],
];

const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const num = (n: number) => n.toLocaleString("en-US");
/** Three punch holes, the earned ones punched into stars. */
const punches = (earned: number) =>
  [0, 1, 2].map((i) => `<i${i < earned ? ' class="on"' : ""}></i>`).join("");
/** Writes text only when it changed, so the HUD costs nothing on a quiet frame. */
const shown = new WeakMap<HTMLElement, string>();
function setText(target: HTMLElement, text: string) {
  if (shown.get(target) === text) return;
  shown.set(target, text);
  target.textContent = text;
}
/** Restarts a CSS animation on an element by re-adding its class. */
function replay(target: HTMLElement, name: string) {
  target.classList.remove(name);
  void target.offsetWidth;
  target.classList.add(name);
}

const canvas = el<HTMLCanvasElement>("game");
const input = new SkiInput(canvas);
const save = new SaveGame();
const audio = new SkiAudio();
audio.muted = readValue("muted", "false") === "true";
let haptics = readValue("haptics", "true") === "true";
input.sensitivity = Number(readValue("sensitivity", "1")) || 1;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

let level = save.nextLevel();
let kind: RunKind = "level";
let run = createRun(level);
let mode: Mode = "home";
let scene: SkiScene;
let tutorial = false;
let steered = false;
let gateHintShown = false;
let bannerUntil = 0;
let finishDelay = 0;
let elapsed = 0;
let hitStop = 0;
let coinStreak = 0;
let lastCoinAt = -9;
let warnUntil = 0;
let settingsReturn: Mode = "home";
let cardLevel = -1;
let mapWorld = worldOf(level);
let result = { newBest: false, newStars: 0, starCoins: 0, coins: 0, unlockedWorld: -1, distanceCoins: 0 };
let starTimers: number[] = [];
/** The score shown on the results screen counts up to the real one; the tally flips through its lines. */
let tally = { from: 0, to: 0, start: 0 };
let ticker: { rows: string[]; at: number; next: number } = { rows: [], at: -1, next: 0 };
/** Development only: lets the skier steer himself, to watch a run without playing it. */
let autopilot = false;
let botSkill = "";
let pilot: ReturnType<typeof createPilot> | null = null;

const scoreEl = el("score"),
  gatesEl = el("gate-count"),
  pipsEl = el("pips"),
  coinEl = el("coin-count"),
  livesEl = el("lives"),
  lifeProgressEl = el("life-progress"),
  starMeter = el("star-meter"),
  starFill = el("star-fill"),
  starTicks = [...starMeter.querySelectorAll<HTMLElement>(".tick")],
  comboBadge = el("combo-badge"),
  effectsEl = el("effects"),
  twistEl = el("twist"),
  bannerEl = el("banner"),
  popupsEl = el("popups"),
  tutorialEl = el("tutorial"),
  vignette = el("vignette");

function buzz(pattern: number | number[]) {
  if (!haptics) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* Vibration is a nicety; a browser that refuses it changes nothing. */
  }
}
const formatTime = (time: number) => {
  const tenths = Math.floor(time * 10);
  return `${Math.floor(tenths / 600)}:${String(Math.floor(tenths / 10) % 60).padStart(2, "0")}.${tenths % 10}`;
};
const prettyDay = () =>
  new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });

// ---------------------------------------------------------------- Power-up badges

/** The badges under the score that show what is running, each with a ring that runs down. */
const chips = (["boost", "magnet", "shield", "double"] as const).map((key) => {
  const chip = document.createElement("div");
  chip.className = `effect ${key}`;
  chip.hidden = true;
  if (key === "boost")
    chip.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 17l7-6 7 6M5 11l7-6 7 6"/></svg>`;
  else {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    paintPowerIcon(c.getContext("2d")!, key, 64);
    chip.innerHTML = `<img alt="" src="${c.toDataURL()}" />`;
  }
  effectsEl.append(chip);
  return { key, chip, last: -1 };
});

// ---------------------------------------------------------------- Home

function refreshHome() {
  const course = getCourse(level),
    world = worldOf(level);
  el("home-stars").textContent = num(save.totalStars);
  el("home-coins").textContent = num(save.coins);
  el("play-grade").className = `grade g${world}`;
  el("play-eyebrow").textContent = WORLDS[world].name;
  el("play-number").textContent = String(level + 1);
  el("play-name").textContent = course.name;
  el("play-stars").innerHTML = punches(save.stars[level]);
  el("tile-endless").textContent = save.endlessBest ? `Best ${num(save.endlessBest)}` : "3 lives";
  const today = save.dailyOn();
  el("tile-daily").textContent = today.runs ? `Best ${num(today.best)}` : "New today";
}
function selectLevel(next: number) {
  if (!save.isUnlocked(next)) return false;
  level = next;
  kind = "level";
  run = createRun(level);
  refreshHome();
  return true;
}
el("wolf-tap").onclick = () => {
  // Timber says hello.
  audio.unlock();
  audio.play("howl");
  buzz(12);
  if (scene) scene.character.greet = elapsed;
};

// ---------------------------------------------------------------- Trail map

/** What the third star of a level asks for, when it is not just a score. */
const thirdStar = (index: number) => (getCourse(index).twist === "rival" ? "Beat Rusty" : "");
function renderMap(world: number, from = 0) {
  mapWorld = Math.max(0, Math.min(WORLD_COUNT - 1, world));
  const w = mapWorld,
    info = WORLDS[w],
    open = save.worldUnlocked(w),
    next = save.nextLevel();
  const art = el("map-art");
  art.innerHTML = mapArt(w);
  art.style.setProperty("--from", `${from * 46}px`);
  if (from) replay(art, "swap");
  el("map-title").textContent = info.name;
  el("map-blurb").textContent = info.blurb;
  el("levels-stars").textContent = `${save.worldStars(w)}/${WORLD_SIZE * 3}`;
  const measured = el("levels-screen").getBoundingClientRect();
  // A screen not yet shown measures nothing: it will fill the window.
  const box = measured.width && measured.height ? measured : { width: window.innerWidth, height: window.innerHeight };
  const scale = Math.max(box.width / 390, box.height / 800);
  const place = (x: number, y: number) =>
    `left:${(x * 390 * scale - (390 * scale - box.width) / 2).toFixed(1)}px;top:${(y * 800 * scale - (800 * scale - box.height) / 2).toFixed(1)}px`;
  el("map-nodes").innerHTML = mapSpots(w)
    .map(([x, y], i) => {
      const index = w * WORLD_SIZE + i,
        unlocked = save.isUnlocked(index),
        course = getCourse(index);
      const mark = course.role === "race" ? "Race" : course.role === "boss" ? "Boss" : "";
      return `<button class="node role-${course.role}${index === next && unlocked ? " next" : ""}" style="${place(x, y)};--i:${i}" data-level="${index}" ${unlocked ? "" : 'aria-disabled="true"'} aria-label="Level ${index + 1}, ${course.name}${unlocked ? `, ${save.stars[index]} of 3 stars` : ", locked"}">${index + 1}${mark ? `<em>${mark}</em>` : ""}<span class="punches">${punches(save.stars[index])}</span></button>`;
    })
    .join("");
  el("map-closed").hidden = open;
  el("map-closed-text").textContent = `Opens at ${info.starsToUnlock} stars · you have ${save.totalStars}`;
  el("map-dots").innerHTML = WORLDS.map(
    (_, i) => `<button class="${i === w ? "on" : ""}" data-world="${i}" aria-label="${WORLDS[i].name}"><i class="grade g${i}"></i></button>`,
  ).join("");
  el<HTMLButtonElement>("map-prev").disabled = w === 0;
  el<HTMLButtonElement>("map-next").disabled = w === WORLD_COUNT - 1;
  el("levels-screen").dataset.world = String(w);
  closeCard();
}
function openCard(index: number) {
  const course = getCourse(index),
    w = worldOf(index);
  cardLevel = index;
  el("card-grade").className = `grade g${w}`;
  el("card-eyebrow").textContent = `${WORLDS[w].name} · ${course.role === "race" ? "Race" : course.role === "boss" ? "Boss" : `Level ${index + 1}`}`;
  el("card-number").textContent = String(index + 1);
  el("card-name").textContent = course.name;
  el("card-hint").textContent = course.hint;
  el("card-stars").innerHTML = course.starScores
    .map((score, i) => {
      const stars = (save.stars[index] > i ? '<i class="on"></i>' : "<i></i>").repeat(i + 1);
      // The third star is a clean sheet, not a score.
      const ask = i < 2 ? num(score) : "Every gate, no tumble";
      const note = i < 2 ? (i === 0 && save.best[index] ? `Best ${num(save.best[index])}` : "") : `${course.starBullseyes} bullseyes${thirdStar(index) ? ` · ${thirdStar(index).toLowerCase()}` : ""}`;
      return `<div><span class="punches">${stars}</span>${ask}${note ? `<small>${note}</small>` : ""}</div>`;
    })
    .join("");
  const card = el("level-card");
  card.hidden = false;
  // The ticket never covers the level it describes: low nodes send it to the top of the map.
  const low = mapSpots(w)[index % WORLD_SIZE][1] > 0.56;
  card.style.bottom = low ? "auto" : "";
  card.style.top = low ? "calc(var(--safe-top) + 108px)" : "";
  replay(card, "in");
  el("map-pager").style.visibility = low ? "visible" : "hidden";
  el("map-blurb").hidden = true;
  for (const node of el("map-nodes").querySelectorAll(".node"))
    node.classList.toggle("picked", Number((node as HTMLElement).dataset.level) === index);
}
function closeCard() {
  cardLevel = -1;
  el("level-card").hidden = true;
  el("map-pager").style.visibility = "visible";
  el("map-blurb").hidden = false;
  for (const node of el("map-nodes").querySelectorAll(".node.picked")) node.classList.remove("picked");
}
const turnMap = (by: number) => {
  if (mapWorld + by < 0 || mapWorld + by >= WORLD_COUNT) return;
  audio.unlock();
  audio.play("tap");
  renderMap(mapWorld + by, by);
};
el("map-prev").onclick = () => turnMap(-1);
el("map-next").onclick = () => turnMap(1);
el("map-dots").addEventListener("click", (e) => {
  const dot = (e.target as HTMLElement).closest<HTMLElement>("[data-world]");
  if (dot) renderMap(Number(dot.dataset.world), Math.sign(Number(dot.dataset.world) - mapWorld));
});
el("map-nodes").addEventListener("click", (e) => {
  const cell = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-level]");
  if (!cell) return closeCard();
  if (cell.getAttribute("aria-disabled")) {
    closeCard();
    const index = Number(cell.dataset.level);
    audio.unlock();
    audio.play("deny");
    replay(cell, "nope");
    el("map-blurb").textContent = save.worldUnlocked(worldOf(index))
      ? `Level ${index + 1} opens with a star on level ${index}.`
      : `${WORLDS[worldOf(index)].name} opens at ${WORLDS[worldOf(index)].starsToUnlock} stars.`;
    return;
  }
  audio.unlock();
  audio.play("tap");
  openCard(Number(cell.dataset.level));
});
// Swipe between mountains, like postcards.
let swipeX: number | null = null;
el("levels-screen").addEventListener("pointerdown", (e) => (swipeX = e.clientX));
el("levels-screen").addEventListener("pointerup", (e) => {
  if (swipeX !== null && Math.abs(e.clientX - swipeX) > 60) turnMap(e.clientX < swipeX ? 1 : -1);
  swipeX = null;
});
el("card-close").onclick = closeCard;
el("card-play").onclick = () => {
  audio.unlock();
  if (cardLevel >= 0 && selectLevel(cardLevel)) start("level");
};

// ---------------------------------------------------------------- Gear

let gearTab: "outfits" | "skis" = "outfits";
let gearSelected = save.outfit;
const wornIn = (tab: typeof gearTab) => (tab === "outfits" ? save.outfit : save.skis);
function dress() {
  // In the shop the wolf tries on whatever is selected; everywhere else he wears what he owns.
  const trying = mode === "gear" ? gearSelected : "";
  scene?.character.setLook(
    OUTFITS.some((o) => o.id === trying) ? trying : save.outfit,
    SKIS.some((s) => s.id === trying) ? trying : save.skis,
  );
}
function renderGear(scroll = false) {
  const items: (Outfit | Skis)[] = gearTab === "outfits" ? OUTFITS : SKIS;
  el("gear-coins").textContent = num(save.coins);
  el("tab-outfits").setAttribute("aria-selected", String(gearTab === "outfits"));
  el("tab-skis").setAttribute("aria-selected", String(gearTab === "skis"));
  el("gear-grid").innerHTML = items
    .map((item) => {
      const owned = save.owned.has(item.id),
        worn = wornIn(gearTab) === item.id;
      const state = worn ? "Wearing" : owned ? "Owned" : `<i class="i-coin"></i>${num(item.price)}`;
      return `<button class="item${item.id === gearSelected ? " selected" : ""}${worn ? " worn" : ""}" data-gear="${item.id}">${gearIcon(item)}<b>${item.name}</b><small>${state}</small></button>`;
    })
    .join("");
  const item = gearItem(gearSelected)!,
    action = el<HTMLButtonElement>("gear-action");
  const owned = save.owned.has(item.id);
  action.hidden = wornIn(gearTab) === item.id;
  action.disabled = !owned && save.coins < item.price;
  action.textContent =
    wornIn(gearTab) === item.id
      ? "Wearing"
      : owned
        ? "Wear it"
        : save.coins >= item.price
          ? `Buy · ${num(item.price)}`
          : `${num(item.price - save.coins)} short`;
  if (scroll) el("gear-grid").querySelector(".selected")?.scrollIntoView({ inline: "center", block: "nearest" });
  dress();
}
function openGearTab(tab: typeof gearTab) {
  gearTab = tab;
  gearSelected = wornIn(tab);
  renderGear(true);
}
el("tab-outfits").onclick = () => openGearTab("outfits");
el("tab-skis").onclick = () => openGearTab("skis");
el("gear-grid").addEventListener("click", (e) => {
  const item = (e.target as HTMLElement).closest<HTMLElement>("[data-gear]");
  if (!item) return;
  audio.unlock();
  audio.play("tap");
  gearSelected = item.dataset.gear!;
  renderGear();
});
el("gear-action").onclick = () => {
  audio.unlock();
  const wasOwned = save.owned.has(gearSelected);
  if (!save.buy(gearSelected)) return;
  save.equip(gearSelected);
  audio.play(wasOwned ? "tap" : "buy");
  if (!wasOwned) buzz([20, 40, 30]);
  if (scene) scene.character.greet = elapsed;
  renderGear();
};

// ---------------------------------------------------------------- Modes

const SCREENS: Record<Mode, string> = {
  home: "home",
  levels: "levels-screen",
  gear: "gear-screen",
  settings: "settings-screen",
  how: "how-screen",
  playing: "hud",
  celebrating: "hud",
  paused: "pause-screen",
  finished: "finish-screen",
};
function changeMode(next: Mode) {
  mode = next;
  input.enabled = mode === "playing";
  input.reset();
  for (const id of new Set(Object.values(SCREENS))) {
    const screen = el(id),
      show = SCREENS[next] === id || (id === "hud" && next === "paused");
    if (show && screen.hidden) screen.scrollTop = 0;
    screen.hidden = !show;
  }
  document.body.dataset.mode = next;
  if (run.course.night && (next === "playing" || next === "celebrating" || next === "paused")) document.body.dataset.night = "";
  else delete document.body.dataset.night;
  // Every run under the night sky keeps a pale keyline round the timing board.
  if (worldOf(run.course.level) === 4 && (next === "playing" || next === "celebrating" || next === "paused")) document.body.dataset.dark = "";
  else delete document.body.dataset.dark;
  dress();
  audio.update(run, next === "playing", 0);
}
/** Sweeps a sheet of snow across the screen and changes what is behind it while it is covered. */
let wiping = 0;
function wipe(change: () => void) {
  if (reducedMotion) return change();
  clearTimeout(wiping);
  replay(el("wipe"), "go");
  wiping = window.setTimeout(change, 150);
}
function goHome() {
  for (const timer of starTimers) clearTimeout(timer);
  kind = "level";
  if (!save.isUnlocked(level)) level = save.nextLevel();
  run = createRun(level);
  refreshHome();
  scene?.reset();
  vignette.style.opacity = "0";
  popupsEl.textContent = "";
  bannerEl.classList.remove("show");
  changeMode("home");
}

// ---------------------------------------------------------------- HUD

function layoutStarMeter() {
  const [, , top] = run.course.starScores;
  starTicks.forEach((tick, i) => {
    tick.style.left = `${(run.course.starScores[i] / top) * 100}%`;
    tick.classList.remove("on");
  });
}
let hearts = "";
let comboShown = 0;
let pips: HTMLElement[] = [];
function updateHud() {
  const course = run.course,
    endless = course.endless === true;
  setText(scoreEl, num(run.score));
  setText(coinEl, String(run.coins));
  // The combo punches with every gate and shatters when it breaks.
  if (run.combo !== comboShown) {
    if (run.combo >= 2) {
      comboBadge.hidden = false;
      comboBadge.classList.remove("lost");
      comboBadge.classList.toggle("max", run.combo === COMBO_CAP);
      setText(comboBadge, `×${run.combo}`);
      replay(comboBadge, "bump");
    } else if (comboShown >= 2) {
      comboBadge.classList.remove("bump");
      replay(comboBadge, "lost");
    } else comboBadge.hidden = true;
    comboShown = run.combo;
  }
  const left: Record<string, number> = {
    boost: run.boost / BOOST_TIME,
    magnet: Math.min(1, run.magnet / MAGNET_TIME),
    shield: run.shield ? 1 : 0,
    double: run.double / DOUBLE_TIME,
  };
  for (const chip of chips) {
    const share = Math.round(Math.min(1, left[chip.key]) * 40) / 40;
    if (share === chip.last) continue;
    chip.last = share;
    chip.chip.hidden = share <= 0;
    chip.chip.style.setProperty("--left", String(share));
  }
  if (endless) {
    // Lives drain on a miss or a tumble and every five crates add one, with no cap.
    const lives = Math.max(0, run.lives);
    const html =
      lives > MAX_HEART_ICONS
        ? `<span>♥</span><span class="life-count">×${lives}</span>`
        : Array.from(
            { length: Math.max(lives, ENDLESS_LIVES) },
            (_, i) => `<span${i < lives ? "" : ' class="lost"'}>♥</span>`,
          ).join("");
    if (html !== hearts) livesEl.innerHTML = hearts = html;
    setText(lifeProgressEl, `Crates ${run.cratesTowardLife}/${CRATES_PER_LIFE}`);
    setText(gatesEl, `${num(Math.floor(run.s))} m`);
  } else {
    const scores = course.starScores;
    starFill.style.width = `${Math.min(1, run.score / scores[2]) * 100}%`;
    starTicks.forEach((tick, i) =>
      tick.classList.toggle("on", run.score >= scores[i] && (i < 2 || (run.misses === 0 && run.bullseyes >= course.starBullseyes))),
    );
    setText(gatesEl, "");
  }
  // A race or an avalanche: one line says how it stands.
  if (run.rival) {
    const gap = Math.round(run.rival.s - run.s);
    setText(twistEl, run.rival.done ? "Rusty has finished" : gap > 1 ? `Rusty +${gap} m` : gap < -1 ? `You +${-gap} m` : "Neck and neck");
    twistEl.classList.toggle("danger", gap > 1);
  } else if (!Number.isNaN(run.avalancheS)) {
    const gap = Math.max(0, Math.round(run.s - run.avalancheS));
    setText(twistEl, `Avalanche ${gap} m`);
    twistEl.classList.toggle("danger", gap < 28);
    vignette.style.opacity = String(Math.min(1, Math.max(0, 1 - (gap - 8) / 50) * 1.15));
  }
}
/** Marks the pip of a gate just judged, and lights the next. */
function markPip(index: number, state: "hit" | "bull" | "miss") {
  if (pips[index]) pips[index].className = state;
  if (pips[index + 1]) pips[index + 1].className = "now";
}
/** A line of news under the timing board: a level's name, a power-up, a warning. */
function banner(title: string, sub = "", tone = "", time = 1.6) {
  setText(el("banner-title"), title);
  setText(el("banner-sub"), sub);
  bannerEl.className = `banner show ${tone}`;
  bannerUntil = elapsed + time;
}
/** A number or a word that pops out beside the skier and floats away. */
let popSide = 1;
function popup(text: string, tone = "", sub = "") {
  if (!scene) return;
  const ground = surfaceHeight(run.course, run.x, run.z) + run.y;
  const at = scene.project(run.x, ground + 1.3, run.z);
  const node = document.createElement("div");
  node.className = `popup ${tone}`;
  node.innerHTML = sub ? `<b>${text}</b><small>${sub}</small>` : `<b>${text}</b>`;
  popSide = -popSide;
  const side = at.x < 160 ? 1 : at.x > innerWidth - 160 ? -1 : popSide;
  node.style.left = `${Math.max(64, Math.min(innerWidth - 64, at.x + side * 84))}px`;
  node.style.top = `${at.y}px`;
  node.style.setProperty("--drift", `${side * 18}px`);
  node.addEventListener("animationend", () => node.remove(), { once: true });
  popupsEl.append(node);
  while (popupsEl.childElementCount > 6) popupsEl.firstElementChild!.remove();
}

// ---------------------------------------------------------------- Runs

/** Starts a run. From a menu the snow sweeps across first; a retry is immediate. */
function start(next: RunKind = kind, quick = false) {
  if (!scene) return;
  audio.unlock();
  if (quick) begin(next);
  else wipe(() => begin(next));
}
function begin(next: RunKind) {
  for (const timer of starTimers) clearTimeout(timer);
  // A stand-in player starts each run afresh.
  if (botSkill in SKILLS) pilot = createPilot(SKILLS[botSkill as keyof typeof SKILLS], Date.now());
  kind = next;
  const endless = kind !== "level";
  run =
    kind === "level"
      ? createRun(level)
      : createEndlessRun(kind === "daily" ? dailySeed() : undefined);
  const course = run.course;
  starMeter.hidden = endless;
  livesEl.hidden = lifeProgressEl.hidden = !endless;
  hearts = "";
  comboShown = 0;
  comboBadge.hidden = true;
  pipsEl.classList.toggle("endless", endless);
  pipsEl.innerHTML = endless ? "" : course.gates.map((_, i) => `<i${i ? "" : ' class="now"'}></i>`).join("");
  pips = [...pipsEl.children] as HTMLElement[];
  if (!endless) layoutStarMeter();
  twistEl.hidden = !course.twist || course.twist === "goldrush";
  twistEl.textContent = "";
  shown.delete(twistEl);
  vignette.style.opacity = "0";
  popupsEl.textContent = "";
  el("confetti")?.remove();
  el("warn-left").hidden = el("warn-right").hidden = true;
  finishDelay = 0;
  hitStop = 0;
  coinStreak = 0;
  steered = false;
  gateHintShown = false;
  scene.reset();
  changeMode("playing");
  scene.theme = endless ? endlessTheme(0) : THEMES[worldOf(level)];
  scene.weather = course.weather;
  scene.update(run, 0, mode, elapsed);
  updateHud();
  banner(
    kind === "level" ? course.name : kind === "daily" ? `Daily · ${prettyDay()}` : "Endless",
    kind === "level"
      ? course.hint
      : kind === "daily"
        ? "The same course for everyone today. Three lives; five crates win one back."
        : "Easy at first, harder every metre. Three lives; five crates win one back.",
    "intro",
    INTRO_TIME,
  );
  tutorial = kind === "level" && !readValue("learned", "");
  tutorialEl.hidden = !tutorial;
  tutorialEl.querySelector("p")!.textContent = "Drag left and right to carve";
  tutorialEl.querySelector("span")!.hidden = false;
  audio.play("start");
}
/** Marks what the sim says happened this step: sparks, sound, a word on screen. */
function effect(f: Fx) {
  const juice = scene.juice;
  const y = surfaceHeight(run.course, f.x, f.z);
  if (f.kind === "coin") {
    // Coins taken in quick succession ring up a scale.
    coinStreak = elapsed - lastCoinAt < 0.45 ? Math.min(12, coinStreak + 1) : 0;
    lastCoinAt = elapsed;
    audio.play("coin", coinStreak);
    juice.burst(run.x, y + 1 + run.y, run.z + 0.5, "#ffd23c", 5, 3.5, run.speed * 0.5, run.heading);
    replay(coinEl.parentElement!, "bump");
  } else if (f.kind === "power" && f.power) {
    audio.play("power");
    buzz([15, 30, 25]);
    banner(...POWER_NAMES[f.power], f.power, 1.5);
    juice.burst(run.x, y + 1.4, run.z, POWER_COLORS[f.power], 26, 7, run.speed * 0.6, run.heading);
    juice.ring(run.x, y, run.z, POWER_COLORS[f.power], 1.2);
  } else if (f.kind === "shield") {
    audio.play("shield");
    buzz([40, 30, 40]);
    popup("Saved!", "shield", "Shield");
    juice.burst(run.x, y + 1.2, run.z, POWER_COLORS.shield, 40, 9, run.speed * 0.5, run.heading);
    juice.ring(run.x, y, run.z, POWER_COLORS.shield, 1.6);
    juice.shake = 0.5;
  } else if (f.kind === "close") {
    audio.play("whoosh");
    buzz(10);
    popup("Close!", "close", `+${f.value}`);
  } else if (f.kind === "launch") {
    audio.play("launch");
    buzz(12);
    juice.burst(run.x, y + 1, run.z, "#ffffff", 16, 5, run.speed * 0.5, run.heading);
    if (run.leap) banner("Leap!", "", "gold", 0.9);
  } else if (f.kind === "land") {
    audio.play("land");
    buzz(25);
    popup(`+${f.value}`, "air", "Air");
    juice.ring(run.x, y, run.z, "#ffffff", 1.3);
    juice.burst(run.x, y + 0.3, run.z, "#ffffff", 22, 6, run.speed * 0.4, run.heading);
    juice.shake = Math.max(juice.shake, 0.3);
  } else if (f.kind === "swallow") {
    audio.play("land");
    banner("Swallowed!", "The gap took the front of the slide", "gold", 1.4);
  } else if (f.kind === "wake" && f.mover === "deer") {
    audio.play("deer");
    // The deer breaks cover on one side of the skier: which side of the screen that is depends on the way the camera is looking across the trail.
    const across = Math.cos(scene.yaw) * (f.x - run.x) - Math.sin(scene.yaw) * (f.z - run.z);
    const side = (Math.abs(across) > 0.5 ? across : (f.value ?? 1)) > 0 ? "warn-left" : "warn-right";
    // By night it is heard and not seen: the screen must not show what the headlamp has not found.
    if (!run.course.night) {
      el(side).hidden = false;
      replay(el(side), "flash");
      warnUntil = elapsed + 1.2;
    }
  } else if (f.kind === "wake" && (f.mover === "snowcat" || f.mover === "plough")) audio.play("beacon");
  else if (f.kind === "wake" && f.mover === "boulder") audio.play("rumble");
  else if (f.kind === "fall") banner("Into the gap!", "Hit the kicker to get across", "miss", 1.5);
  else if (f.kind === "bump") juice.burst(f.x, y + 1, f.z, "#ffffff", 30, 8, 4);
  else if (f.kind === "rival-finish" && !run.finished) banner("Rusty is home", "Finish anyway: the gates still count", "miss", 2);
}
function event(name: string) {
  const endless = run.course.endless === true;
  const juice = scene.juice;
  const ground = surfaceHeight(run.course, run.x, run.z);
  if (name === "finish") {
    tutorialEl.hidden = true;
    finishDelay = run.caught ? 1.8 : 1.2;
    vignette.style.opacity = run.caught ? "1" : "0";
    if (endless) {
      audio.play("over");
      result = {
        newStars: 0,
        starCoins: 0,
        unlockedWorld: -1,
        ...save.completeEndless(run.score, run.s, run.coins, kind === "daily"),
      };
      changeMode("celebrating");
      banner("Run over", `${num(Math.floor(run.s))} m`, "miss", 1.4);
      return;
    }
    audio.play(run.caught ? "buried" : run.passed ? "finish" : "over");
    result = { distanceCoins: 0, ...save.complete(level, run.score, run.stars, run.coins) };
    changeMode("celebrating");
    if (run.caught) {
      banner("Buried!", "The avalanche caught you", "miss", 1.8);
      juice.shake = 1.2;
    } else if (run.passed) {
      banner("Finish!", run.rivalBeaten ? `You beat Rusty · +${num(RIVAL_POINTS)}` : "", "gold", 1.2);
      for (const u of [-9, -3, 3, 9]) {
        // Four bursts across the trail, a little way past the line.
        const p = trailAt(run.course.trail, run.s + 4, run.u * 0.4 + u);
        juice.burst(p.x, surfaceHeight(run.course, p.x, p.z) + 2, p.z, ["#ffd23c", "#ff5a3c", "#27c4f5", "#ffffff"][(u + 9) / 6], 26, 10, 3, p.dir);
      }
    } else banner("Finished", "Not enough for a star", "miss", 1.2);
    buzz(run.passed ? [30, 60, 30] : 40);
    return;
  }
  if (name === "token") {
    audio.play("token");
    buzz(15);
    popup(`+${TOKEN_COINS}`, "gold", "Gold");
    juice.burst(run.x, ground + 1.3, run.z, "#ffc531", 24, 7, run.speed * 0.5, run.heading);
  } else if (name === "crate") {
    audio.play("crate");
    buzz(15);
    popup("Crate!", "gold", `+${CRATE_COINS} coins`);
    juice.burst(run.x, ground + 1, run.z, "#c98f55", 22, 7, run.speed * 0.5, run.heading);
  } else if (name === "life") {
    audio.play("life");
    buzz([20, 40, 20]);
    banner(`Extra life · ♥ ${run.lives}`, `${CRATES_PER_LIFE} crates caught`, "gold", 1.6);
    livesEl.classList.remove("hit");
  } else if (name === "gate") {
    const bullseye = run.gateBonus > 0;
    if (bannerEl.classList.contains("intro")) bannerUntil = 0;
    markPip(run.nextGate - 1, bullseye ? "bull" : "hit");
    audio.play(bullseye ? "bullseye" : "gate", run.combo);
    buzz(bullseye ? [12, 30, 12] : 8);
    popup(`+${num(run.gateGain)}`, bullseye ? "bullseye" : "", bullseye ? "Bullseye" : "");
    const gate = run.course.gates[run.nextGate - 1];
    const hue = gate.color === "red" ? "#ff5a5a" : "#4aa8ff";
    juice.ring(run.x, ground, run.z, bullseye ? "#ffd23c" : hue, bullseye ? 1.3 : 0.9);
    // A puff of the gate's colour off each of its poles, where they stand now.
    const through = gate.alt !== undefined && Math.abs(run.u - gate.alt) < Math.abs(run.u - gate.u) ? gate.alt : gateU(gate, run.time, run.gateShift);
    for (const side of [-1, 1]) {
      const p = trailAt(run.course.trail, gate.s, through + (side * gate.width) / 2);
      juice.burst(p.x, surfaceHeight(run.course, p.x, p.z) + 2, p.z, hue, bullseye ? 10 : 5, 4, run.speed * 0.3, run.heading);
    }
    if (bullseye) juice.burst(run.x, ground + 0.5, run.z, "#ffd23c", 18, 6, run.speed * 0.6, run.heading);
  } else if (name === "miss" || name === "crash") {
    audio.play(name);
    buzz(name === "crash" ? [70, 40, 70] : 35);
    const lives = endless ? `${Math.max(0, run.lives)} ♥ left` : "";
    // A gate gone by in a tumble is a gate missed too.
    for (let i = 0; i < run.nextGate; i++) if (pips[i]?.className === "now" || pips[i]?.className === "") markPip(i, "miss");
    if (name === "crash") {
      popup(`−${CRASH_PENALTY}`, "miss", "Wipeout");
      juice.shake = 0.9;
      juice.burst(run.x, ground + 0.8, run.z, "#ffffff", 46, 9, 5);
      hitStop = HIT_STOP;
      replay(document.body, "jolt");
    } else popup("Missed", "miss", lives || "Combo lost");
    if (endless) replay(livesEl, "hit");
  }
}

// ---------------------------------------------------------------- Results

const row = (label: string, value: string, tone = "") =>
  `<div class="${tone}"><dt>${label}</dt><dd>${value}</dd></div>`;
const plus = (n: number) => `+${num(n)}`;
/** Paper ribbons from the top of the screen: for three stars or a new best only. */
function confetti() {
  if (reducedMotion) return;
  const box = document.createElement("div");
  box.id = "confetti";
  const colours = ["#ff5a3c", "#ffc531", "#1f7ae0", "#1fa971", "#fff8ea"];
  for (let i = 0; i < 36; i++) {
    const bit = document.createElement("i");
    bit.style.left = `${Math.random() * 100}%`;
    bit.style.background = colours[i % colours.length];
    bit.style.animationDelay = `${0.5 + Math.random() * 0.6}s`;
    bit.style.setProperty("--dx", `${Math.random() * 120 - 60}px`);
    bit.style.setProperty("--spin", `${Math.random() * 900 - 450}deg`);
    box.append(bit);
  }
  el("finish-screen").prepend(box);
}
function finish() {
  const course = run.course,
    endless = course.endless === true,
    p = run.points;
  // The tally, a line at a time, the way a results board flips.
  const rows: string[] = [];
  rows.push(endless ? row("Gates", `${run.hits} hit · ${run.misses} missed`) : row(`Gates ${run.hits}/${course.gates.length}`, plus(p.gates)));
  if (run.bullseyes) rows.push(row(`Bullseyes ×${run.bullseyes}`, plus(p.bullseyes)));
  if (run.coinCount) rows.push(row(`Coins ×${run.coinCount}`, plus(p.coins)));
  if (run.jumps) rows.push(row(`Jumps ×${run.jumps}`, plus(p.air)));
  if (run.closeCalls) rows.push(row(`Close calls ×${run.closeCalls}`, plus(p.close)));
  if (run.crates.collected) rows.push(row(`Crates ×${run.crates.collected}`, plus(p.crates)));
  if (p.double) rows.push(row("Double bonus", plus(p.double)));
  if (course.twist === "rival") rows.push(row(run.rivalBeaten ? "Beat Rusty" : "Rusty won", run.rivalBeaten ? plus(p.twist) : "+0", run.rivalBeaten ? "" : "bad"));
  if (course.twist === "avalanche" && !run.caught) rows.push(row("Lead on the slide", plus(p.twist)));
  if (!endless && !run.caught && run.timeBonus) rows.push(row("Under par", plus(run.timeBonus)));
  if (run.crashes) rows.push(row(`Tumbles ×${run.crashes}`, `−${num(run.crashes * CRASH_PENALTY)}`, "bad"));
  if (run.bestCombo > 1) rows.push(row("Best combo", `×${run.bestCombo}`));
  rows.push(endless ? row("Distance", `${num(Math.floor(run.s))} m`) : row("Time", formatTime(run.time)));
  ticker = { rows, at: -1, next: elapsed + 0.35 };
  el("result-rows").innerHTML = "";
  const medals = el("result-stars");
  medals.hidden = endless;
  el("new-best").hidden = !result.newBest || (!endless && !run.passed);
  tally = { from: 0, to: run.score, start: elapsed + 0.2 };
  el("result-score").textContent = "0";
  el("result-coins").textContent = `+${num(result.coins)}`;
  const unlock = el("result-unlock");
  unlock.hidden = result.unlockedWorld < 0;
  if (result.unlockedWorld >= 0) unlock.textContent = `New world: ${WORLDS[result.unlockedWorld].name}!`;
  const nextButton = el("next-level"),
    sheet = el("finish-screen").querySelector<HTMLElement>(".sheet")!,
    quip = el("quip");
  sheet.classList.toggle("failed", !endless && !run.passed);
  quip.hidden = true;
  if (endless) {
    const daily = kind === "daily",
      record = daily ? save.dailyOn() : { best: save.endlessBest, distance: save.endlessDistance };
    el("finish-kicker").textContent = daily ? `Daily · ${prettyDay()}` : "Endless";
    el("result-title").textContent = `${num(Math.floor(run.s))} metres`;
    el("result-best").textContent = `${daily ? "Today’s best" : "Best"} ${num(record.best)} · longest ${num(record.distance)} m`;
    el("result-goal").textContent = "";
    el("result-coins-detail").textContent = result.distanceCoins ? `${result.distanceCoins} for distance` : "";
    nextButton.hidden = false;
    nextButton.textContent = "Again";
    nextButton.onclick = () => start(kind, true);
    el("retry").hidden = true;
  } else {
    const scores = course.starScores,
      next = level + 1;
    el("finish-kicker").textContent = `${WORLDS[worldOf(level)].name} · ${level + 1} · ${course.name}`;
    // The verdict answers to how the run went, not only to the stars.
    const clean = run.misses === 0 && run.crashes === 0;
    el("result-title").textContent = run.caught
      ? "Buried."
      : run.stars === 0
        ? scores[0] - run.score > scores[0] * 0.3
          ? "Not this time."
          : "So close."
        : run.stars === 3
          ? clean
            ? "Flawless!"
            : "Three stars!"
          : run.stars === 2
            ? clean
              ? "Clean run!"
              : "Good run."
            : run.misses > 2
              ? "Scraped through."
              : "Cleared.";
    [...medals.children].forEach((medal, i) => {
      // Re-adding the class replays the slam for each star earned.
      medal.classList.remove("earned");
      (medal as HTMLElement).style.setProperty("--i", String(i));
      void (medal as HTMLElement).offsetWidth;
      medal.classList.toggle("earned", i < run.stars);
    });
    medals.classList.remove("shake");
    if (run.stars === 3) replay(medals, "shake");
    starTimers = Array.from({ length: run.stars }, (_, i) =>
      window.setTimeout(
        () => {
          if (mode !== "finished") return;
          audio.play("star", i + 1);
          buzz(i === 2 ? [20, 30, 40] : 14);
        },
        250 + i * 180,
      ),
    );
    if (run.stars === 3 || (result.newBest && run.passed)) confetti();
    el("result-best").textContent = result.newBest ? "" : `Best ${num(save.best[level])}`;
    const goal = el("result-goal");
    if (run.caught) goal.textContent = "Bullseyes are speed, a missed gate lets it gain: thread the flags and stay on your feet.";
    else if (run.stars === 2 && (run.misses || run.score >= scores[2]))
      goal.textContent = run.misses
        ? `The third star wants every gate. You missed ${run.misses}.`
        : run.bullseyes < course.starBullseyes
          ? `The third star wants ${course.starBullseyes} bullseyes. You threaded ${run.bullseyes}.`
          : "The third star is Rusty's: beat him to the line.";
    else if (run.stars < 3) {
      const short = scores[run.stars] - run.score;
      goal.textContent =
        run.stars === 0
          ? `${num(short)} short of a star.${run.misses ? ` ${run.misses} missed gate${run.misses > 1 ? "s" : ""} broke the combo.` : ""}`
          : `${num(short)} more for ${run.stars + 1} stars.${run.misses ? ` You missed ${run.misses} gate${run.misses > 1 ? "s" : ""}.` : ""}`;
    } else goal.textContent = next >= LEVEL_COUNT ? "Every star on the last level. The mountain is yours." : "";
    const canAdvance = run.passed && next < LEVEL_COUNT && save.isUnlocked(next);
    if (run.passed && next < LEVEL_COUNT && !canAdvance) {
      const world = WORLDS[worldOf(next)];
      goal.textContent = `${world.name} opens at ${world.starsToUnlock} stars. You have ${save.totalStars}: go back for more.`;
    }
    el("result-coins-detail").textContent = result.starCoins
      ? `${result.starCoins} for ${result.newStars} new star${result.newStars === 1 ? "" : "s"}`
      : "";
    // One coral button: on to the next level if there is one, otherwise again.
    nextButton.hidden = false;
    nextButton.textContent = canAdvance ? "Next" : run.passed ? "Again" : "Retry";
    nextButton.onclick = canAdvance
      ? () => {
          if (selectLevel(level + 1)) start("level");
        }
      : () => start(kind, true);
    el("retry").hidden = !canAdvance;
    // Rusty has something to say on race days.
    if (course.twist === "rival") {
      el("quip-text").textContent = QUIPS[worldOf(level)][run.rivalBeaten ? 0 : 1];
      quip.hidden = false;
    }
  }
  vignette.style.opacity = "0";
  changeMode("finished");
}
// A tap on the score skips the roll.
el("result-score-wrap").onclick = () => {
  tally.from = tally.to;
  setText(el("result-score"), num(tally.to));
};

// ---------------------------------------------------------------- Buttons

const press = (id: string, action: () => void) => {
  el(id).onclick = () => {
    audio.unlock();
    audio.play("tap");
    action();
  };
};
el("play").onclick = () => start("level");
el("endless").onclick = () => start("endless");
el("daily").onclick = () => start("daily");
el("retry").onclick = el("restart").onclick = () => start(kind, true);
el("pause").onclick = () => {
  if (mode === "playing") changeMode("paused");
};
el("resume").onclick = () => {
  audio.unlock();
  // A run that ended while the pause was coming up goes on to its results.
  changeMode(run.finished ? "celebrating" : "playing");
};
const toMap = () => {
  goHome();
  // The map is laid out once its screen is showing, or there is nothing to measure.
  changeMode("levels");
  renderMap(worldOf(level));
};
press("quit", () => wipe(goHome));
press("finish-home", () => wipe(goHome));
press("levels-open", toMap);
press("finish-levels", () => wipe(toMap));
press("levels-close", goHome);
press("gear-open", () => {
  changeMode("gear");
  openGearTab("outfits");
});
press("gear-close", goHome);
press("settings-open", () => {
  settingsReturn = "home";
  syncSettings();
  changeMode("settings");
});
press("settings-close", () => changeMode(settingsReturn));
press("how", () => changeMode("how"));
press("how-close", () => {
  syncSettings();
  changeMode("settings");
});

function syncSettings() {
  el("set-sound").setAttribute("aria-checked", String(!audio.muted));
  el("pause-sound").setAttribute("aria-pressed", String(!audio.muted));
  el("set-haptics").setAttribute("aria-checked", String(haptics));
  for (const option of el("set-steering").querySelectorAll<HTMLElement>("button"))
    option.classList.toggle("on", Number(option.dataset.value) === input.sensitivity);
  const reset = el("reset");
  reset.textContent = "Reset progress";
  delete reset.dataset.armed;
}
function toggleSound() {
  audio.unlock();
  audio.setMuted(!audio.muted);
  writeValue("muted", String(audio.muted));
  syncSettings();
  audio.play("tap");
}
el("set-sound").onclick = el("pause-sound").onclick = toggleSound;
el("set-haptics").onclick = () => {
  haptics = !haptics;
  writeValue("haptics", String(haptics));
  syncSettings();
  buzz(30);
};
el("set-steering").addEventListener("click", (e) => {
  const option = (e.target as HTMLElement).closest<HTMLElement>("[data-value]");
  if (!option) return;
  input.sensitivity = Number(option.dataset.value);
  writeValue("sensitivity", String(input.sensitivity));
  syncSettings();
});
el("reset").onclick = () => {
  const reset = el("reset");
  // Two taps: the first only arms it.
  if (!reset.dataset.armed) {
    reset.dataset.armed = "true";
    reset.textContent = "Tap again to erase";
    return;
  }
  save.reset();
  writeValue("learned", "");
  level = 0;
  goHome();
};
el("version").textContent = version;
syncSettings();
refreshHome();

input.onSteer = () => {
  steered = true;
  if (!gateHintShown) tutorialEl.hidden = true;
};
document.addEventListener("contextmenu", (e) => e.preventDefault());
document.addEventListener("visibilitychange", () => {
  if (document.hidden && mode === "playing") changeMode("paused");
});
window.addEventListener("blur", () => {
  if (mode === "playing" && !autopilot) changeMode("paused");
});
window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  if (e.key === "Escape" && mode === "levels" && cardLevel >= 0) return closeCard();
  if (mode === "levels" && (e.key === "ArrowLeft" || e.key === "ArrowRight")) return turnMap(e.key === "ArrowLeft" ? -1 : 1);
  if (e.key === "Escape" && ["levels", "gear", "settings", "how"].includes(mode)) {
    el(
      { levels: "levels-close", gear: "gear-close", settings: "settings-close", how: "how-close" }[
        mode as "levels" | "gear" | "settings" | "how"
      ],
    ).click();
    return;
  }
  if (["Escape", "p", "P"].includes(e.key)) {
    if (mode === "playing") {
      e.preventDefault();
      changeMode("paused");
    } else if (mode === "paused") {
      e.preventDefault();
      audio.unlock();
      changeMode("playing");
    }
  }
  if ((e.key === "Enter" || e.key === " ") && document.activeElement === document.body) {
    if (mode === "home") start("level");
    else if (mode === "finished") el("next-level").click();
  }
  // A quick restart, for the run that started badly.
  if ((e.key === "r" || e.key === "R") && (mode === "playing" || mode === "finished")) start(kind, true);
});

// ---------------------------------------------------------------- Loop

function selfSteer() {
  // Steers for the next gate (or the middle of the trail) in trail coordinates, against the line of travel.
  const target = run.course.gates[run.nextGate];
  const u = target ? gateU(target, run.time, run.gateShift) : 0;
  const along = trailDir(run.course.trail, run.s + 12);
  return Math.max(-1, Math.min(1, (u - run.u) * 0.12 + (along - run.aim) * 1.6 - (run.heading - run.aim) * 0.5));
}
if (import.meta.env.DEV)
  Object.assign(window, {
    timberline: {
      save,
      refreshHome,
      get run() {
        return run;
      },
      get scene() {
        return scene;
      },
      set autopilot(on: boolean) {
        autopilot = on;
      },
      /** Hands the skis to a stand-in player: "novice", "average", "expert", or "" to take them back. */
      set bot(skill: string) {
        botSkill = skill;
        pilot = skill in SKILLS ? createPilot(SKILLS[skill as keyof typeof SKILLS], Date.now()) : null;
        autopilot = pilot !== null;
      },
      /** Jumps straight into a level, unlocked or not. */
      play(index: number) {
        level = index;
        begin("level");
      },
    },
  });

try {
  scene = new SkiScene(canvas);
  dress();
  scene.theme = THEMES[worldOf(level)];
  scene.update(run, 0, mode, 0);
  let last = performance.now(),
    accumulator = 0;
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    if (mode === "playing") changeMode("paused");
    el("error-message").textContent =
      "The graphics session was interrupted. Tap Try again to reload the mountain. Your progress is safe.";
    el("error").hidden = false;
  });
  const frame = (now: number) => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (document.hidden) {
      requestAnimationFrame(frame);
      return;
    }
    if (mode !== "paused") elapsed += dt;
    if (mode === "playing") {
      if (hitStop > 0) hitStop -= dt;
      else accumulator += dt;
      while (accumulator >= 1 / 120 && mode === "playing" && hitStop <= 0) {
        const steer = -input.update(1 / 120);
        stepRun(run, pilot ? pilot.steer(run, 1 / 120) : autopilot ? selfSteer() : steer, 1 / 120);
        for (const f of run.fx) effect(f);
        if (run.tokenEvent >= 0) event("token");
        if (run.crates.event) event("crate");
        if (run.lifeEvent) event("life");
        if (run.event) event(run.event);
        accumulator -= 1 / 120;
      }
      updateHud();
      if (tutorial && run.s > 24 && !gateHintShown) {
        gateHintShown = true;
        tutorialEl.hidden = false;
        tutorialEl.querySelector("span")!.hidden = true;
        tutorialEl.querySelector("p")!.textContent = "Pass between the flags";
      }
      if (tutorial && run.nextGate > 0) {
        tutorialEl.hidden = true;
        if (steered) writeValue("learned", "true");
        tutorial = false;
      }
      if (elapsed > warnUntil) el("warn-left").hidden = el("warn-right").hidden = true;
      el("steering").hidden = !input.engaged;
      (el("steering").querySelector("b") as HTMLElement).style.transform =
        `translateX(${input.value * 44}px)`;
      const gap = Number.isNaN(run.avalancheS) ? Infinity : run.s - run.avalancheS;
      audio.update(run, true, Math.max(0.25, 1 - gap / 90) * (Number.isFinite(gap) ? 1 : 0));
    } else accumulator = 0;
    if (mode === "celebrating") {
      finishDelay -= dt;
      if (finishDelay <= 0) finish();
    }
    if (mode === "finished") {
      if (tally.to !== tally.from) {
        // The score counts up, ticking, and lands on the real number.
        const t = Math.max(0, Math.min(1, (elapsed - tally.start) / 0.9));
        const eased = 1 - (1 - t) ** 3;
        setText(el("result-score"), num(Math.round(tally.from + (tally.to - tally.from) * eased)));
        if (t > 0 && t < 1 && Math.floor(elapsed * 22) !== Math.floor((elapsed - dt) * 22)) audio.play("tick");
        if (t >= 1) tally.from = tally.to;
      }
      if (elapsed >= ticker.next && ticker.rows.length > 1) {
        ticker.at = (ticker.at + 1) % ticker.rows.length;
        ticker.next = elapsed + TICK_TIME;
        el("result-rows").innerHTML = ticker.rows[ticker.at];
      }
    }
    if (elapsed > bannerUntil) bannerEl.classList.remove("show");
    // The trail map covers the whole screen, so the mountain rests behind it.
    if (mode !== "levels") {
      scene.theme = run.course.endless ? endlessTheme(run.z) : THEMES[worldOf(level)];
      scene.weather = run.course.weather;
      // An endless run goes in and out of the dark: the keyline round the board follows it.
      if (run.course.endless && mode === "playing") {
        if (run.course.night) document.body.dataset.night = "";
        else delete document.body.dataset.night;
      }
      scene.update(run, dt, mode, elapsed);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
} catch (error) {
  el("error-message").textContent =
    "The game needs WebGL. Please try a current Safari or Chrome browser with graphics acceleration enabled.";
  el("error").hidden = false;
  console.error(error);
}
setupPwa(el("update-app") as HTMLButtonElement);
setupInstall(el("install-app") as HTMLButtonElement, el("install-hint"));
window.addEventListener("resize", () => {
  if (mode === "levels") renderMap(mapWorld);
});
