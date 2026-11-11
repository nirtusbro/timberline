import type { Run } from "./physics";

/** A pentatonic run for coins: taken in quick succession they climb it. */
const COIN_SCALE = [988, 1109, 1319, 1480, 1661, 1976, 2217, 2637, 2960, 3322, 3951, 4435, 5274];

/** Synthesized effects avoid downloads and start only after a user gesture. */
export class SkiAudio {
  muted = false;
  private ctx?: AudioContext;
  private master?: GainNode;
  private noise?: AudioBuffer;
  private snow?: GainNode;
  private filter?: BiquadFilterNode;
  private wind?: GainNode;
  private windFilter?: BiquadFilterNode;
  private rumble?: GainNode;
  unlock() {
    try {
      if (!this.ctx) {
        const Audio =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        if (!Audio) return;
        this.ctx = new Audio();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.65;
        // A gentle limiter, so a burst of pickups never clips.
        const squash = this.ctx.createDynamicsCompressor();
        squash.threshold.value = -14;
        squash.ratio.value = 6;
        this.master.connect(squash);
        squash.connect(this.ctx.destination);
        const buffer = this.ctx.createBuffer(
          1,
          this.ctx.sampleRate * 2,
          this.ctx.sampleRate,
        );
        const data = buffer.getChannelData(0);
        let last = 0;
        for (let i = 0; i < data.length; i++) {
          last = (last + Math.random() * 0.1 - 0.05) / 1.02;
          data[i] = last * 3.5;
        }
        this.noise = buffer;
        // Three beds off the one loop of noise: skis on snow, wind in the ears, and the avalanche.
        const bed = (type: BiquadFilterType, frequency: number) => {
          const source = this.ctx!.createBufferSource();
          source.buffer = buffer;
          source.loop = true;
          source.playbackRate.value = 0.8 + Math.random() * 0.4;
          const filter = this.ctx!.createBiquadFilter();
          filter.type = type;
          filter.frequency.value = frequency;
          const gain = this.ctx!.createGain();
          gain.gain.value = 0;
          source.connect(filter);
          filter.connect(gain);
          gain.connect(this.master!);
          source.start();
          return { filter, gain };
        };
        ({ filter: this.filter, gain: this.snow } = bed("lowpass", 900));
        ({ filter: this.windFilter, gain: this.wind } = bed("bandpass", 500));
        this.windFilter.Q.value = 0.6;
        this.rumble = bed("lowpass", 110).gain;
      }
      void this.ctx.resume().catch(() => {});
    } catch {
      /* Audio is optional; a rejected device never prevents skiing. */
    }
  }
  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.ctx && this.master)
      this.master.gain.setTargetAtTime(
        muted ? 0 : 0.65,
        this.ctx.currentTime,
        0.04,
      );
  }
  /** Keeps the beds in step with the run. `rumble` is how near the avalanche is, 0 to 1. */
  update(s: Run, playing: boolean, rumble: number) {
    if (!this.ctx || !this.snow || !this.filter || !this.wind || !this.windFilter || !this.rumble) return;
    const now = this.ctx.currentTime;
    const onSnow = playing && !s.airborne && s.crashTime === 0;
    // Skis hiss louder and brighter in a turn; on ice they rasp; in the air they fall silent.
    this.snow.gain.setTargetAtTime(
      onSnow ? 0.035 + s.speed * 0.003 + Math.abs(s.heading) * 0.2 + (s.onIce ? 0.08 : 0) : 0,
      now,
      onSnow ? 0.12 : 0.04,
    );
    this.filter.frequency.setTargetAtTime(
      (s.onIce ? 2400 : 650) + s.speed * 25 + Math.abs(s.heading) * 2600,
      now,
      0.15,
    );
    // Wind rises with speed, and howls in bad weather and in the air.
    const weather = playing ? { clear: 0, snow: 0.02, fog: 0.01, blizzard: 0.08 }[s.course.weather] : 0;
    this.wind.gain.setTargetAtTime(
      playing ? Math.max(0, s.speed - 18) * 0.0028 + weather + (s.airborne ? 0.07 : 0) + (s.boost > 0 ? 0.04 : 0) : 0,
      now,
      0.25,
    );
    this.windFilter.frequency.setTargetAtTime(380 + s.speed * 14 + (s.boost > 0 ? 500 : 0), now, 0.3);
    this.rumble.gain.setTargetAtTime(playing ? rumble * rumble * 0.9 : 0, now, 0.2);
  }
  play(event: string, n = 1) {
    if (!this.ctx || !this.master || this.muted) return;
    const now = this.ctx.currentTime;
    const note = (
      frequency: number,
      offset: number,
      duration: number,
      volume = 0.12,
      type: OscillatorType = "sine",
      slideTo = 0,
    ) => {
      const osc = this.ctx!.createOscillator(),
        gain = this.ctx!.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, now + offset);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + offset + duration);
      gain.gain.setValueAtTime(0, now + offset);
      gain.gain.linearRampToValueAtTime(volume, now + offset + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + duration);
      osc.connect(gain);
      gain.connect(this.master!);
      osc.start(now + offset);
      osc.stop(now + offset + duration + 0.03);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    };
    /** A sweep of filtered noise: a whoosh, a thump of snow, a hiss. */
    const rush = (from: number, to: number, duration: number, volume: number, offset = 0, q = 1.2) => {
      if (!this.noise) return;
      const source = this.ctx!.createBufferSource();
      source.buffer = this.noise;
      source.playbackRate.value = 1.6;
      const filter = this.ctx!.createBiquadFilter();
      filter.type = "bandpass";
      filter.Q.value = q;
      filter.frequency.setValueAtTime(from, now + offset);
      filter.frequency.exponentialRampToValueAtTime(to, now + offset + duration);
      const gain = this.ctx!.createGain();
      gain.gain.setValueAtTime(0, now + offset);
      gain.gain.linearRampToValueAtTime(volume, now + offset + duration * 0.25);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.master!);
      source.start(now + offset, Math.random());
      source.stop(now + offset + duration + 0.05);
      source.onended = () => {
        source.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
    };
    switch (event) {
      case "gate":
        note(620 + n * 62, 0, 0.14, 0.1);
        note(930 + n * 62, 0.06, 0.2, 0.06);
        break;
      case "bullseye":
        // The gate's two notes, brighter, with a rising hiss: the carve boost lighting.
        note(660 + n * 70, 0, 0.16, 0.11);
        note(990 + n * 70, 0.06, 0.22, 0.09);
        note(1320 + n * 70, 0.12, 0.3, 0.07);
        rush(500, 3200, 0.45, 0.2, 0.02);
        break;
      case "coin":
        note(COIN_SCALE[Math.min(COIN_SCALE.length - 1, n)], 0, 0.11, 0.055, "triangle");
        note(COIN_SCALE[Math.min(COIN_SCALE.length - 1, n)] * 1.5, 0.03, 0.12, 0.03);
        break;
      case "token":
        note(1047, 0, 0.28, 0.09);
        note(1319, 0.06, 0.3, 0.07);
        note(1568, 0.13, 0.4, 0.055);
        break;
      case "crate":
      case "buy":
        [784, 1047, 1319, 1568].forEach((f, i) => note(f, i * 0.055, 0.38, 0.08));
        break;
      case "power":
        [523, 784, 1047, 1568].forEach((f, i) => note(f, i * 0.05, 0.3, 0.085, "triangle"));
        note(2093, 0.2, 0.5, 0.05);
        rush(800, 4000, 0.35, 0.1);
        break;
      case "shield":
        // A glassy shatter.
        [1976, 1568, 1245, 988].forEach((f, i) => note(f, i * 0.035, 0.22, 0.07, "triangle"));
        rush(5000, 900, 0.3, 0.3, 0, 0.7);
        note(140, 0, 0.18, 0.14, "triangle", 70);
        break;
      case "whoosh":
        rush(700, 2600, 0.22, 0.26);
        break;
      case "launch":
        rush(300, 2400, 0.35, 0.22);
        note(330, 0, 0.3, 0.07, "sine", 880);
        break;
      case "land":
        rush(900, 160, 0.22, 0.5, 0, 0.6);
        note(110, 0, 0.16, 0.16, "sine", 55);
        note(784, 0.05, 0.18, 0.06);
        note(1175, 0.11, 0.26, 0.05);
        break;
      case "deer":
        // Two soft hoots, like a warning whistle up the valley.
        note(880, 0, 0.12, 0.07, "triangle");
        note(660, 0.14, 0.16, 0.07, "triangle");
        break;
      case "beacon":
        note(1245, 0, 0.09, 0.05, "square");
        note(1245, 0.18, 0.09, 0.05, "square");
        break;
      case "life":
        [659, 880, 1319, 1760].forEach((f, i) => note(f, i * 0.07, 0.45, 0.09));
        break;
      // Stars ring one after another, each a step higher; n carries which star.
      case "star": {
        const f = [784, 988, 1175][Math.max(0, Math.min(2, n - 1))];
        note(f, 0, 0.5, 0.11);
        note(f * 2, 0.03, 0.4, 0.05);
        note(f * 3, 0.05, 0.3, 0.025);
        break;
      }
      case "tick":
        note(1400, 0, 0.03, 0.02, "square");
        break;
      case "tap":
        note(620, 0, 0.06, 0.05, "triangle");
        break;
      case "deny":
        note(180, 0, 0.12, 0.06, "triangle");
        break;
      case "miss":
        note(240, 0, 0.2, 0.08, "triangle", 150);
        break;
      case "crash":
        note(95, 0, 0.25, 0.2, "triangle");
        note(62, 0.08, 0.3, 0.12, "triangle");
        rush(1400, 200, 0.4, 0.5, 0, 0.5);
        break;
      case "start":
        note(523, 0, 0.18, 0.1);
        note(784, 0.12, 0.25, 0.1);
        break;
      case "finish":
        [523, 659, 784, 1047].forEach((f, i) => note(f, i * 0.14, 0.65, 0.1));
        [1047, 1319, 1568].forEach((f) => note(f, 0.6, 0.9, 0.05));
        break;
      case "over":
        [392, 330, 262].forEach((f, i) => note(f, i * 0.16, 0.5, 0.09, "triangle"));
        break;
      case "buried":
        rush(600, 60, 1.4, 0.9, 0, 0.4);
        note(70, 0, 1.2, 0.2, "triangle", 35);
        break;
    }
  }
}
