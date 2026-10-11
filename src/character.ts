import { assertOutputFrame, pilotTimeline } from './timeline';

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
  dispersion: number;
  reassembly: number;
  rootPosition: [number, number, number];
  bodyMode: 'intact' | 'fractured' | 'core' | 'reforming' | 'active';
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

const shot = (id: string) => {
  const found = pilotTimeline.shots.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`The pilot timeline must define ${id}.`);
  return found;
};
const S01 = shot('S01');
const S02 = shot('S02');
const S03 = shot('S03');
const S04 = shot('S04');
const S05 = shot('S05');
const S06 = shot('S06');
const S07 = shot('S07');
const S08 = shot('S08');
const smooth = (value: number) => {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
};
const ramp = (frame: number, start: number, end: number) => smooth((frame - start) / (end - start));
const inside = (s: typeof S01, fraction: number) => s.first_frame + (s.last_frame_exclusive - s.first_frame) * fraction;

interface Pose { frame: number; crouch: number; lean: number; guard: number; push: number; head: number }
const poseKeys: Pose[] = [
  { frame: S01.first_frame, crouch: 0, lean: 0.02, guard: 0, push: 0, head: 0.12 },
  { frame: S02.first_frame, crouch: 0, lean: 0.04, guard: 0, push: 0, head: 0.12 },
  { frame: inside(S02, 0.4), crouch: 0.65, lean: -0.18, guard: 1, push: 0, head: 0.9 },
  { frame: S03.first_frame, crouch: 0.65, lean: -0.18, guard: 1, push: 0, head: 0.9 },
  { frame: inside(S03, 0.45), crouch: 0.2, lean: 0.10, guard: 0.1, push: 1, head: -0.2 },
  { frame: S04.first_frame, crouch: 0.1, lean: -0.12, guard: 0, push: 1, head: -0.3 },
  { frame: pilotTimeline.events.explosion_frame, crouch: 0.72, lean: 0.15, guard: 0.5, push: 0.4, head: 0.8 },
  { frame: S05.first_frame, crouch: 0.72, lean: 0.15, guard: 0.5, push: 0.4, head: 0.8 },
  { frame: S06.first_frame, crouch: 0.72, lean: 0.15, guard: 0.5, push: 0.4, head: 0.8 },
  { frame: inside(S06, 0.33), crouch: 0.4, lean: -0.16, guard: 0.15, push: 0.4, head: 0.4 },
  { frame: inside(S06, 0.60), crouch: 0.1, lean: -0.15, guard: 0, push: 1, head: -0.1 },
  { frame: pilotTimeline.events.reassembly_end_frame, crouch: 0.05, lean: -0.11, guard: 0, push: 0.7, head: 0.2 },
  { frame: S07.first_frame, crouch: 0.05, lean: -0.1, guard: 0, push: 0.65, head: 0.2 },
  { frame: inside(S07, 0.44), crouch: 0.15, lean: -0.08, guard: 0, push: 0.2, head: 0.45 },
  { frame: S08.first_frame, crouch: 0.1, lean: 0.06, guard: 0, push: 0, head: 0.25 },
  { frame: inside(S08, 0.38), crouch: 0.08, lean: 0, guard: 0, push: 0, head: 0.2 },
  { frame: S08.last_frame_exclusive - 1, crouch: 0.04, lean: 0.02, guard: 0, push: 0, head: 0.12 },
];

function poseAt(frame: number): Pose {
  let index = 0;
  while (index < poseKeys.length - 2 && frame > poseKeys[index + 1].frame) index++;
  const from = poseKeys[index];
  const to = poseKeys[index + 1];
  const blend = ramp(frame, from.frame, to.frame);
  const mix = (a: number, b: number) => a + (b - a) * blend;
  return { frame, crouch: mix(from.crouch, to.crouch), lean: mix(from.lean, to.lean), guard: mix(from.guard, to.guard), push: mix(from.push, to.push), head: mix(from.head, to.head) };
}

