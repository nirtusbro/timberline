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
  type Fx,
} from "./physics";
import { LEVEL_COUNT, WORLDS, WORLD_SIZE, getCourse, worldOf, type Course, type PowerKind } from "./levels";
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
import { setupInstall, setupPwa } from "./pwa";
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
const POWER_NAMES: Record<PowerKind, [title: string, sub: string]> = {
  magnet: ["Magnet", "Coins come to you"],
  shield: ["Shield", "Takes one knock"],
  double: ["Double", "Every point ×2"],
};

const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const num = (n: number) => n.toLocaleString("en-US");
const starsRow = (earned: number) =>
  [0, 1, 2].map((i) => `<span class="i-star${i < earned ? "" : " off"}"></span>`).join("");
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
let result = { newBest: false, newStars: 0, starCoins: 0, coins: 0, unlockedWorld: -1, distanceCoins: 0 };
let starTimers: number[] = [];
/** The score shown on the results screen counts up to the real one. */
let tally = { from: 0, to: 0, start: 0 };
/** Development only: lets the skier steer himself at the next gate, to watch a run without playing it. */
let autopilot = false;

const scoreEl = el("score"),
  gatesEl = el("gate-count"),
  progressEl = el("progress-fill"),
  chaserEl = el("chaser"),
  speedEl = el("speed"),
  coinEl = el("coin-count"),
  livesEl = el("lives"),
  lifeProgressEl = el("life-progress"),
  starMeter = el("star-meter"),
  starFill = el("star-fill"),
  starTicks = [...starMeter.querySelectorAll<HTMLElement>(".tick")],
  comboBadge = el("combo-badge"),
  comboCount = el("combo-count"),
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

// ---------------------------------------------------------------- Effect chips

/** The chips under the score that show what is running and for how much longer. */
const chips = (["boost", "magnet", "shield", "double"] as const).map((key) => {
  const chip = document.createElement("div");
  chip.className = `effect ${key}`;
  chip.hidden = true;
  let icon: string;
  if (key === "boost")
    icon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 17l7-6 7 6M5 11l7-6 7 6"/></svg>`;
  else {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    paintPowerIcon(c.getContext("2d")!, key, 64);
    icon = `<img alt="" src="${c.toDataURL()}" />`;
  }
  chip.innerHTML = `${icon}<span><i></i></span>`;
  effectsEl.append(chip);
  return { key, chip, bar: chip.querySelector("i") as HTMLElement };
});

// ---------------------------------------------------------------- Home

function refreshHome() {
  const course = getCourse(level),
    world = worldOf(level);
  el("home-stars").textContent = num(save.totalStars);
  el("home-coins").textContent = num(save.coins);
  el("play-grade").className = `grade g${world}`;
  el("play-eyebrow").textContent = `${WORLDS[world].name} · ${level + 1}`;
  el("play-name").textContent = course.name;
  el("play-stars").innerHTML = starsRow(save.stars[level]);
  el("play-label").textContent = save.stars[level] ? "Again" : "Ski";
  el("tile-levels").textContent = `${save.stars.filter(Boolean).length} / ${LEVEL_COUNT}`;
  el("tile-endless").textContent = save.endlessBest ? `Best ${num(save.endlessBest)}` : "3 lives";
  const today = save.dailyOn();
  el("tile-daily").textContent = today.runs ? `Best ${num(today.best)}` : "New today";
  el("tile-gear").textContent = `${save.owned.size} / ${OUTFITS.length + SKIS.length}`;
}
function selectLevel(next: number) {
  if (!save.isUnlocked(next)) return false;
  level = next;
  kind = "level";
  run = createRun(level);
  refreshHome();
  return true;
}

// ---------------------------------------------------------------- Trail map

