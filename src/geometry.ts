import * as THREE from "three";

export const sphere = new THREE.SphereGeometry(1, 12, 8);
export const cone = new THREE.ConeGeometry(1, 1, 7);
export const cylinder = new THREE.CylinderGeometry(1, 1, 1, 7);
export const box = new THREE.BoxGeometry(1, 1, 1);
export const pebble = new THREE.IcosahedronGeometry(1, 0);
export const circle = new THREE.CircleGeometry(1, 16);
export const material = (color: THREE.ColorRepresentation) =>
  new THREE.MeshLambertMaterial({ color });
export function shape(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  pos: number[],
  scale: number[],
  rotation?: number[],
) {
  const obj = new THREE.Mesh(geo, mat);
  obj.position.set(pos[0], pos[1], pos[2]);
  obj.scale.set(scale[0], scale[1], scale[2]);
  if (rotation) obj.rotation.set(rotation[0], rotation[1], rotation[2]);
  parent.add(obj);
  return obj;
}
export function rod(
  parent: THREE.Object3D,
  a: THREE.Vector3,
  b: THREE.Vector3,
  radius: number,
  mat: THREE.Material,
) {
  const obj = new THREE.Mesh(cylinder, mat);
  obj.position.copy(a).add(b).multiplyScalar(0.5);
  obj.scale.set(radius, a.distanceTo(b), radius);
  obj.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    b.clone().sub(a).normalize(),
  );
  parent.add(obj);
  return obj;
}
export function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
