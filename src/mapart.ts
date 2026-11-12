/**
 * The trail map: one mountain per world, drawn as a flat poster in the
 * world's colours with its piste running from the summit to the foot. The
 * eight levels sit along the piste at the same places on every mountain
 * (mirrored on alternate worlds), so the map never scrolls.
 */
const W = 390,
  H = 800;
/** Where the eight levels sit, as shares of the width and height. */
const SPOTS: [number, number][] = [
  [0.5, 0.215],
  [0.29, 0.295],
  [0.63, 0.365],
  [0.33, 0.44],
  [0.67, 0.515],
  [0.35, 0.59],
  [0.65, 0.665],
  [0.47, 0.745],
];
export const mapSpots = (world: number): [number, number][] =>
  SPOTS.map(([x, y]) => [world % 2 ? 1 - x : x, y]);

interface Palette {
  sky: [string, string];
  far: string;
  rock: string;
  shade: string;
  snow: string;
  piste: string;
  ink: string;
}
const PALETTES: Palette[] = [
  { sky: ["#8fd3f7", "#e6f6ff"], far: "#a9d4ec", rock: "#5f9fcb", shade: "#4a86b3", snow: "#f6fbff", piste: "#ffffff", ink: "#14263d" },
  { sky: ["#ffcf8a", "#fff0d2"], far: "#e9c48f", rock: "#b98a52", shade: "#8f6a3f", snow: "#fff6e6", piste: "#ffffff", ink: "#14263d" },
  { sky: ["#6cc4f2", "#dff5ff"], far: "#9fd6f2", rock: "#3f8fd0", shade: "#2f73b0", snow: "#eaf8ff", piste: "#bfe6fb", ink: "#14263d" },
  { sky: ["#c79bd0", "#f4def2"], far: "#b08fc0", rock: "#77608f", shade: "#5a4672", snow: "#f5e9f5", piste: "#ffffff", ink: "#14263d" },
  { sky: ["#0b1436", "#27397f"], far: "#1c2a63", rock: "#2a3b7c", shade: "#1d2a5e", snow: "#b9c8f2", piste: "#e6ecff", ink: "#8fa4e6" },
];
const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const pine = (x: number, y: number, s: number, fill: string, ink: string) =>
  `<path d="M${x} ${y - 26 * s}l${9 * s} ${14 * s}h${-5 * s}l${8 * s} ${12 * s}h${-24 * s}l${8 * s} ${-12 * s}h${-5 * s}z" fill="${fill}" stroke="${ink}" stroke-width="2" stroke-linejoin="round"/><rect x="${x - 1.5 * s}" y="${y}" width="${3 * s}" height="${5 * s}" fill="${ink}"/>`;