/** What a level is made of, as a few words for its card. */
function levelTags(course: Course) {
  const tags: string[] = [];
  const has = (k: string) => course.movers.some((m) => m.kind === k);
  if (course.twist === "rival") tags.push("Race the fox");
  if (course.twist === "avalanche") tags.push("Avalanche");
  if (course.twist === "goldrush") tags.push("Gold rush");
  if (has("skier")) tags.push("Learners");
  if (has("deer")) tags.push("Deer");
  if (has("snowcat")) tags.push("Snowcats");
  if (course.zones.some((z) => z.kind === "ramp")) tags.push("Jumps");
  if (course.zones.some((z) => z.kind === "ice")) tags.push("Ice");
  if (course.slopes.length) tags.push("Banked snow");
  for (const kind of ["shield", "magnet", "double"] as const)
    if (course.powers.some((p) => p.kind === kind)) tags.push(POWER_NAMES[kind][0]);
  if (course.weather !== "clear") tags.push({ snow: "Snowfall", fog: "Fog", blizzard: "Blizzard" }[course.weather]);
  if (course.timeBonusRate > 100) tags.push("Time attack");
  return tags;
}
/** The mark a special level wears on the map. */
const twistMark = (course: Course) =>
  course.twist === "rival"
    ? "Race"
    : course.twist === "avalanche"
      ? "Avalanche"
      : course.twist === "goldrush"
        ? "Gold rush"
        : "";
