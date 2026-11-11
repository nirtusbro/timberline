import { clamp } from "./physics";

export class SkiInput {
  value = 0;
  engaged = false;
  private pointer: number | null = null;
  private startX = 0;
  private keys = new Set<string>();
  private drag = 0;
  enabled = false;
  /** Scales how far a drag has to travel for a full turn: above 1 is sharper, below is more relaxed. */
  sensitivity = 1;
  onSteer = () => {};
  constructor(private canvas: HTMLCanvasElement) {
    canvas.addEventListener("pointerdown", (e) => {
      if (
        !this.enabled ||
        e.button !== 0 ||
        e.clientY < innerHeight * 0.25 ||
        this.pointer !== null
      )
        return;
      e.preventDefault();
      this.pointer = e.pointerId;
      this.startX = e.clientX;
      this.engaged = true;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (e.pointerId !== this.pointer) return;
      e.preventDefault();
      this.drag = clamp(
        ((e.clientX - this.startX) * this.sensitivity) / Math.min(100, innerWidth * 0.24),
        -1,
        1,
      );
      if (Math.abs(this.drag) > 0.1) this.onSteer();
    });
    const release = (e: PointerEvent) => {
      if (e.pointerId === this.pointer) {
        this.pointer = null;
        this.drag = 0;
        this.engaged = false;
      }
    };
    canvas.addEventListener("pointerup", release);
    canvas.addEventListener("pointercancel", release);
    canvas.addEventListener("lostpointercapture", release);
    window.addEventListener("keydown", (e) => {
      if (
        !this.enabled ||
        !["ArrowLeft", "ArrowRight", "a", "d", "A", "D"].includes(e.key)
      )
        return;
      e.preventDefault();
      this.keys.add(e.key.toLowerCase());
      this.onSteer();
    });
    window.addEventListener("keyup", (e) =>
      this.keys.delete(e.key.toLowerCase()),
    );
    window.addEventListener("blur", () => this.reset());
  }
  update(dt: number) {
    const key =
      Number(this.keys.has("arrowright") || this.keys.has("d")) -
      Number(this.keys.has("arrowleft") || this.keys.has("a"));
    const target = this.enabled ? key || this.drag : 0;
    this.value += (target - this.value) * (1 - Math.exp(-12 * dt));
    return this.value;
  }
  reset() {
    const pointer = this.pointer;
    this.pointer = null;
    if (pointer !== null && this.canvas.hasPointerCapture(pointer))
      this.canvas.releasePointerCapture(pointer);
    this.drag = 0;
    this.value = 0;
    this.engaged = false;
    this.keys.clear();
  }
}
