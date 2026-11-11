/** Finish-time bonus: points for every second under the course's par time. */
export const finishTimeBonus = (seconds: number, par = 90, rate = 50) =>
  Math.max(0, Math.round((par - seconds) * rate));
