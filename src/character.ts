import { pilotTimeline } from './timeline';

const s01 = pilotTimeline.shots.find((shot) => shot.id === 'S01');
if (!s01) throw new Error('The pilot timeline must define S01.');
const S01_LAST_FRAME = s01.last_frame_exclusive - 1;

/** Stable body samples. IDs and rest positions do not depend on playback or seed. */
export type BodyPart = 'head' | 'neck' | 'torso' | 'arm-left' | 'arm-right' | 'leg-left' | 'leg-right' | 'foot-left' | 'foot-right';

export interface BodySample {
  id: string;
  part: BodyPart;
  position: readonly [number, number, number];
  front: boolean;
}

export interface CharacterFrame {
  positions: Float32Array;
  brightness: Float32Array;
  bounds: { min: number[]; max: number[] };
  finite: boolean;
}

/** Integer hash, independent of global RNG and call order. */
export function noise(seed: number, index: number): number {
  let value = (seed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  return ((value ^ (value >>> 15)) >>> 0) / 4294967296;
}

export function createBodySamples(): readonly BodySample[] {
  const samples: BodySample[] = [];
  const counts = new Map<BodyPart, number>();
  const add = (part: BodyPart, x: number, y: number, z: number, front: boolean) => {
    const index = counts.get(part) ?? 0;
    counts.set(part, index + 1);
    samples.push({ id: `${part}:${index.toString().padStart(4, '0')}`, part, position: [x, y, z], front });
  };

  // Front/back surface grids retain a readable silhouette without a filled mesh.
  const ellipsoid = (part: BodyPart, center: number[], radius: number[]) => {
    const rows = Math.ceil((radius[1] * 2) / 0.075);
    for (let row = 1; row < rows; row++) {
      const v = (row / rows) * 2 - 1;
      const halfWidth = radius[0] * Math.sqrt(1 - v * v);
      const columns = Math.max(2, Math.round((halfWidth * 2) / 0.071));
      for (let column = 0; column <= columns; column++) {
        const u = (column / columns) * 2 - 1;
        const depth = radius[2] * Math.sqrt(Math.max(0, 1 - v * v)) * Math.sqrt(Math.max(0, 1 - u * u));
        add(part, center[0] + u * halfWidth, center[1] + v * radius[1], center[2] + depth, true);
        if (column > 0 && column < columns) add(part, center[0] + u * halfWidth, center[1] + v * radius[1], center[2] - depth, false);
      }
    }
  };
  const limb = (part: BodyPart, start: number[], end: number[], startRadius: number, endRadius: number) => {
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const length = Math.hypot(dx, dy);
    const rows = Math.ceil(length / 0.073);
    const normal = [-dy / length, dx / length];
    for (let row = 0; row <= rows; row++) {
      const t = row / rows;
      const radius = startRadius + (endRadius - startRadius) * t;
      const columns = Math.max(2, Math.round((radius * 2) / 0.071));
      for (let column = 0; column <= columns; column++) {
        const u = (column / columns) * 2 - 1;
        const x = start[0] + dx * t + normal[0] * radius * u;
        const y = start[1] + dy * t + normal[1] * radius * u;
        const z = start[2] + (end[2] - start[2]) * t;
        const depth = radius * 0.8 * Math.sqrt(Math.max(0, 1 - u * u));
        add(part, x, y, z + depth, true);
        if (column > 0 && column < columns) add(part, x, y, z - depth, false);
      }
    }
  };

  ellipsoid('head', [-0.035, 1.365, 0.035], [0.29, 0.37, 0.265]);
  limb('neck', [-0.025, 1.05, 0], [0, 0.85, 0], 0.11, 0.13);
  const torsoRows = 21;
  for (let row = 0; row <= torsoRows; row++) {
    const t = row / torsoRows;
    const y = 0.88 - t * 1.53;
    // Broad shoulders, narrow waist, then a small hip flare.
    const width = t < 0.68 ? 0.59 - t * 0.37 : 0.338 + (t - 0.68) * 0.35;
    const columns = Math.round((width * 2) / 0.071);
    for (let column = 0; column <= columns; column++) {
      const u = (column / columns) * 2 - 1;
      const depth = (0.23 - t * 0.04) * Math.sqrt(Math.max(0, 1 - u * u));
      add('torso', u * width, y, depth, true);
      if (column > 0 && column < columns) add('torso', u * width, y, -depth, false);
    }
  }
  limb('arm-left', [-0.61, 0.78, 0], [-0.86, -0.05, 0.025], 0.145, 0.105);
  limb('arm-left', [-0.86, -0.05, 0.025], [-0.91, -0.86, 0.095], 0.105, 0.075);
  limb('arm-right', [0.61, 0.78, 0], [0.84, -0.08, -0.01], 0.145, 0.105);
  limb('arm-right', [0.84, -0.08, -0.01], [0.90, -0.88, 0.09], 0.105, 0.075);
  limb('leg-left', [-0.235, -0.59, 0], [-0.27, -1.36, 0.015], 0.18, 0.135);
  limb('leg-left', [-0.27, -1.36, 0.015], [-0.29, -2.12, 0.03], 0.135, 0.105);
  limb('leg-right', [0.235, -0.59, 0], [0.28, -1.36, -0.025], 0.18, 0.135);
  limb('leg-right', [0.28, -1.36, -0.025], [0.315, -2.12, -0.01], 0.135, 0.105);
  ellipsoid('foot-left', [-0.32, -2.15, 0.12], [0.15, 0.095, 0.27]);
  ellipsoid('foot-right', [0.35, -2.15, 0.09], [0.15, 0.095, 0.27]);
  return samples;
}

export function characterIdHash(samples: readonly BodySample[]): string {
  let hash = 2166136261;
  for (const sample of samples) {
    for (const letter of sample.id) hash = Math.imul(hash ^ letter.charCodeAt(0), 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Each frame is rebuilt from rest positions; S02–S08 deliberately retain S01's end pose. */
export function sampleCharacterFrame(samples: readonly BodySample[], frame: number, seed: number): CharacterFrame {
  const t = Math.max(0, Math.min(S01_LAST_FRAME, frame)) * pilotTimeline.video.fps_den / pilotTimeline.video.fps_num;
  const phase = noise(seed, 0) * Math.PI * 2;
  const breath = Math.sin(t * 2.1 + phase);
  const positions = new Float32Array(samples.length * 3);
  const brightness = new Float32Array(samples.length);
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  let finite = true;
  samples.forEach((sample, index) => {
    const [restX, restY, restZ] = sample.position;
    const chestWeight = Math.max(0, 1 - Math.abs(restY - 0.34) / 0.9);
    let x = restX;
    let y = restY;
    let z = restZ;
    if (sample.part === 'torso' || sample.part.startsWith('arm')) {
      x *= 1 + breath * 0.012 * chestWeight;
      y += breath * 0.011 * chestWeight;
      z += breath * 0.018 * chestWeight * (sample.front ? 1 : -1);
    } else if (sample.part === 'head' || sample.part === 'neck') {
      y += breath * 0.008;
      x += Math.sin(t * 0.9 + phase) * 0.005;
    }
    positions.set([x, y, z], index * 3);
    const chestDistance = Math.hypot(restX * 1.3, restY - 0.37);
    const pulse = Math.max(0, 1 - chestDistance / 0.4) * (0.07 + (breath + 1) * 0.035);
    brightness[index] = (sample.front ? 0.62 : 0.25) + noise(seed, index + 10) * 0.23 + pulse;
    for (let axis = 0; axis < 3; axis++) {
      const value = positions[index * 3 + axis];
      bounds.min[axis] = Math.min(bounds.min[axis], value);
      bounds.max[axis] = Math.max(bounds.max[axis], value);
      finite &&= Number.isFinite(value);
    }
    finite &&= Number.isFinite(brightness[index]);
  });
  return { positions, brightness, bounds, finite };
}
