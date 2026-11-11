// Generates every home-screen and favicon asset from art/icon-master.png.
// Run with: npm run icons
import sharp from "sharp";

const SOURCE = "art/icon-master.png";
const OUT = "public";

const { width: W } = await sharp(SOURCE).metadata();
// The master art has rounded corners baked in on a dark background. Cut a
// slightly tighter rounded rectangle so no dark fringe survives.
const radius = Math.round(W * 0.215);
const mask = Buffer.from(
  `<svg width="${W}" height="${W}"><rect width="${W}" height="${W}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`,
);

// Artwork with transparent corners: used where the platform draws its own shape.
const rounded = await sharp(SOURCE)
  .ensureAlpha()
  .composite([{ input: mask, blend: "dest-in" }])
  .png()
  .toBuffer();

// A zoomed, blurred copy of the art fills the corners for opaque, full-bleed icons.
const zoom = Math.round(W * 1.3);
const offset = Math.round((zoom - W) / 2);
const backdrop = await sharp(SOURCE)
  .resize(zoom, zoom)
  .extract({ left: offset, top: offset, width: W, height: W })
  .blur(40)
  .png()
  .toBuffer();

// Opaque full-bleed square (iOS applies its own corner mask).
const square = await sharp(backdrop).composite([{ input: rounded }]).png().toBuffer();

// Maskable icon: keep the wolf inside the 80% safe zone so circular masks do
// not clip his ears or skis. A sky-to-snow gradient fills the rest.
const inner = Math.round(W * 0.82);
const gradient = Buffer.from(
  `<svg width="${W}" height="${W}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#52b3fd"/><stop offset="1" stop-color="#e2edfc"/></linearGradient></defs><rect width="${W}" height="${W}" fill="url(#g)"/></svg>`,
);
const maskable = await sharp(gradient)
  .composite([
    {
      input: await sharp(rounded).resize(inner, inner).png().toBuffer(),
      gravity: "centre",
    },
  ])
  .png()
  .toBuffer();

const jobs = [
  ["icon-192.png", rounded, 192],
  ["icon-512.png", rounded, 512],
  ["icon-maskable-192.png", maskable, 192],
  ["icon-maskable-512.png", maskable, 512],
  ["apple-touch-icon.png", square, 180],
  ["favicon.png", rounded, 64],
];
for (const [name, source, size] of jobs) {
  await sharp(source).resize(size, size).png({ compressionLevel: 9, palette: true, quality: 90 }).toFile(`${OUT}/${name}`);
  console.log(`wrote ${OUT}/${name}`);
}
