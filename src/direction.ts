import { getFrameInfo, pilotTimeline } from './timeline';

export type DirectionVector = [number, number, number];

export interface DirectionState {
  cameraPosition: DirectionVector;
  cameraTarget: DirectionVector;
  panelPressure: number;
  stormStrength: number;
  explosion: number;
  backroom: number;
  aftermath: number;
  cameraRoll: number;
}

interface CameraKey {
  frame: number;
  position: DirectionVector;
  target: DirectionVector;
  roll: number;
}

type ScalarKey = readonly [frame: number, value: number];

function shot(id: string) {
  const result = pilotTimeline.shots.find((candidate) => candidate.id === id);
  if (!result) throw new Error(`The pilot timeline must define ${id}.`);
  return result;
}

const s01 = shot('S01');
const s02 = shot('S02');
const s03 = shot('S03');
const s04 = shot('S04');
const s05 = shot('S05');
const s06 = shot('S06');
const s07 = shot('S07');
const s08 = shot('S08');
const explosionFrame = pilotTimeline.events.explosion_frame;
const reassemblyStart = pilotTimeline.events.reassembly_start_frame;
const reassemblyEnd = pilotTimeline.events.reassembly_end_frame;
// These are staging fractions of the configured shot/event intervals, not beat claims.
const explosionPeak = explosionFrame + (s04.last_frame_exclusive - explosionFrame) * 0.25;
const rushEnd = explosionFrame + (s04.last_frame_exclusive - explosionFrame) / 3;
const backroomStart = explosionFrame + (s04.last_frame_exclusive - explosionFrame) * 0.5;
const backroomPeak = (s05.first_frame + s05.last_frame_exclusive) / 2;

const cameraKeys: readonly CameraKey[] = [
  { frame: s01.first_frame, position: [0.1, 0.25, 10.9], target: [0, -0.14, 0], roll: 0 },
  { frame: s02.first_frame, position: [0.1, 0.18, 10.2], target: [0, -0.14, 0], roll: 0 },
  { frame: s03.first_frame, position: [0.1, -0.08, 9.4], target: [0, -0.28, 0], roll: 0.012 },
  { frame: s04.first_frame, position: [0.7, -0.1, 8.4], target: [0, -0.14, 0], roll: -0.02 },
  { frame: explosionFrame, position: [0.66, -0.08, 8.1], target: [0, 0.04, 0], roll: -0.025 },
  { frame: rushEnd, position: [0.2, 0.06, 6.2], target: [0, 0.04, 0], roll: 0.04 },
  { frame: s05.first_frame, position: [0.04, 0.15, 5.5], target: [0, 0.04, 0], roll: -0.012 },
  { frame: s06.first_frame, position: [0.04, 0.05, 6.5], target: [0, -0.14, 0], roll: 0 },
  // The target tracks the same root curve used by the character's forward motion.
  { frame: s07.first_frame, position: [0.4, -0.65, 3.5], target: [0.35, -0.14, -3], roll: -0.022 },
  { frame: s08.first_frame, position: [0.55, 0.25, 1.7], target: [0.5, 0.45, -3.6], roll: 0.007 },
  { frame: s08.last_frame_exclusive, position: [0.6, 0.85, 5.8], target: [0.5, -0.14, -3.6], roll: 0 },
];

const pressureKeys: readonly ScalarKey[] = [
  [s01.first_frame, 0],
  [s02.first_frame, 0],
  [s03.first_frame, 1],
  [explosionFrame, 1],
  [s05.first_frame, 0],
  [s06.first_frame, 0],
  [reassemblyEnd, 0.35],
  [s07.first_frame, 0.4],
  [s08.first_frame, 0],
  [s08.last_frame_exclusive, 0],
];

const stormKeys: readonly ScalarKey[] = [
  [s01.first_frame, 0],
  [s02.first_frame, 0],
  [s03.first_frame, 0.18],
  [s04.first_frame, 1],
  [explosionFrame, 1],
  [s05.first_frame, 0.3],
  [s06.first_frame, 0.08],
  [reassemblyEnd, 0.8],
  [s07.first_frame, 0.65],
  [s08.first_frame, 0.12],
  [s08.last_frame_exclusive, 0.04],
];

function smooth(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function ramp(frame: number, first: number, last: number): number {
  return smooth((frame - first) / (last - first));
}

function mix(first: number, last: number, progress: number): number {
  return first + (last - first) * progress;
}

function mixVector(first: DirectionVector, last: DirectionVector, progress: number): DirectionVector {
  return [
    mix(first[0], last[0], progress),
    mix(first[1], last[1], progress),
    mix(first[2], last[2], progress),
  ];
}

function scalarTrack(keys: readonly ScalarKey[], frame: number): number {
  for (let index = 1; index < keys.length; index++) {
    const previous = keys[index - 1];
    const next = keys[index];
    if (frame <= next[0]) {
      return mix(previous[1], next[1], ramp(frame, previous[0], next[0]));
    }
  }
  return keys[keys.length - 1][1];
}

function seedUnit(seed: number): number {
  let hash = (seed ^ 0x9e3779b9) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35) >>> 0;
  return ((hash ^ (hash >>> 16)) >>> 0) / 0x100000000;
}

/** Rebuild the full direction state for any output frame, in any call order. */
export function getDirectionState(frame: number, seed: number): DirectionState {
  const info = getFrameInfo(frame);
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError('Seed must be a uint32 integer.');
  }

  const nextIndex = cameraKeys.findIndex((key) => key.frame > frame);
  const previous = cameraKeys[nextIndex - 1];
  const next = cameraKeys[nextIndex];
  const progress = ramp(frame, previous.frame, next.frame);
  const cameraPosition = mixVector(previous.position, next.position, progress);
  const cameraTarget = mixVector(previous.target, next.target, progress);
  const stormStrength = scalarTrack(stormKeys, frame);
  const seedVariation = seedUnit(seed);
  const amplitude = pilotTimeline.motion.amplitude_scale;
  // A broad, low-frequency arc has zero slope at shot boundaries; it is not jitter.
  const arc = Math.sin(Math.PI * info.shotProgress) ** 2;
  cameraPosition[0] += (seedVariation - 0.5) * 0.08 * amplitude * arc * stormStrength;
  const cameraRoll = Math.max(-0.05, Math.min(0.05,
    mix(previous.roll, next.roll, progress) * (0.8 + seedVariation * 0.2) * amplitude,
  ));

  return {
    cameraPosition,
    cameraTarget,
    panelPressure: scalarTrack(pressureKeys, frame),
    stormStrength,
    explosion: ramp(frame, explosionFrame, explosionPeak) * (1 - ramp(frame, reassemblyStart, reassemblyEnd)),
    backroom: ramp(frame, backroomStart, backroomPeak) * (1 - ramp(frame, reassemblyStart, reassemblyEnd)),
    aftermath: ramp(frame, s07.first_frame, s08.first_frame),
    cameraRoll,
  };
}
