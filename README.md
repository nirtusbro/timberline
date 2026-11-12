# Timberline — Downhill slalom

A mobile-first arcade skiing game built with Three.js, TypeScript and Vite. Timber the wolf skis forty courses in five worlds, from the resort at breakfast to the midnight face. Each course is a trail that winds across a mountain: it traverses, sweeps, narrows into chutes and opens into bowls, and the flags mark the way down it. There is an endless run and a daily course as well. Everything on screen is modeled procedurally, audio is synthesized, fonts are bundled, and there is no backend: progress lives in the browser, and the game installs to the home screen and plays offline.

## Run

Requires Node.js 22.12+.

```sh
npm install
npm run dev      # then open the printed URL; use the Network URL to play on a phone
npm test         # physics, courses, movers, stand-in players, save data
npm run build    # type-check + production build into dist/
npm run preview
```

Deploy `dist/` to any static HTTPS host (asset paths are relative, so a subdirectory works). `.github/workflows/deploy.yml` tests, builds and publishes to GitHub Pages on every push to `main`.

## The game

- **Steering.** Drag left and right anywhere on the lower three quarters of the screen (or A / D, the arrow keys); releasing straightens gradually. "Straight" is the way the trail runs: with the thumb centred the skis follow it round every bend, and the camera rides the trail behind the skier, so the slope ahead holds still on the screen. Sharp turns cost a little speed. Esc or P pauses, R restarts.
- **Speed.** Each course has a cruising pace, a little faster on its steeper pitches; a bullseye adds a burst on top. The skis answer the same way at any speed.
- **The trail.** Open groomed snow of varying width, then seven metres of deep powder that drags, then the trees or the rock. Shaped snow (cambers, dishes, crowns, rollers) tilts and carries the skis; it is read off the shading of the snow itself.
- **Gates.** Pass between each pair of flags for 100 points times the combo (up to ×8). Within a metre of the middle is a **bullseye**: +50, a coin and a **carve boost**, a burst of speed that fades over two seconds. Gates stand across the trail, often well to one side of it, so the way into each has to be set up from the one before.
- **Stars.** One star is a score that forgives roughly one gate in four on the first level and one in six on the last, and needs at least half the gates taken. Two stars forgive one missed gate. Three want every gate, **no tumble**, and a set number of bullseyes; on a race, the fox beaten too. A tumble costs 300 points, the combo and over a second.
- **Worlds.** Five worlds of eight levels; a world opens at 0 / 10 / 22 / 34 / 46 stars.

  | # | World | The place | What it is about |
  | - | ----- | --------- | ---------------- |
  | 1 | Sunny Side | Broad pistes swinging down the resort hill | Following a bending trail, learners, kickers, a snowcat |
  | 2 | Pinewood | Narrow trails through tall forest | Tight bends, deer, the herd, forks, log piles, a sunken lane, fog |
  | 3 | Blue River | A frozen river in its channel | Ice, gates that never stand still, an iced luge |
  | 4 | Granite Gorge | Steep rock walls at dusk | Chutes, leaps, a switchback road with ploughs, falling rock, the first avalanche |
  | 5 | Midnight Face | The open face at night | Long traverses on tilted snow, two runs by headlamp, crests, the last avalanche |

- **What stands on the course.** Nothing is placed to be missed by a skier who holds the racing line; it is placed on that line or across it, with room to see it and a way round.
  - *Rocks*: on the direct line between two gates, pinching it from the inside of the turn, in pairs to thread, or strewn as a field. *Kickers* stand before some: line up and fly the rock (250 points, coins in the air), or ski round.
  - *Learners* make long steady traverses right across the piste: read which way one is going and pass behind. *Deer* break out of the trees at the edge of the trail, run in to the racing line, stop on it for an uncertain moment, then bolt on: the only safe side is the one they came from. *The herd* breaks out of the trees ahead and runs down the trail in lanes. A *snowcat* grooms from edge to edge. *Ploughs* grind up the racing lane. *Boulders* land near a ring that shows where.
  - *Ice* lies in rounded patches strung down and beside the line, and on an ice level it covers most of the way down: on a patch the skis run faster and answer the thumb a third as well; on the snow between they bite again. *Leaps*: the trail ends at a drop, and one kicker on the racing line throws the skier across. Miss the kicker and he goes into the gap: a tumble, and the time it takes to climb out on the far side.
  - *Moving gates* ride a rail and never stop. Some swing like a pendulum, some shuttle at a steady pace; where each is in its swing differs from run to run. They are led, not waited for.
  - *Rusty the fox* races once in each world with a thirty-metre head start, at very nearly the course's own cruising pace: it takes bullseye boosts and a clean run to catch him. He does not wait when he is ahead, he digs in hard when he is passed (two per cent quicker for every metre he is behind, so he sits on the skier's tails and any slip lets him back through), and he kicks for the line over the last part of the course. *The avalanche* comes down the trail behind the skier at a fixed pace: time lost is lead lost, a missed gate gives it nine metres, and a cleared leap swallows the front of it.
  - *Night*: nothing shows but what the headlamp lights, a cone 48 m long that swings with the skis, plus real lights (the fox's lantern, a machine's beacon). Flags, piste poles and the marks on rocks reflect only inside the beam. Night levels are slower and their gates set closer in, because that is all the lamp allows. *Fog* and *blizzard* cut sight to 50 m and 42 m; the poles at the trail's edge show where it goes.
