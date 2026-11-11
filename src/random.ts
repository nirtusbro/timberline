/** Small seeded generator. The seed is hashed so nearby seeds diverge at once. */
export function seededRandom(seed: number, salt = 0) {
  let state = (seed ^ salt) >>> 0;
  state = Math.imul(state ^ (state >>> 16), 0x7feb352d) >>> 0;
  state = Math.imul(state ^ (state >>> 15), 0x846ca68b) >>> 0;
  state = (state ^ (state >>> 16)) >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