/** Every shot, gesture and fragment is evaluated from a global frame and stable ID. */
export function sampleCharacterFrame(samples: readonly BodySample[], frame: number, seed: number): CharacterFrame {
  assertOutputFrame(frame);
  const t = frame * pilotTimeline.video.fps_den / pilotTimeline.video.fps_num;
  const amplitude = pilotTimeline.motion.amplitude_scale;
  const pose = poseAt(frame);
  const phase = noise(seed, 0) * Math.PI * 2;
  const breath = Math.sin(t * 2.6 + phase);
  const aftermath = ramp(frame, S08.first_frame, S08.last_frame_exclusive - 1);
  const breathingScale = amplitude * (1 - aftermath * 0.43);
  const advance = ramp(frame, S06.first_frame, S07.first_frame);
  const lastStep = ramp(frame, S07.first_frame, S08.first_frame);
  const rootPosition: [number, number, number] = [0.35 * advance + 0.15 * lastStep, 0, -3 * advance - 0.6 * lastStep];
  const burst = ramp(frame, pilotTimeline.events.explosion_frame, inside(S04, 0.70));
  const reassembly = ramp(frame, pilotTimeline.events.reassembly_start_frame, pilotTimeline.events.reassembly_end_frame);
  const dispersion = burst * (1 - reassembly);
  const backroom = ramp(frame, inside(S04, 0.78), inside(S05, 0.2));
  const walkEnvelope = ramp(frame, inside(S06, 0.25), inside(S06, 0.4)) * (1 - ramp(frame, inside(S07, 0.88), inside(S08, 0.12)));
  const bodyMode: CharacterFrame['bodyMode'] = frame < pilotTimeline.events.explosion_frame ? 'intact'
    : frame < S05.first_frame ? 'fractured'
      : frame < pilotTimeline.events.reassembly_start_frame ? 'core'
        : frame < pilotTimeline.events.reassembly_end_frame ? 'reforming' : 'active';
  const torsoPoint = (rx: number, ry: number, rz: number): [number, number, number] => {
    const upper = smooth((ry + 0.65) / 1.53);
    const chest = Math.max(0, 1 - Math.abs(ry - 0.34) / 0.9);
    return [
      rx * (1 + breath * 0.08 * upper * breathingScale) * (1 - pose.crouch * 0.08) + (pose.lean + Math.sin(t * 2.1 + phase) * 0.09 * breathingScale) * upper,
      ry - pose.crouch * 0.65 * upper + breath * 0.10 * upper * breathingScale,
      rz * (1 + breath * 0.13 * chest * breathingScale) + pose.crouch * 0.28 * upper,
    ];
  };
  const neckAnchor = torsoPoint(0, 0.85, 0);
  const shoulders = { left: torsoPoint(-0.61, 0.78, 0), right: torsoPoint(0.61, 0.78, 0) };
  const positions = new Float32Array(samples.length * 3);
  const brightness = new Float32Array(samples.length);
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  let finite = true;
  samples.forEach((sample, index) => {
    const [restX, restY, restZ] = sample.position;
    let x = restX;
    let y = restY;
    let z = restZ;
    if (sample.part === 'torso') {
      [x, y, z] = torsoPoint(restX, restY, restZ);
    } else if (sample.part.startsWith('arm')) {
      const side = sample.part === 'arm-left' ? -1 : 1;
      const pivotX = side * 0.61;
      const elbowX = side < 0 ? -0.86 : 0.84;
      const elbowY = side < 0 ? -0.05 : -0.08;
      const angle = side * (-pose.guard * 2.0 + pose.push * (1.15 + Math.sin(t * 6.8 + side * 0.8) * 0.26) + breath * 0.075 * breathingScale);
      const forearmAngle = angle + side * (pose.guard * 4.0 + pose.push * 0.2);
      const anchor = side < 0 ? shoulders.left : shoulders.right;
      const relativeX = restX - pivotX;
      const relativeY = restY - 0.78;
      const upperX = anchor[0] + relativeX * Math.cos(angle) - relativeY * Math.sin(angle);
      const upperY = anchor[1] + relativeX * Math.sin(angle) + relativeY * Math.cos(angle);
      const elbowWorldX = anchor[0] + (elbowX - pivotX) * Math.cos(angle) - (elbowY - 0.78) * Math.sin(angle);
      const elbowWorldY = anchor[1] + (elbowX - pivotX) * Math.sin(angle) + (elbowY - 0.78) * Math.cos(angle);
      const forearmX = elbowWorldX + (restX - elbowX) * Math.cos(forearmAngle) - (restY - elbowY) * Math.sin(forearmAngle);
      const forearmY = elbowWorldY + (restX - elbowX) * Math.sin(forearmAngle) + (restY - elbowY) * Math.cos(forearmAngle);
      const elbowBlend = smooth((elbowY + 0.13 - restY) / 0.26);
      x = upperX + (forearmX - upperX) * elbowBlend;
      y = upperY + (forearmY - upperY) * elbowBlend;
      z = restZ + anchor[2] + pose.guard * 0.40 - pose.push * 0.42 * smooth((0.78 - restY) / 1.6);
    } else if (sample.part === 'head' || sample.part === 'neck') {
      const neckBlend = sample.part === 'neck' ? smooth((restY - 0.85) / 0.2) : 1;
      const pitch = (pose.head + breath * 0.12 * breathingScale) * neckBlend;
      const relativeY = restY - 0.85;
      x = neckAnchor[0] + restX + breath * 0.025 * relativeY * breathingScale;
      y = neckAnchor[1] + relativeY * Math.cos(pitch) - restZ * Math.sin(pitch);
      z = neckAnchor[2] + relativeY * Math.sin(pitch) + restZ * Math.cos(pitch);
    } else if (sample.part.startsWith('leg') || sample.part.startsWith('foot')) {
      const side = sample.part.endsWith('left') ? -1 : 1;
      const gait = Math.sin((t - S06.local_start_seconds) * 7.4 + (side > 0 ? Math.PI : 0)) * 0.48 * walkEnvelope * amplitude;
      const relativeY = restY + 0.59;
      y = -0.59 + relativeY * Math.cos(gait) - restZ * Math.sin(gait);
      z = relativeY * Math.sin(gait) + restZ * Math.cos(gait);
    }
    x += rootPosition[0];
    y += rootPosition[1];
    z += rootPosition[2];

    const core = sample.part === 'torso' && Math.hypot(restX * 1.3, restY - 0.37) < 0.25;
    const returnDelay = core ? 0 : sample.part === 'torso' ? 0.03 : sample.part.startsWith('arm') ? 0.22 : sample.part === 'head' || sample.part === 'neck' ? 0.36 : 0.12;
    const returnStart = pilotTimeline.events.reassembly_start_frame + returnDelay * (pilotTimeline.events.reassembly_end_frame - pilotTimeline.events.reassembly_start_frame);
    const returned = ramp(frame, returnStart, pilotTimeline.events.reassembly_end_frame);
    const scatteredWeight = burst * (1 - returned);
    const burstTime = Math.max(0, (frame - pilotTimeline.events.explosion_frame) * pilotTimeline.video.fps_den / pilotTimeline.video.fps_num);
    const angle = Math.atan2(restY - 0.35, restX * 1.2) + burstTime * 0.72 + (noise(seed, index + 17000) - 0.5) * 0.32;
    const radius = (2.3 + noise(seed, index + 18000) * 1.4 + Math.abs(restY - 0.35) * 0.25) * amplitude;
    const scatterX = core ? restX * 0.45 + Math.sin(t * 3 + phase) * 0.06 : restX + Math.cos(angle) * radius;
    const scatterY = core ? 0.32 + (restY - 0.37) * 0.45 + Math.sin(t * 2.6 + phase) * 0.055 : restY + Math.sin(angle) * radius * 0.68;
    const scatterZ = core ? restZ * 0.4 - 0.15 : restZ - (2.7 + noise(seed, index + 19000) * 2.1 + burstTime * 0.22) * amplitude;
    x += (scatterX - x) * scatteredWeight;
    y += (scatterY - y) * scatteredWeight;
    z += (scatterZ - z) * scatteredWeight;
    positions.set([x, y, z], index * 3);
    const chestDistance = Math.hypot(restX * 1.3, restY - 0.37);
    const pulse = Math.max(0, 1 - chestDistance / 0.4) * (0.07 + (breath + 1) * 0.035);
    const intactLight = (sample.front ? 0.62 : 0.25) + noise(seed, index + 10) * 0.23 + pulse;
    const fragmentLight = core ? 0.32 + (breath + 1) * 0.10 : (0.82 + noise(seed, index + 21000) * 0.13) * (1 - backroom) + (0.045 + noise(seed, index + 21000) * 0.025) * backroom;
    brightness[index] = intactLight + (fragmentLight - intactLight) * scatteredWeight;
    if (noise(seed, index + 22000) < 0.05) brightness[index] *= 1 - reassembly * 0.94;
    for (let axis = 0; axis < 3; axis++) {
      const value = positions[index * 3 + axis];
      bounds.min[axis] = Math.min(bounds.min[axis], value);
      bounds.max[axis] = Math.max(bounds.max[axis], value);
      finite &&= Number.isFinite(value);
    }
    finite &&= Number.isFinite(brightness[index]);
  });
  return { positions, brightness, bounds, finite, dispersion, reassembly, rootPosition, bodyMode };
}
