# Timberline — Downhill slalom

A mobile-first slalom skiing game built with Three.js, TypeScript and Vite. Timber the wolf carves down forty hand-placed courses on four mountains, each in its own light and with its own company on the slope (learners, deer, snowcats, a rival fox, an avalanche), plus an endless run and a daily course. Everything on screen is modeled procedurally, audio is synthesized, fonts are bundled, and there is no backend: progress lives in the browser, and the game installs to the home screen and plays offline.

## Run

Requires Node.js 22.12+.

```sh
npm install
npm run dev      # then open the printed URL; use the Network URL to play on a phone
npm test         # physics, level design, save data and full-course regression checks
npm run build    # type-check + production build into dist/
npm run preview
```

Deploy `dist/` to any static HTTPS host (asset paths are relative, so a subdirectory works). `.github/workflows/deploy.yml` tests, builds and publishes to GitHub Pages on every push to `main`.

## The game

- **Steering.** Drag left and right anywhere on the lower three quarters of the screen; releasing straightens gradually. Sharp turns cost speed. Settings has three steering sensitivities. On a keyboard: A / D or the arrow keys, Esc or P to pause.
- **Gates.** Pass between each pair of flags for 100 points times the combo, which grows with every gate in a row up to ×8. Crossing within a metre of the middle is a **bullseye**: +50 points, a coin and a **carve boost**, a burst of speed that fades over two seconds. Chained bullseyes keep it lit, which is how a race is won and an avalanche outrun. A missed gate or a tumble resets the combo; a tumble also costs 300 points.
- **Stars.** Every level has three star scores, shown as ticks on the meter under the score. One star clears the level and opens the next. The bar rises through the game: roughly 30 / 60 / 90% of the maximum gate score on level 1 and 45 / 75 / 97% on level 40, so one star forgives a few missed gates and three want a clean run. Finishing under par adds a time bonus. Coins (+10), jumps (+100) and close calls (+50) add a little on top; a level with a ×2 on it asks for about a third of what the ×2 can add.
- **Mountains.** Forty levels in four mountains of ten. Levels within a mountain open one after another; a mountain opens when enough stars have been earned anywhere.

  | # | Mountain | Opens at | Light | Idea |
  | - | -------- | -------- | ----- | ---- |
  | 1 | Sunrise Glades | 0 ★ | Clear morning | The resort: coin trails, learners to overtake, jumps, the first race against the fox, a gold rush |
  | 2 | Golden Ridge | 12 ★ | Golden afternoon | Wildlife and ice: deer crossings, ice sheets, the ×2, and an avalanche off the summit |
  | 3 | Granite Dusk | 30 ★ | Dusk | The working mountain: snowcats grooming across the run, fog, snowfall and a blizzard, rock in every stretch |
  | 4 | North Face | 50 ★ | Night under the aurora | Shaped snow (cambers, dishes, crowns, rollers, steps) that drags the skier sideways, and the whole face coming down behind the last level |

- **The cast.** Each level has a headline, set out in `src/cast.ts` and shown on its card on the trail map. New things arrive one at a time, and each mountain takes the steering away in one way only (jumps, then ice, then poor light, then banks).
  - *Coins* trail down the racing line and out to the gold. *Ramps* sit before a rock on the line: hit one straight to fly the rock and take the coins hung in the air, or go round.
  - *Ice* dulls the steering to a third: set the line before the blue.
  - *Learners* wobble down beside the racing line; *deer* trot out, stop to stare, then bolt across (a hoofprint trail, two signs, a warning at the edge of the screen and a whistle mark the crossing); *snowcats* crawl across a corduroy band under a flashing beacon. Every one is placed so that a skier who holds the racing line passes untouched, and skimming one pays a close call.
  - *Power-ups* float on the line: **Magnet** (9 s, pulls coins in from 7 m), **Shield** (takes one knock, combo kept) and **×2** (8 s, every point doubled). Supply crates hold them too, once a level has introduced each.
  - *Rusty the fox* races once on each mountain. He takes a head start, eases off when far ahead and digs in once passed; beating him to the line pays 1,000.
  - *The avalanche* ends the second mountain and the game. It keeps within sixty metres however fast the run, its shadow creeps down the piste as it closes, and it buries a skier it reaches. Lead at the line converts to score.