/** The poster for a world, as SVG markup that fills its box. */
export function mapArt(world: number) {
  const p = PALETTES[world],
    spots = mapSpots(world),
    rand = seeded(world * 97 + 11);
  const at = ([x, y]: [number, number]) => [x * W, y * H] as const;
  // The piste: a ribbon through the eight spots, from the start hut down to the lodge.
  const points = [[spots[0][0] * W, 0.165 * H] as const, ...spots.map(at), [spots[7][0] * W + (world % 2 ? 26 : -26), 0.82 * H] as const];
  let d = `M${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1],
      [bx, by] = points[i],
      my = (ay + by) / 2;
    d += ` C${ax} ${my} ${bx} ${my} ${bx} ${by}`;
  }
  const summit = [spots[0][0] * W, 0.12 * H];
  const mountain = `M${summit[0]} ${summit[1]} L${W + 60} ${0.7 * H} L${W + 60} ${H} L-60 ${H} L-60 ${0.66 * H} Z`;
  const shadeSide = world % 2 ? `M${summit[0]} ${summit[1]} L-60 ${0.66 * H} L-60 ${H} L${summit[0] - 40} ${H} Z` : `M${summit[0]} ${summit[1]} L${W + 60} ${0.7 * H} L${W + 60} ${H} L${summit[0] + 40} ${H} Z`;
  const cap = `M${summit[0]} ${summit[1]} l46 62 l-22 -10 l-14 22 l-18 -24 l-18 16 l-22 -6 z`;
  let far = "";
  for (let i = 0; i < 5; i++) {
    const x = -40 + i * 110 + rand() * 30,
      top = 0.2 * H + rand() * 0.1 * H;
    far += `<path d="M${x} ${0.5 * H} L${x + 90} ${top} L${x + 190} ${0.5 * H} Z" fill="${p.far}"/>`;
  }
  let extras = "";
  const clear = (x: number, y: number) => points.every(([px, py]) => Math.hypot(px - x, (py - y) * 0.9) > 58);
  const scatter = (count: number, draw: (x: number, y: number, s: number) => string) => {
    for (let i = 0, tries = 0; i < count && tries < 400; tries++) {
      const y = (0.24 + rand() * 0.6) * H;
      // Keep to the mountain: it widens toward the foot.
      const half = 40 + ((y - summit[1]) / (H * 0.7)) * 260;
      const x = summit[0] + (rand() * 2 - 1) * half;
      if (x < -10 || x > W + 10 || !clear(x, y)) continue;
      extras += draw(x, y, 0.75 + rand() * 0.6);
      i++;
    }
  };
  if (world === 0) scatter(26, (x, y, s) => pine(x, y, s, "#2f8f6b", p.ink));
  else if (world === 1) scatter(60, (x, y, s) => pine(x, y, s * 1.15, rand() < 0.5 ? "#2b6e45" : "#3b8a4f", p.ink));
  else if (world === 2)
    scatter(26, (x, y, s) => `<path d="M${x} ${y - 24 * s}l${7 * s} ${24 * s}l${-7 * s} ${6 * s}l${-7 * s} ${-6 * s}z" fill="#d9f3ff" stroke="${p.ink}" stroke-width="2" stroke-linejoin="round"/>`);
  else if (world === 3)
    scatter(30, (x, y, s) => `<path d="M${x - 14 * s} ${y}l${4 * s} ${-22 * s}l${12 * s} ${-6 * s}l${10 * s} ${10 * s}l${2 * s} ${18 * s}z" fill="#8d76a6" stroke="${p.ink}" stroke-width="2" stroke-linejoin="round"/><path d="M${x - 9 * s} ${y - 22 * s}l${11 * s} ${-6 * s}l${9 * s} ${9 * s}" fill="none" stroke="#f5e9f5" stroke-width="3" stroke-linecap="round"/>`);
  else scatter(16, (x, y, s) => pine(x, y, s, "#22406b", p.ink));
  // The sky of the last world: stars and the aurora.
  let sky = "";
  if (world === 4) {
    for (let i = 0; i < 46; i++) sky += `<circle cx="${rand() * W}" cy="${rand() * 0.42 * H}" r="${0.8 + rand() * 1.4}" fill="#fff"/>`;
    sky += `<path d="M-20 ${0.22 * H} C80 ${0.1 * H} 150 ${0.3 * H} 240 ${0.16 * H} S380 ${0.2 * H} 420 ${0.1 * H}" fill="none" stroke="#5ff0b0" stroke-width="26" stroke-linecap="round" opacity=".55"/><path d="M-20 ${0.27 * H} C90 ${0.16 * H} 160 ${0.34 * H} 250 ${0.22 * H} S380 ${0.25 * H} 420 ${0.17 * H}" fill="none" stroke="#8f7cff" stroke-width="14" stroke-linecap="round" opacity=".5"/>`;
  } else if (world === 1) sky = `<circle cx="${world % 2 ? 70 : 320}" cy="${0.16 * H}" r="34" fill="#fff3c4"/>`;
  else if (world === 0) sky = `<circle cx="318" cy="${0.15 * H}" r="30" fill="#fff6c8"/>`;
  const hut = `<g transform="translate(${summit[0] - 15} ${0.13 * H})"><rect x="0" y="10" width="30" height="20" fill="#ff5a3c" stroke="${p.ink}" stroke-width="2.500"/><path d="M-4 12 15 -2 34 12z" fill="${p.snow}" stroke="${p.ink}" stroke-width="2.500" stroke-linejoin="round"/></g>`;
  const [lx, ly] = points[points.length - 1];
  const lodge = `<g transform="translate(${lx - 24} ${ly - 4})"><rect x="0" y="12" width="48" height="26" fill="#b9773f" stroke="${p.ink}" stroke-width="2.500"/><path d="M-6 14 24 -6 54 14z" fill="${p.snow}" stroke="${p.ink}" stroke-width="2.500" stroke-linejoin="round"/><rect x="19" y="22" width="10" height="16" fill="${p.ink}"/></g>`;
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="sky${world}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.sky[0]}"/><stop offset=".6" stop-color="${p.sky[1]}"/></linearGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#sky${world})"/>
  ${sky}${far}
  <path d="${mountain}" fill="${p.rock}" stroke="${p.ink}" stroke-width="3" stroke-linejoin="round"/>
  <path d="${shadeSide}" fill="${p.shade}" opacity=".55"/>
  <path d="${cap}" fill="${p.snow}" stroke="${p.ink}" stroke-width="3" stroke-linejoin="round"/>
  <path d="${d}" fill="none" stroke="${p.ink}" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${d}" fill="none" stroke="${p.piste}" stroke-width="33" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${d}" fill="none" stroke="${p.ink}" stroke-width="2" stroke-dasharray="2 12" stroke-linecap="round" opacity=".35"/>
  ${extras}${hut}${lodge}
</svg>`;
}

/** A jacket or a pair of skis in an item's colours, for the gear rail. */
export function gearIcon(item: { suit?: string; trim?: string; scarf?: string; top?: string; base?: string }) {
  if (item.suit)
    return `<svg viewBox="0 0 62 54" aria-hidden="true"><path d="M21 6 8 13 3 30l9 3 3-8v24h32V25l3 8 9-3-5-17-13-7-5 5h-10z" fill="${item.suit}"/><path d="M15 38h32v6H15z" fill="${item.trim}"/><path d="M26 11h10l-5 9z" fill="${item.scarf}"/></svg>`;
  return `<svg viewBox="0 0 62 54" aria-hidden="true"><g transform="rotate(-24 31 27)"><rect x="3" y="15" width="56" height="9" rx="4.500" fill="${item.top}"/><rect x="3" y="30" width="56" height="9" rx="4.500" fill="${item.top}"/><path d="M40 15h8v9h-8zM40 30h8v9h-8z" fill="${item.base}"/></g></svg>`;
}