- **Endless and Daily.** A trail generated ahead of the skier, laid in sections of a few hundred metres, each about one thing from the campaign: rock, learners, kickers, deer, ice, moving gates, a leap, the herd, a snowcat, rock fields, ploughs, falling boulders, forks, shaped snow (camber, dish, crown, roller and step in turn, with nothing standing on them). After 300 m of plain flags every one of them is met once (the gentler ones first, in an order that differs from run to run), which takes about four kilometres (3.8 to 4.2 over 200 seeds); on the way the last of the gentler sections is skied in fog and one of the harder ones by headlamp. Night falls only on sections that are fair in the dark (what stands still, carries a light, or is the snow itself: never a leap, the herd, a rock field or falling boulders), and a night section is skied a tenth slower, easing into the dark and out of it. Later, fog or night comes down on any section more and more often (about one in six at first, toward nearly half), never on two running, and past eight kilometres a blizzard may come instead; after that they come in any order and, more and more often, two to a section. Nothing levels off: the snow gets faster for ever (22 m/s at the start, about 30 at three kilometres, 37 at ten, and a third of a metre a second more every kilometre after), the gates come closer together in time (3.1 s apart at the start, 1.7 at five kilometres, shortening still to a floor of 1.25), narrower and further across the trail (never further than the skis can cover in the gap), more stretches carry their section's thing, more of the rest carry rock, the herd grows from three to five, learners and boulders come in pairs, and rock fields get denser. Three lives; every miss or tumble costs one and every five crates win one back. The daily course is the same for everyone that day.

  `ENDLAB=1 SEEDS=24 npx vitest run tests/endlab.test.ts` sends the stand-in players down it. Currently (24 runs each, median distance): novice 1.9 km, average 2.1 km, expert 2.5 km (best 5.8 km), blind 1.2 km. The expert does no better than the average hand because what ends its runs is ploughs and boulders, which the pilots plan badly round (see below); how far a person gets has not been measured.
- **Gear.** Coins buy outfits and skis for the wolf. Cosmetic only.

## How the courses are set and balanced