- **Gold tokens.** On the first two mountains four gold tokens sit wide of the racing line, most with a rock on the line beside them: go wide for the gold or cut inside. Each is worth 5 coins and no points, so the best score never depends on them.
- **Supply crates.** Every 9–14 seconds a crate parachutes onto the slope ahead, marked by a gold ring. Ski through it once it has landed for +200 points, 5 coins and, on later levels, a power-up. Drops are fixed per level and land clear of flags, rocks and trees.
- **Endless run.** A course generated ahead of the skier that starts slow and wide and hardens over three kilometres while the day turns from morning to night and round again, with coin trails, learners and power-ups in the crates. Three lives; every miss or tumble costs one and every ten crates win one back. A coin for every 100 metres.
- **Daily run.** The endless rules on a course seeded from the date: the same for everyone that day, with its own record that starts fresh each morning.
- **Gear.** Coins buy outfits and skis for the wolf. Gear is cosmetic only. Each star pays coins the first time it is earned (10 on the first mountain, 25 on the last).
- **Settings.** Sound, vibration, steering sensitivity, how to play, and a two-tap progress reset.

## Structure

| File | Responsibility |
| ---- | -------------- |
| `src/levels.ts` | The four mountains, forty authored gate layouts, star scores and the course builder |
| `src/cast.ts` | What lives on each layout: coins, ramps, ice, power-ups, movers, weather and special rules |
| `src/extras.ts` | Placement rules and constants for everything in the cast |
| `src/movers.ts` | How learners, deer and snowcats move: pure functions of the time since each woke |
| `src/physics.ts` | Renderer-independent movement, banked-snow sideslip, jumps, power-ups, the fox and the avalanche, collisions, scoring, coins and stars |
| `src/endless.ts` | The endless and daily course generator |
| `src/crates.ts` | Supply-crate drops, landing and pickup |
| `src/save.ts` | Stars, best scores, coins, gear owned and worn, endless and daily records |
| `src/gear.ts` | The catalogue of outfits and skis |
| `src/themes.ts` | The light of each mountain and the day cycle of the endless run |
| `src/scene.ts` | Renderer, camera, gates and lighting |
| `src/environment.ts` | Forest, fences, cabins, chairlift, peaks, stars and aurora, recycled as the skier descends |
| `src/piste.ts` | The piste as terrain shaped to the course |
| `src/pickups.ts` | Gold tokens and parachuting crates |
| `src/props.ts` | Coins, power-ups, ice, ramps, the movers and the marks that warn of them |
| `src/juice.ts` | Sparks, landing rings, snowfall, speed streaks, piste poles, power-up glows and the avalanche |
| `src/character.ts` | The articulated wolf and his recolourable outfit |
| `src/hazards.ts`, `src/effects.ts` | Pooled rocks and trees; ski tracks and snow spray |
| `src/audio.ts`, `src/input.ts` | Synthesized sound; pointer and keyboard steering |
| `src/main.ts` | Fixed-step loop, screens, trail map, HUD and results |

The simulation runs at 120 fixed steps a second independently of rendering. Rendering caps the pixel ratio at 1.75, uses no shadow maps, pools every repeated object and culls scenery chunks behind and ahead of the skier.

## Tests

`npm test` drives every level with a relaxed steering controller that ignores everything that moves, and requires it to hit every gate and token without a tumble, keep a margin inside every flag, and earn three stars; an un-steered line must earn none. A second suite covers the cast: one new thing at a time, no two neighbouring levels alike, coins, each power-up, the carve boost, ice, jumps, close calls, each mover's behaviour, a fox that a clean run beats and a sloppy one loses to, and an avalanche that a clean run escapes and a clumsy one does not. Further suites cover the steering model at 30 and 120 Hz, gate and bullseye scoring, crates, tokens, hazard placement, the north-face snow shapes and their design variety, the endless generator, the save file (unlocks, coins, gear, daily records, damaged data) and thumb input.

In development builds `window.timberline` exposes the save, an `autopilot` switch and `play(n)` to jump into any level, handy for watching one without playing it. R restarts a run.

To regenerate the home-screen icons after replacing `art/icon-master.png`, run `npm run icons`.

The bundled Nunito typeface is distributed under the SIL Open Font License.