const ROW = 74;
function renderLevels() {
  const next = save.nextLevel();
  el("levels-stars").textContent = `${save.totalStars} / ${LEVEL_COUNT * 3}`;
  el("worlds").innerHTML = WORLDS.map((world, w) => {
    const open = save.worldUnlocked(w);
    // The piste winds down the mountain: level 1 at the top, 10 at the foot.
    const xs = Array.from({ length: WORLD_SIZE }, (_, i) => 50 + 27 * Math.sin(i * 1.05 + w * 1.3));
    const path = xs
      .map((x, i) => {
        const y = i * ROW + ROW / 2;
        if (i === 0) return `M${x} ${y}`;
        const py = (i - 1) * ROW + ROW / 2;
        return `C${xs[i - 1]} ${py + ROW * 0.55} ${x} ${y - ROW * 0.55} ${x} ${y}`;
      })
      .join(" ");
    const nodes = xs
      .map((x, i) => {
        const index = w * WORLD_SIZE + i,
          unlocked = save.isUnlocked(index),
          course = getCourse(index),
          mark = twistMark(course);
        const side = x > 50 ? "left" : "right";
        return `<button class="node ${side}${index === next && unlocked ? " next" : ""}${save.stars[index] ? " done" : ""}${mark ? " special" : ""}" style="left:${x}%;top:${i * ROW + ROW / 2}px" data-level="${index}" ${unlocked ? "" : "disabled"} aria-label="Level ${index + 1}, ${course.name}${unlocked ? `, ${save.stars[index]} of 3 stars` : ", locked"}">
          <b>${index + 1}</b>
          <span class="node-label"><strong>${course.name}</strong>${mark ? `<em>${mark}</em>` : ""}<span class="stars-row">${starsRow(save.stars[index])}</span></span>
        </button>`;
      })
      .join("");
    const lock = open
      ? ""
      : `<p class="world-lock">Opens at <b>${world.starsToUnlock} stars</b> · ${world.starsToUnlock - save.totalStars} to go</p>`;
    return `<section class="world w${w}${open ? "" : " locked"}">
      <div class="world-head"><i class="grade g${w}"></i><div><h3>${world.name}</h3><p>${world.blurb}</p></div>
      <span class="world-stars"><span class="i-star"></span>${save.worldStars(w)}<small>/${WORLD_SIZE * 3}</small></span></div>
      ${lock}<div class="trail" style="height:${WORLD_SIZE * ROW}px">
        <svg viewBox="0 0 100 ${WORLD_SIZE * ROW}" preserveAspectRatio="none" aria-hidden="true"><path class="trail-edge" d="${path}"/><path class="trail-snow" d="${path}"/></svg>
        ${nodes}</div></section>`;
  }).join("");
  closeCard();
}
function openCard(index: number) {
  const course = getCourse(index),
    w = worldOf(index);
  cardLevel = index;
  el("card-grade").className = `grade g${w}`;
  el("card-eyebrow").textContent = `${WORLDS[w].name} · Level ${index + 1}`;
  el("card-name").textContent = course.name;
  el("card-hint").textContent = course.hint;
  el("card-tags").innerHTML = levelTags(course)
    .map((t) => `<span>${t}</span>`)
    .join("");
  el("card-stars").innerHTML = starsRow(save.stars[index]);
  el("card-best").textContent = save.best[index]
    ? `Best ${num(save.best[index])} · ★★★ at ${num(course.starScores[2])}`
    : `★ at ${num(course.starScores[0])} · ★★★ at ${num(course.starScores[2])}`;
  el("card-play").textContent = save.stars[index] ? "Ski again" : "Ski";
  const card = el("level-card");
  card.hidden = false;
  replay(card, "in");
  for (const node of el("worlds").querySelectorAll(".node"))
    node.classList.toggle("picked", Number((node as HTMLElement).dataset.level) === index);
}
function closeCard() {
  cardLevel = -1;
  el("level-card").hidden = true;
  for (const node of el("worlds").querySelectorAll(".node.picked")) node.classList.remove("picked");
}
el("worlds").addEventListener("click", (e) => {
  const cell = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-level]");
  if (!cell || cell.disabled) return;
  audio.unlock();
  audio.play("tap");
  openCard(Number(cell.dataset.level));
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
function renderGear() {
  const items: (Outfit | Skis)[] = gearTab === "outfits" ? OUTFITS : SKIS;
  el("gear-coins").textContent = num(save.coins);
  el("tab-outfits").setAttribute("aria-selected", String(gearTab === "outfits"));
  el("tab-skis").setAttribute("aria-selected", String(gearTab === "skis"));
  el("gear-grid").innerHTML = items
    .map((item) => {
      const owned = save.owned.has(item.id),
        worn = wornIn(gearTab) === item.id;
      const swatch =
        "suit" in item
          ? `<span class="swatch" style="--a:${item.suit};--b:${item.trim};--c:${item.scarf}"></span>`
          : `<span class="swatch ski" style="--a:${item.top};--b:${item.base}"></span>`;
      const state = worn
        ? "Wearing"
        : owned
          ? "Owned"
          : `<span class="i-coin"></span>${num(item.price)}`;
      return `<button class="gear-item${item.id === gearSelected ? " selected" : ""}${worn ? " worn" : ""}" data-gear="${item.id}">${swatch}<strong>${item.name}</strong><small>${state}</small></button>`;
    })
    .join("");
  const item = gearItem(gearSelected)!,
    action = el<HTMLButtonElement>("gear-action");
  const owned = save.owned.has(item.id);
  action.disabled = wornIn(gearTab) === item.id || (!owned && save.coins < item.price);
  action.textContent =
    wornIn(gearTab) === item.id
      ? "Wearing"
      : owned
        ? `Wear ${item.name}`
        : save.coins >= item.price
          ? `Buy ${item.name} · ${num(item.price)}`
          : `${num(item.price - save.coins)} more coins needed`;
  dress();
}
function openGearTab(tab: typeof gearTab) {
  gearTab = tab;
  gearSelected = wornIn(tab);
  renderGear();
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
      show = SCREENS[next] === id;
    if (show && screen.hidden) screen.scrollTop = 0;
    screen.hidden = !show;
  }
  document.body.dataset.mode = next;
  el("pause").hidden = next !== "playing";
  dress();
  audio.update(run, next === "playing", 0);
}
/** Sweeps a sheet of snow across the screen and changes what is behind it while it is covered. */
let wiping = 0;
function wipe(change: () => void) {
  if (reducedMotion) return change();
  clearTimeout(wiping);
  replay(el("wipe"), "go");
  wiping = window.setTimeout(change, 190);
}
function goHome() {
  for (const timer of starTimers) clearTimeout(timer);
  kind = "level";
  if (!save.isUnlocked(level)) level = save.nextLevel();
  run = createRun(level);
  refreshHome();
  scene?.reset();
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
function updateHud() {
  const course = run.course,
    endless = course.endless === true;
  setText(scoreEl, num(run.score));
  setText(coinEl, String(run.coins));
  setText(speedEl.firstChild as unknown as HTMLElement, `${Math.round(run.speed * 3.6)} `);
  // The combo badge grows with the chain and shatters when it breaks.
  if (run.combo !== comboShown) {
    if (run.combo >= 2) {
      comboBadge.hidden = false;
      comboBadge.classList.remove("lost");
      comboBadge.classList.toggle("max", run.combo === COMBO_CAP);
      setText(comboCount, `×${run.combo}`);
      replay(comboBadge, "bump");
    } else if (comboShown >= 2) {
      comboBadge.classList.remove("bump");
      replay(comboBadge, "lost");
    } else comboBadge.hidden = true;
    comboShown = run.combo;
  }
  const left: Record<string, number> = {
    boost: run.boost / BOOST_TIME,
    magnet: run.magnet / MAGNET_TIME,
    shield: run.shield ? 1 : 0,
    double: run.double / DOUBLE_TIME,
  };
  for (const { key, chip, bar } of chips) {
    const on = left[key] > 0;
    if (chip.hidden === on) chip.hidden = !on;
    if (on) bar.style.transform = `scaleX(${Math.min(1, left[key]).toFixed(3)})`;
  }
  if (endless) {
    // Lives drain on a miss or a tumble and every ten crates add one, with no
    // cap. Up to the starting three, lost hearts show hollow; past a handful
    // they collapse to one heart and a count.
    const lives = Math.max(0, run.lives);
    const html =
      lives > MAX_HEART_ICONS
        ? `<span>♥</span><span class="life-count">×${lives}</span>`
        : Array.from(
            { length: Math.max(lives, ENDLESS_LIVES) },
            (_, i) => `<span${i < lives ? "" : ' class="lost"'}>♥</span>`,
          ).join("");
    if (html !== hearts) livesEl.innerHTML = hearts = html;
    setText(lifeProgressEl, `Crates ${run.cratesTowardLife} / ${CRATES_PER_LIFE}`);
    setText(gatesEl, `${num(Math.floor(run.z))} m`);
    progressEl.style.width = `${((run.z % 1000) / 1000) * 100}%`;
  } else {
    const scores = course.starScores;
    starFill.style.width = `${Math.min(1, run.score / scores[2]) * 100}%`;
    starTicks.forEach((tick, i) => tick.classList.toggle("on", run.score >= scores[i]));
    setText(gatesEl, `${run.hits} / ${course.gates.length}`);
    progressEl.style.width = `${(run.z / course.finishZ) * 100}%`;
  }
  // A race or an avalanche: the other party rides the progress bar, and a line says how it stands.
  if (run.rival) {
    const gap = Math.round(run.rival.z - run.z);
    chaserEl.style.left = `${Math.min(100, (run.rival.z / course.finishZ) * 100)}%`;
    setText(twistEl, run.rival.done ? "Rusty has finished" : gap > 1 ? `Rusty leads by ${gap} m` : gap < -1 ? `You lead by ${-gap} m` : "Neck and neck");
    twistEl.classList.toggle("danger", gap > 1);
  } else if (!Number.isNaN(run.avalancheZ)) {
    const gap = Math.max(0, Math.round(run.z - run.avalancheZ));
    chaserEl.style.left = `${Math.max(0, (run.avalancheZ / course.finishZ) * 100)}%`;
    setText(twistEl, `Avalanche ${gap} m behind`);
    twistEl.classList.toggle("danger", gap < 28);
    vignette.style.opacity = String(Math.min(1, Math.max(0, 1 - (gap - 8) / 50) * 1.15));
  }
}
/** A line of news under the top of the HUD: a level's name, a power-up, a warning. */
function banner(title: string, sub = "", tone = "", time = 1.6) {
  setText(el("banner-title"), title);
  setText(el("banner-sub"), sub);
  bannerEl.className = `banner show ${tone}`;
  bannerUntil = elapsed + time;
}
/** A number or a word that pops out of the skier and floats away. */
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

function start(next: RunKind = kind) {
  if (!scene) return;
  audio.unlock();
  wipe(() => begin(next));
}
function begin(next: RunKind) {
  for (const timer of starTimers) clearTimeout(timer);
  kind = next;
  const endless = kind !== "level";
  run =
    kind === "level"
      ? createRun(level)
      : createEndlessRun(kind === "daily" ? dailySeed() : undefined);
  const course = run.course;
  el("run-label").textContent =
    kind === "level" ? `Level ${level + 1}` : kind === "daily" ? "Daily" : "Endless";
  starMeter.hidden = endless;
  livesEl.hidden = lifeProgressEl.hidden = !endless;
  hearts = "";
  comboShown = 0;
  comboBadge.hidden = true;
  if (!endless) layoutStarMeter();
  chaserEl.hidden = !course.twist || course.twist === "goldrush";
  chaserEl.className = `chaser ${course.twist}`;
  twistEl.hidden = chaserEl.hidden;
  twistEl.textContent = "";
  vignette.style.opacity = "0";
  popupsEl.textContent = "";
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
    kind === "level" ? course.name : kind === "daily" ? `Daily run · ${prettyDay()}` : "Endless run",
    kind === "level"
      ? course.hint
      : kind === "daily"
        ? "The same course for everyone today. Three lives; ten crates win one back."
        : "Slow and easy at first, harder every metre. Three lives; ten crates win one back.",
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
    juice.burst(run.x, y + 1 + run.y, run.z + 0.5, "#ffd23c", 5, 3.5, run.speed * 0.5);
    replay(coinEl.parentElement!, "bump");
  } else if (f.kind === "power" && f.power) {
    audio.play("power");
    buzz([15, 30, 25]);
    banner(...POWER_NAMES[f.power], f.power, 1.5);
    juice.burst(run.x, y + 1.4, run.z, POWER_COLORS[f.power], 26, 7, run.speed * 0.6);
    juice.ring(run.x, y, run.z, POWER_COLORS[f.power], 1.2);
  } else if (f.kind === "shield") {
    audio.play("shield");
    buzz([40, 30, 40]);
    popup("Shield!", "shield", "Saved");
    juice.burst(run.x, y + 1.2, run.z, POWER_COLORS.shield, 40, 9, run.speed * 0.5);
    juice.ring(run.x, y, run.z, POWER_COLORS.shield, 1.6);
    juice.shake = 0.5;
  } else if (f.kind === "close") {
    audio.play("whoosh");
    buzz(10);
    popup("Close call", "close", `+${f.value}`);
  } else if (f.kind === "launch") {
    audio.play("launch");
    buzz(12);
    juice.burst(run.x, y + 1, run.z, "#ffffff", 16, 5, run.speed * 0.5);
  } else if (f.kind === "land") {
    audio.play("land");
    buzz(25);
    popup(`+${f.value}`, "air", "Air");
    juice.ring(run.x, y, run.z, "#ffffff", 1.3);
    juice.burst(run.x, y + 0.3, run.z, "#ffffff", 22, 6, run.speed * 0.4);
    juice.shake = Math.max(juice.shake, 0.3);
  } else if (f.kind === "wake" && f.mover === "deer") {
    audio.play("deer");
    const side = f.x < 0 ? "warn-left" : "warn-right";
    el(side).hidden = false;
    replay(el(side), "flash");
    warnUntil = elapsed + 1.2;
  } else if (f.kind === "wake" && f.mover === "snowcat") audio.play("beacon");
  else if (f.kind === "bump") juice.burst(f.x, y + 1, f.z, "#ffffff", 30, 8, 4);
  else if (f.kind === "rival-finish" && !run.finished) banner("Rusty got there first", "Finish anyway: the points still count", "miss", 2);
}
function event(name: string) {
  const endless = run.course.endless === true;
  const juice = scene.juice;
  const ground = surfaceHeight(run.course, run.x, run.z);
  if (name === "finish") {
    tutorialEl.hidden = true;
    finishDelay = run.caught ? 1.9 : 1.5;
    vignette.style.opacity = run.caught ? "1" : "0";
    if (endless) {
      audio.play("over");
      result = {
        newStars: 0,
        starCoins: 0,
        unlockedWorld: -1,
        ...save.completeEndless(run.score, run.z, run.coins, kind === "daily"),
      };
      changeMode("celebrating");
      banner("Run over", `${num(Math.floor(run.z))} m`, "miss", 1.6);
      return;
    }
    audio.play(run.caught ? "buried" : run.passed ? "finish" : "over");
    result = { distanceCoins: 0, ...save.complete(level, run.score, run.stars, run.coins) };
    changeMode("celebrating");
    if (run.caught) {
      banner("Buried!", "The avalanche caught you", "miss", 2);
      juice.shake = 1.2;
    } else if (run.passed) {
      banner("Finish!", run.rivalBeaten ? `You beat Rusty · +${num(RIVAL_POINTS)}` : "", "gold", 1.6);
      for (const x of [-9, -3, 3, 9])
        juice.burst(x, ground + 2, run.z + 4, ["#ffd23c", "#ff5a3c", "#27c4f5", "#ffffff"][(x + 9) / 6], 26, 10, 3);
    } else banner(run.score > run.course.starScores[0] * 0.7 ? "So close!" : "Finished", "Not enough for a star", "miss", 1.6);
    buzz(run.passed ? [30, 60, 30] : 40);
    return;
  }
  if (name === "token") {
    audio.play("token");
    buzz(15);
    popup(`+${TOKEN_COINS}`, "gold", "Gold");
    juice.burst(run.x, ground + 1.3, run.z, "#ffc531", 24, 7, run.speed * 0.5);
  } else if (name === "crate") {
    audio.play("crate");
    buzz(15);
    popup("Crate!", "gold", `+${CRATE_COINS} coins`);
    juice.burst(run.x, ground + 1, run.z, "#c98f55", 22, 7, run.speed * 0.5);
  } else if (name === "life") {
    audio.play("life");
    buzz([20, 40, 20]);
    banner(`Extra life · ♥ ${run.lives}`, `${CRATES_PER_LIFE} crates caught`, "gold", 1.6);
    livesEl.classList.remove("hit");
  } else if (name === "gate") {
    const bullseye = run.gateBonus > 0;
    if (bannerEl.classList.contains("intro")) bannerUntil = 0;
    audio.play(bullseye ? "bullseye" : "gate", run.combo);
    buzz(bullseye ? [12, 30, 12] : 8);
    popup(`+${num(run.gateGain)}`, bullseye ? "bullseye" : "", bullseye ? "Bullseye" : "");
    const gate = run.course.gates[run.nextGate - 1];
    const hue = gate.color === "red" ? "#ff5a5a" : "#4aa8ff";
    juice.ring(run.x, ground, gate.z, bullseye ? "#ffd23c" : hue, bullseye ? 1.3 : 0.9);
    for (const side of [-1, 1])
      juice.burst(gate.x + (side * gate.width) / 2, ground + 2, gate.z, hue, bullseye ? 10 : 5, 4, run.speed * 0.3);
    if (bullseye) juice.burst(run.x, ground + 0.5, gate.z, "#ffd23c", 18, 6, run.speed * 0.6);
  } else if (name === "miss" || name === "crash") {
    audio.play(name);
    buzz(name === "crash" ? [70, 40, 70] : 35);
    const lives = endless ? `${Math.max(0, run.lives)} ♥ left` : "";
    if (name === "crash") {
      popup(`−${CRASH_PENALTY}`, "miss", "Wipeout");
      juice.shake = 0.9;
      juice.burst(run.x, ground + 0.8, run.z, "#ffffff", 46, 9, 5);
      hitStop = HIT_STOP;
      replay(document.body, "jolt");
    } else popup("Missed", "miss", lives || "Combo lost");
    if (endless) {
      // Flash the lives so a lost heart is impossible to miss.
      replay(livesEl, "hit");
    }
  }
}

