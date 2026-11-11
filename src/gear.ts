/** Outfits and skis bought with coins. Purely cosmetic: nothing here changes how the skis handle. */
export interface Outfit {
  id: string;
  name: string;
  price: number;
  suit: string;
  trim: string;
  scarf: string;
}
export interface Skis {
  id: string;
  name: string;
  price: number;
  top: string;
  base: string;
}
export const OUTFITS: Outfit[] = [
  { id: "trail", name: "Trailblazer", price: 0, suit: "#2367a1", trim: "#e23a36", scarf: "#e23a36" },
  { id: "evergreen", name: "Evergreen", price: 150, suit: "#2f7d5b", trim: "#f2b63a", scarf: "#f2b63a" },
  { id: "sunset", name: "Sunset", price: 300, suit: "#e8663c", trim: "#5b2a86", scarf: "#ffd166" },
  { id: "glacier", name: "Glacier", price: 450, suit: "#dfeef7", trim: "#2aa7c9", scarf: "#1d6fa5" },
  { id: "midnight", name: "Midnight", price: 600, suit: "#232a4d", trim: "#8a5cf6", scarf: "#36e0c2" },
  { id: "bubblegum", name: "Bubblegum", price: 800, suit: "#f48fb1", trim: "#56b8f5", scarf: "#fff3a0" },
  { id: "lava", name: "Lava", price: 1000, suit: "#2e2a2a", trim: "#ff5a1f", scarf: "#ffb300" },
  { id: "podium", name: "Gold medal", price: 1500, suit: "#d6a21c", trim: "#fff3c4", scarf: "#b3261e" },
];
export const SKIS: Skis[] = [
  { id: "cherry", name: "Cherry", price: 0, top: "#e23a36", base: "#223b4b" },
  { id: "lemon", name: "Lemon", price: 100, top: "#f5c518", base: "#223b4b" },
  { id: "mint", name: "Mint", price: 200, top: "#37c8a0", base: "#1d4a4a" },
  { id: "sky", name: "Bluebird", price: 300, top: "#3aa0ff", base: "#1c2f55" },
  { id: "violet", name: "Violet", price: 450, top: "#8b5cf6", base: "#2b2350" },
  { id: "carbon", name: "Carbon", price: 700, top: "#2a2f36", base: "#d9dee4" },
  { id: "aurora", name: "Aurora", price: 1000, top: "#2be3a4", base: "#6a4cff" },
];
export const DEFAULT_OUTFIT = OUTFITS[0].id;
export const DEFAULT_SKIS = SKIS[0].id;
export const outfitById = (id: string) => OUTFITS.find((o) => o.id === id) ?? OUTFITS[0];
export const skisById = (id: string) => SKIS.find((s) => s.id === id) ?? SKIS[0];
export const gearItem = (id: string): Outfit | Skis | undefined =>
  OUTFITS.find((o) => o.id === id) ?? SKIS.find((s) => s.id === id);