- **Trails** are authored per level as legs (length, direction, width, pitch) in `src/campaign.ts`; gates and tags are written as phrases about the middle of the trail and the builder swings them across it. The skier is moved through the world along the trail (`src/physics.ts`): the thumb steers relative to the way the trail runs. Under a leap, a kicker's flight and every sheet of ice the trail runs straight, because nobody can steer there.
- **The course setter's rules** (`src/levels.ts`): no gate may ask for a sharper turn than its world allows (`DEMAND_CAP`), nor a wider swing than the skis can cover in the gap; a course that asks too little on average is set wider (`DEMAND_FLOOR`, not at night, in fog, or on teaching levels); the last gate is checked against the run-out.
- **Stand-in players** (`src/pilot.ts`): novice, average and expert see a thing a moment late, aim a little off, cannot see past fog or the lamp, and plan a way round what stands in their line. A fourth, "blind", is an average hand that looks at nothing but the flags: what it suffers measures whether the obstacles matter. `BALANCE=1 SEEDS=24 npx vitest run tests/balance.test.ts` skis every level with all four and writes `bots.txt`. Gates that even the expert missed in most runs were set easier one by one (`soften` in the level's options).

  From the current `bots.txt` (12 runs per pilot per level; mean of the eight levels of each world):

  | World | Novice: pass / stars | Average: pass / stars / 3★ | Expert: pass / stars / 3★ | Blind: tumbles vs average |
  | ----- | -------------------- | -------------------------- | ------------------------- | ------------------------- |
  | 1 | 99% / 1.8 | 100% / 2.1 / 26% | 100% / 2.4 / 40% | 1.7 vs 1.0 |
  | 2 | 68% / 1.0 | 99% / 1.8 / 19% | 100% / 2.1 / 33% | 2.1 vs 1.5 |
  | 3 | 29% / 0.3 | 82% / 1.2 / 17% | 100% / 1.7 / 19% | 1.4 vs 0.9 |
  | 4 | 15% / 0.1 | 90% / 1.4 / 4% | 97% / 1.8 / 20% | 1.9 vs 1.6 |
  | 5 | 22% / 0.3 | 92% / 1.5 / 9% | 100% / 2.1 / 32% | 1.9 vs 1.3 |

  A run takes 30 to 49 seconds.

**What this does and does not show.** It is evidence about relative difficulty, unfair spots and whether a feature changes the outcome. It is not a playtest: the pilots are a model, their planning is weaker than a person's round ploughs and boulders (the expert still tumbles more than it should on Cat Track and Rockfall), and nobody has yet tuned these levels with a thumb on a phone. Known soft spots: world 3 is no harder for an average player than world 2, and its obstacles barely trouble a skier who ignores them; a skier who never steers now rides the trail and still scrapes one star on three levels whose gates stand near its middle; levels built on kickers, ice and leaps are straighter than the rest; forks offer little reason to prefer a side.

In development builds `window.timberline.play(n)` jumps into any level and `window.timberline.bot = "average"` (or `"novice"`, `"expert"`, `"blind"`, `""`) hands the skis to a pilot.

## Structure

| File | Responsibility |
| ---- | -------------- |
| `src/trail.ts` | Trails: legs laid into a path across the mountain, trail coordinates (along / across), the face's height |
| `src/campaign.ts` | The forty levels: each a trail, phrases of gates, and tags for what stands on each stretch |
| `src/levels.ts` | Worlds, the course builder (rocks, walls, forks, shaped snow, the setter's rules), star scores |
| `src/extras.ts` | Placement of coins, kickers, leaps, ice, power-ups and movers |
| `src/movers.ts` | How learners, deer, the herd, snowcats, ploughs and boulders behave |
| `src/physics.ts` | The simulation: steering, speed, powder, ice, jumps, gates, the fox, the avalanche, scoring and stars |
| `src/pilot.ts` | The stand-in players used for balancing |
| `src/endless.ts`, `src/crates.ts` | The endless and daily generator; supply crates |
| `src/save.ts`, `src/gear.ts` | Progress, coins and the gear catalogue |
| `src/scene.ts` | Renderer, the camera that rides the trail behind the skier, gates |
| `src/terrain.ts` | The mountain: a heightfield that follows the trail, groomed snow, powder shoulder, each world's relief |
| `src/lamp.ts` | Light and sight for every material: the headlamp cone at night, fog and blizzard by day |
| `src/environment.ts`, `src/themes.ts` | Scenery laid along the trail, the sky, the light and colours of each world |
| `src/hazards.ts`, `src/props.ts`, `src/pickups.ts` | Rocks and trees, everything else on the course |
| `src/juice.ts`, `src/effects.ts`, `src/audio.ts` | Particles, weather, the avalanche, tracks, synthesized sound |
| `src/character.ts` | The wolf (and, recoloured, the fox) |
| `src/mapart.ts` | The illustrated mountains of the trail map and the gear icons |
| `src/main.ts`, `src/style.css`, `index.html` | Screens, HUD, results and the loop |

The simulation runs at 120 fixed steps a second independently of rendering.

## Tests

`npm test` covers the skiing model (steering about the trail, pace, powder, ice), gates and stars, every course (it builds, winds, keeps its gates on the snow and inside the setter's rules, runs straight where nobody can steer, keeps night levels inside the lamp's reach), movers, crates, the endless generator, the save file and thumb input, and the stand-in players: obstacles must cost the blind pilot tumbles and stars, taking them away must make it measurably better, the game must get harder from the first world to the last, and every level must be passable by an expert in most runs. Tests named "(known fault)" are expected failures kept in view: things measured to be wrong that are not fixed yet.

`tests/lab.test.ts` is a bench for looking at one level closely (`LAB=1 LEVEL=n`, `TRACE=1`, `GATES=1`, `DEMAND=1`, `SOFT=<file>`); `tests/endlab.test.ts` is the same for the endless run (`ENDLAB=1`, `DETAIL=expert` lists where each life went).

To regenerate the home-screen icons after replacing `art/icon-master.png`, run `npm run icons`.

The bundled Nunito and Barlow Condensed typefaces are distributed under the SIL Open Font License.