// ---------------------------------------------------------------- Results

const row = (label: string, value: string, tone = "") =>
  `<div class="${tone}"><dt>${label}</dt><dd>${value}</dd></div>`;
const plus = (n: number) => `+${num(n)}`;
function finish() {
  const course = run.course,
    endless = course.endless === true,
    p = run.points;
  const rows: string[] = [];
  rows.push(
    endless
      ? row("Gates", `${run.hits} hit · ${run.misses} missed`)
      : row(`Gates ${run.hits}/${course.gates.length}`, plus(p.gates)),
  );
  if (run.bullseyes) rows.push(row(`Bullseyes ×${run.bullseyes}`, plus(p.bullseyes)));
  if (run.bestCombo > 1) rows.push(row("Best combo", `×${run.bestCombo}`));
  if (run.coinCount) rows.push(row(`Coins ×${run.coinCount}`, plus(p.coins)));
  if (run.jumps) rows.push(row(`Jumps ×${run.jumps}`, plus(p.air)));
  if (run.closeCalls) rows.push(row(`Close calls ×${run.closeCalls}`, plus(p.close)));
  if (run.crates.collected) rows.push(row(`Crates ×${run.crates.collected}`, plus(p.crates)));
  if (p.double) rows.push(row("Double bonus", plus(p.double), "double"));
  if (course.twist === "rival")
    rows.push(row(run.rivalBeaten ? "Beat Rusty" : "Rusty won", run.rivalBeaten ? plus(p.twist) : "+0", run.rivalBeaten ? "gold" : "bad"));
  if (course.twist === "avalanche" && !run.caught) rows.push(row("Lead on the avalanche", plus(p.twist), "gold"));
  if (!endless && !run.caught) rows.push(row(`Time ${formatTime(run.time)}`, plus(run.timeBonus)));
  if (endless) rows.push(row("Time", formatTime(run.time)));
  if (run.crashes) rows.push(row(`Tumbles ×${run.crashes}`, `−${num(run.crashes * CRASH_PENALTY)}`, "bad"));
  el("result-rows").innerHTML = rows.join("");
  [...el("result-rows").children].forEach((r, i) => (r as HTMLElement).style.setProperty("--i", String(i)));
  const starsEl = el("result-stars");
  starsEl.hidden = endless;
  el("new-best").hidden = !result.newBest;
  tally = { from: 0, to: run.score, start: elapsed + 0.2 };
  el("result-score").textContent = "0";
  el("result-coins").textContent = `+${num(result.coins)}`;
  const unlock = el("result-unlock");
  unlock.hidden = result.unlockedWorld < 0;
  if (result.unlockedWorld >= 0)
    unlock.textContent = `New mountain open: ${WORLDS[result.unlockedWorld].name}!`;
  const nextButton = el("next-level"),
    retry = el("retry"),
    dialog = el("finish-screen").querySelector<HTMLElement>(".dialog")!;
  dialog.classList.toggle("failed", !endless && !run.passed);
  if (endless) {
    const daily = kind === "daily",
      record = daily ? save.dailyOn() : { best: save.endlessBest, distance: save.endlessDistance };
    el("finish-kicker").textContent = daily ? `Daily run · ${prettyDay()}` : "Endless run";
    el("result-title").textContent = `${num(Math.floor(run.z))} metres`;
    el("result-best").textContent =
      `${daily ? "Today’s best" : "Best"} ${num(record.best)} · longest ${num(record.distance)} m`;
    el("result-goal").textContent = "";
    el("result-coins-detail").textContent = result.distanceCoins
      ? `incl. ${result.distanceCoins} for distance`
      : "";
    nextButton.hidden = true;
    retry.className = "primary";
    retry.textContent = "Ski again";
  } else {
    const scores = course.starScores,
      next = level + 1;
    el("finish-kicker").textContent = `Level ${level + 1} · ${course.name}`;
    // The verdict answers to how the run went, not only to the stars.
    const clean = run.misses === 0 && run.crashes === 0;
    el("result-title").textContent = run.caught
      ? "Buried."
      : run.stars === 0
        ? course.starScores[0] - run.score > course.starScores[0] * 0.3
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
              : "Level cleared.";
    [...starsEl.children].forEach((star, i) => {
      // Re-adding the class replays the pop-in for each star earned.
      star.classList.remove("earned");
      (star as HTMLElement).style.setProperty("--i", String(i));
      void (star as HTMLElement).offsetWidth;
      star.classList.toggle("earned", i < run.stars);
    });
    starTimers = Array.from({ length: run.stars }, (_, i) =>
      window.setTimeout(
        () => {
          if (mode !== "finished") return;
          audio.play("star", i + 1);
          buzz(14);
        },
        350 + i * 300,
      ),
    );
    el("result-best").textContent = `Best ${num(save.best[level])}`;
    const goal = el("result-goal");
    if (run.caught)
      goal.textContent = "Bullseyes fire a carve boost and tumbles cost seconds: thread the gates and stay on your feet.";
    else if (run.stars < 3) {
      const short = scores[run.stars] - run.score;
      goal.textContent =
        run.stars === 0
          ? `${num(short)} more points for the first star. ${run.misses ? `${run.misses} missed gate${run.misses > 1 ? "s" : ""} broke the combo.` : "Bullseyes and coins all count."}`
          : `${num(short)} more for ${run.stars + 1} stars.${run.misses ? ` You missed ${run.misses} gate${run.misses > 1 ? "s" : ""}.` : ""}`;
    } else goal.textContent = next >= LEVEL_COUNT ? "Every star on the last level. The mountain is yours." : "";
    const canAdvance = run.passed && next < LEVEL_COUNT && save.isUnlocked(next);
    if (run.passed && next < LEVEL_COUNT && !canAdvance) {
      const world = WORLDS[worldOf(next)];
      goal.textContent = `${world.name} opens at ${world.starsToUnlock} stars. You have ${save.totalStars}: replay levels for more.`;
    }
    el("result-coins-detail").textContent = result.starCoins
      ? `incl. ${result.starCoins} for ${result.newStars} new star${result.newStars === 1 ? "" : "s"}`
      : "";
    nextButton.hidden = !canAdvance;
    retry.className = canAdvance ? "secondary" : "primary";
    retry.textContent = run.passed ? "Again" : "Try again";
  }
  vignette.style.opacity = "0";
  changeMode("finished");
}

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
el("retry").onclick = el("restart").onclick = () => start();
el("next-level").onclick = () => {
  if (selectLevel(level + 1)) start("level");
};
el("pause").onclick = () => changeMode("paused");
el("resume").onclick = () => {
  audio.unlock();
  changeMode("playing");
};
const toMap = () => {
  goHome();
  renderLevels();
  changeMode("levels");
  // Bring the next level into view.
  el("worlds").querySelector(".node.next")?.scrollIntoView({ block: "center" });
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
press("how-close", () => changeMode("settings"));

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
    reset.textContent = "Tap again to erase stars, coins and gear";
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
    else if (mode === "finished") (el("next-level").hidden ? el("retry") : el("next-level")).click();
  }
  // A quick restart, for the run that started badly.
  if ((e.key === "r" || e.key === "R") && (mode === "playing" || mode === "finished")) start();
});

