import * as THREE from "three";
import {
  box,
  cylinder,
  material,
  pebble,
  rod,
  shape,
  sphere,
} from "./geometry";
import type { Run } from "./physics";
import { outfitById, skisById } from "./gear";

/** Timber, the articulated and entirely procedural wolf. Local +Z is the direction of travel. */
export class Wolf {
  root = new THREE.Group();
  body = new THREE.Group();
  head = new THREE.Group();
  arms: THREE.Group[] = [];
  scarf: THREE.Mesh[] = [];
  tail = new THREE.Group();
  private tuck = 0;
  private suit = material("#2367a1");
  private trim = material("#e23a36");
  private scarfColor = material("#e23a36");
  private skiTop = material("#e23a36");
  private skiBase = material("#223b4b");
  /** Dresses the wolf in an outfit and a pair of skis from the gear shop. */
  setLook(outfitId: string, skisId: string) {
    const outfit = outfitById(outfitId),
      skis = skisById(skisId);
    this.setColors(outfit.suit, outfit.trim, outfit.scarf, skis.top, skis.base);
  }
  setColors(suit: string, trim: string, scarf: string, skiTop: string, skiBase: string) {
    this.suit.color.set(suit);
    this.trim.color.set(trim);
    this.scarfColor.color.set(scarf);
    this.skiTop.color.set(skiTop);
    this.skiBase.color.set(skiBase);
  }
  constructor(coat = { fur: "#51443e", light: "#756252", cream: "#fff1d7" }) {
    const fur = material(coat.fur),
      furLight = material(coat.light),
      cream = material(coat.cream);
    const blue = this.suit,
      white = material("#f1f7f7"),
      red = this.trim,
      scarf = this.scarfColor,
      skiTop = this.skiTop,
      skiBase = this.skiBase,
      sole = material("#223b4b");
    const black = material("#252e33"),
      pink = material("#d79685"),
      metal = material("#778c9a");
    this.root.add(this.body);
    for (const side of [-1, 1]) {
      const ski = new THREE.Group();
      ski.position.set(side * 0.3, 0.075, 0.05);
      this.root.add(ski);
      shape(ski, box, skiBase, [0, 0, 0], [0.2, 0.07, 2.65]);
      shape(ski, box, skiTop, [0, 0.05, 0.05], [0.205, 0.05, 2.5]);
      shape(
        ski,
        sphere,
        skiTop,
        [0, 0.1, 1.29],
        [0.105, 0.085, 0.3],
        [0.25, 0, 0],
      );
      shape(ski, box, white, [0, 0.085, 0.88], [0.21, 0.01, 0.32]);
      shape(ski, box, white, [0, 0.085, -0.95], [0.21, 0.01, 0.15]);
      shape(
        this.body,
        sphere,
        blue,
        [side * 0.28, 0.66, 0.07],
        [0.22, 0.45, 0.24],
        [-0.25, 0, side * 0.1],
      );
      shape(
        this.body,
        box,
        red,
        [side * 0.3, 0.3, 0.25],
        [0.3, 0.31, 0.52],
        [-0.1, 0, 0],
      );
      shape(
        this.body,
        box,
        sole,
        [side * 0.3, 0.14, 0.23],
        [0.33, 0.075, 0.56],
      );
      for (const z of [0.11, 0.35])
        shape(
          this.body,
          box,
          white,
          [side * 0.3, 0.455, z],
          [0.31, 0.045, 0.045],
        );
    }
    shape(
      this.body,
      sphere,
      blue,
      [0, 1.08, -0.02],
      [0.47, 0.64, 0.35],
      [0.13, 0, 0],
    );
    shape(
      this.body,
      sphere,
      white,
      [0, 1.15, 0.265],
      [0.32, 0.46, 0.1],
      [0.13, 0, 0],
    );
    shape(
      this.body,
      box,
      white,
      [0, 1.15, -0.355],
      [0.18, 0.64, 0.018],
      [0.12, 0, 0],
    );
    shape(this.body, box, red, [0, 0.78, -0.02], [0.75, 0.09, 0.64]);
    this.head.position.set(0, 1.7, 0.05);
    this.body.add(this.head);
    shape(this.head, sphere, fur, [0, 0.24, 0], [0.54, 0.55, 0.47]);
    for (const side of [-1, 1]) {
      shape(
        this.head,
        pebble,
        fur,
        [side * 0.39, 0.74, -0.07],
        [0.22, 0.54, 0.19],
        [0, 0, -side * 0.22],
      );
      shape(
        this.head,
        pebble,
        pink,
        [side * 0.39, 0.81, 0.05],
        [0.115, 0.29, 0.045],
        [0, 0, -side * 0.22],
      );
      shape(
        this.head,
        sphere,
        cream,
        [side * 0.32, 0.12, 0.27],
        [0.26, 0.3, 0.22],
      );
      for (let j = 0; j < 2; j++)
        shape(
          this.head,
          pebble,
          fur,
          [side * (0.47 + j * 0.01), 0.05 + j * 0.14, -0.08],
          [0.22, 0.13, 0.27],
          [0, 0, side * (0.15 + j * 0.3)],
        );
      shape(
        this.head,
        sphere,
        white,
        [side * 0.22, 0.37, 0.386],
        [0.17, 0.225, 0.105],
        [0, side * 0.18, -side * 0.12],
      );
      shape(
        this.head,
        sphere,
        black,
        [side * 0.2, 0.38, 0.485],
        [0.069, 0.12, 0.046],
      );
      shape(
        this.head,
        sphere,
        white,
        [side * 0.2 - 0.024, 0.426, 0.522],
        [0.021, 0.033, 0.013],
      );
      shape(
        this.head,
        sphere,
        fur,
        [side * 0.22, 0.595, 0.38],
        [0.18, 0.055, 0.06],
        [0, 0, side * 0.13],
      );
    }
    shape(this.head, sphere, black, [0, -0.02, 0.47], [0.29, 0.1, 0.28]);
    shape(this.head, sphere, cream, [0, 0.075, 0.48], [0.31, 0.18, 0.38]);
    shape(this.head, sphere, black, [0, 0.16, 0.79], [0.155, 0.12, 0.135]);
    shape(
      this.head,
      sphere,
      white,
      [-0.045, 0.214, 0.87],
      [0.04, 0.022, 0.011],
    );
    shape(this.body, cylinder, scarf, [0, 1.64, 0], [0.38, 0.2, 0.36]);
    shape(this.body, sphere, scarf, [-0.34, 1.62, -0.08], [0.16, 0.17, 0.17]);
    for (let i = 0; i < 9; i++) {
      const bit = shape(
        this.body,
        box,
        scarf,
        [-0.3, 1.6, -0.4 - i * 0.16],
        [0.3 - i * 0.008, 0.065, 0.2],
      );
      this.scarf.push(bit);
    }
    for (const side of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(side * 0.38, 1.37, 0);
      this.body.add(arm);
      this.arms.push(arm);
      rod(
        arm,
        new THREE.Vector3(),
        new THREE.Vector3(side * 0.3, -0.22, 0.07),
        0.155,
        red,
      );
      rod(
        arm,
        new THREE.Vector3(side * 0.3, -0.22, 0.07),
        new THREE.Vector3(side * 0.47, -0.34, 0.25),
        0.14,
        blue,
      );
      shape(arm, sphere, sole, [side * 0.47, -0.34, 0.25], [0.18, 0.16, 0.18]);
      rod(
        arm,
        new THREE.Vector3(side * 0.47, -0.3, 0.32),
        new THREE.Vector3(side * 0.82, -1.15, -0.8),
        0.022,
        metal,
      );
      rod(
        arm,
        new THREE.Vector3(side * 0.5, -0.36, 0.25),
        new THREE.Vector3(side * 0.59, -0.6, -0.01),
        0.026,
        red,
      );
      shape(arm, cylinder, sole, [side * 0.8, -1.1, -0.73], [0.1, 0.025, 0.1]);
    }
    this.tail.position.set(0, 0.85, -0.25);
    this.body.add(this.tail);
    shape(
      this.tail,
      sphere,
      furLight,
      [0, 0.02, -0.42],
      [0.22, 0.23, 0.56],
      [-0.3, 0.4, 0],
    );
    shape(
      this.tail,
      sphere,
      cream,
      [0.19, 0.13, -0.82],
      [0.14, 0.16, 0.24],
      [-0.3, 0.4, 0],
    );
  }
  animate(
    s: Pick<Run, "crashTime" | "heading"> & Partial<Pick<Run, "airborne" | "boost" | "speed">>,
    t: number,
    mode: string,
  ) {
    const menu = !["playing", "paused", "celebrating", "finished"].includes(mode);
    const celebrating = mode === "finished" || mode === "celebrating";
    this.body.position.y =
      s.crashTime > 0
        ? 0
        : celebrating
          ? Math.max(0, Math.sin(t * 7)) * 0.24
          : Math.sin(t * 7) * 0.02 - Math.abs(s.heading) * 0.13;
    this.body.rotation.z = -s.heading * 0.36;
    // A tuck when boosting, a crouch with the knees up in the air.
    const tuck = menu || celebrating || s.crashTime > 0 ? 0 : s.airborne ? 0.55 : (s.boost ?? 0) > 0 ? 0.32 : 0;
    this.tuck += (tuck - this.tuck) * 0.18;
    this.body.rotation.x = this.tuck;
    this.body.position.y -= this.tuck * 0.22;
    this.head.rotation.y = menu
      ? -0.6 + Math.sin(t * 0.7) * 0.1
      : celebrating
        ? 2.5
        : -s.heading * 0.25;
    this.head.rotation.x = Math.sin(t * 2) * 0.025;
    this.tail.rotation.y = Math.sin(t * 5) * 0.16;
    this.arms.forEach((a, i) => {
      a.rotation.z = celebrating
        ? (i ? 1 : -1) * 2.4
        : Math.sin(t * 5 + i) * 0.08 - s.heading * 0.16;
      a.rotation.x = celebrating ? -0.5 : Math.abs(s.heading) * 0.15 - this.tuck * 1.4;
    });
    this.scarf.forEach((bit, i) => {
      bit.position.x =
        -0.3 +
        Math.sin(t * 8 - i * 0.65) * (i + 1) * 0.023 -
        s.heading * i * 0.05;
      bit.position.y = 1.59 + i * 0.045 + Math.sin(t * 7 - i * 0.7) * i * 0.016;
      bit.rotation.y = Math.sin(t * 8 - i * 0.65) * 0.23;
      bit.rotation.z = Math.sin(t * 8 - i * 0.65) * 0.15;
    });
  }
}
