import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SkiInput } from "../src/input";

class Surface extends EventTarget {
  captured = new Set<number>();
  setPointerCapture(id: number) {
    this.captured.add(id);
  }
  hasPointerCapture(id: number) {
    return this.captured.has(id);
  }
  releasePointerCapture(id: number) {
    this.captured.delete(id);
  }
}
function pointer(surface: EventTarget, type: string, id: number, x: number, y = 600) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, {
    pointerId: id,
    pointerType: "touch",
    button: 0,
    clientX: x,
    clientY: y,
  });
  surface.dispatchEvent(event);
}
describe("thumb steering", () => {
  let canvas: Surface, windowTarget: EventTarget, input: SkiInput;
  beforeEach(() => {
    windowTarget = new EventTarget();
    vi.stubGlobal("window", windowTarget);
    vi.stubGlobal("innerHeight", 844);
    vi.stubGlobal("innerWidth", 390);
    canvas = new Surface();
    input = new SkiInput(canvas as unknown as HTMLCanvasElement);
    input.enabled = true;
  });
  afterEach(() => vi.unstubAllGlobals());
  it("steers by dragging and straightens on release", () => {
    pointer(canvas, "pointerdown", 2, 280);
    pointer(canvas, "pointermove", 2, 340);
    expect(input.engaged).toBe(true);
    expect(input.update(0.1)).toBeGreaterThan(0.3);
    pointer(canvas, "pointerup", 2, 340);
    expect(input.engaged).toBe(false);
    for (let i = 0; i < 20; i++) input.update(0.1);
    expect(Math.abs(input.update(0.1))).toBeLessThan(0.05);
  });
  it("ignores touches near the top of the screen and a second finger", () => {
    pointer(canvas, "pointerdown", 1, 200, 100);
    expect(input.engaged).toBe(false);
    pointer(canvas, "pointerdown", 2, 280);
    pointer(canvas, "pointerdown", 3, 100);
    pointer(canvas, "pointermove", 3, 40);
    expect(input.update(0.1)).toBe(0);
    pointer(canvas, "pointermove", 2, 340);
    expect(input.update(0.1)).toBeGreaterThan(0);
  });
  it("clears the touch on pause/reset and ignores input while disabled", () => {
    pointer(canvas, "pointerdown", 2, 280);
    input.reset();
    input.enabled = false;
    expect(canvas.captured.size).toBe(0);
    pointer(canvas, "pointerdown", 3, 280);
    expect(input.engaged).toBe(false);
  });
  it("steers with the arrow keys and releases on keyup or window blur", () => {
    const key = (type: string, name: string) => {
      const event = new Event(type, { cancelable: true });
      Object.assign(event, { key: name });
      windowTarget.dispatchEvent(event);
    };
    key("keydown", "ArrowRight");
    expect(input.update(0.2)).toBeGreaterThan(0.5);
    key("keyup", "ArrowRight");
    for (let i = 0; i < 20; i++) input.update(0.1);
    expect(Math.abs(input.update(0.1))).toBeLessThan(0.05);
    key("keydown", "a");
    expect(input.update(0.2)).toBeLessThan(-0.5);
    windowTarget.dispatchEvent(new Event("blur"));
    expect(input.update(0.1)).toBe(0);
    key("keydown", " ");
    expect(input.update(0.1)).toBe(0);
  });
});