// ---------------------------------------------------------------- Loop

function selfSteer() {
  const target = run.course.gates[run.nextGate] ?? { x: 0 };
  return Math.max(-1, Math.min(1, (target.x - run.x) * 0.18 - run.heading * 0.8));
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
        stepRun(run, autopilot ? selfSteer() : steer, 1 / 120);
        for (const f of run.fx) effect(f);
        if (run.tokenEvent >= 0) event("token");
        if (run.crates.event) event("crate");
        if (run.lifeEvent) event("life");
        if (run.event) event(run.event);
        accumulator -= 1 / 120;
      }
      updateHud();
      if (tutorial && run.z > 24 && !gateHintShown) {
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
      const gap = Number.isNaN(run.avalancheZ) ? Infinity : run.z - run.avalancheZ;
      audio.update(run, true, Math.max(0.25, 1 - gap / 90) * (Number.isFinite(gap) ? 1 : 0));
    } else accumulator = 0;
    if (mode === "celebrating") {
      finishDelay -= dt;
      if (finishDelay <= 0) finish();
    }
    if (mode === "finished" && tally.to !== tally.from) {
      // The score counts up, ticking, and lands on the real number.
      const t = Math.max(0, Math.min(1, (elapsed - tally.start) / 0.9));
      const eased = 1 - (1 - t) ** 3;
      setText(el("result-score"), num(Math.round(tally.from + (tally.to - tally.from) * eased)));
      if (t > 0 && t < 1 && Math.floor(elapsed * 22) !== Math.floor((elapsed - dt) * 22)) audio.play("tick");
      if (t >= 1) tally.from = tally.to;
    }
    if (elapsed > bannerUntil) bannerEl.classList.remove("show");
    // The trail map covers the whole screen, so the mountain rests behind it.
    if (mode !== "levels") {
      scene.theme = run.course.endless ? endlessTheme(run.z) : THEMES[worldOf(level)];
      scene.weather = run.course.weather;
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
