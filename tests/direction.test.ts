import { describe, expect, it } from 'vitest';
import { getDirectionState, type DirectionState, type DirectionVector } from '../src/direction';
import { pilotTimeline } from '../src/timeline';

const seed = pilotTimeline.timing.random_seed;

function shot(id: string) {
  const result = pilotTimeline.shots.find((candidate) => candidate.id === id);
  if (!result) throw new Error(`Missing shot ${id}.`);
  return result;
}

function distance(first: DirectionVector, last: DirectionVector): number {
  return Math.hypot(...first.map((component, index) => last[index] - component));
}

function values(state: DirectionState): number[] {
  return [
    ...state.cameraPosition,
    ...state.cameraTarget,
    state.panelPressure,
    state.stormStrength,
    state.explosion,
    state.backroom,
    state.aftermath,
    state.cameraRoll,
  ];
}

describe('deterministic pilot direction', () => {
  it('keeps every value finite for all 900 frames and bounds all effect signals', () => {
    for (let frame = 0; frame < pilotTimeline.video.total_frames; frame++) {
      const state = getDirectionState(frame, seed);
      expect(values(state).every(Number.isFinite), `finite frame ${frame}`).toBe(true);
      for (const value of [state.panelPressure, state.stormStrength, state.explosion, state.backroom, state.aftermath]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
      expect(Math.abs(state.cameraRoll)).toBeLessThan(0.06);
      expect(distance(state.cameraPosition, state.cameraTarget)).toBeGreaterThan(1);
    }
  });

  it('keeps neighboring camera positions, targets, rolls and signals continuous', () => {
    for (let frame = 1; frame < pilotTimeline.video.total_frames; frame++) {
      const previous = getDirectionState(frame - 1, seed);
      const next = getDirectionState(frame, seed);
      expect(distance(previous.cameraPosition, next.cameraPosition), `position at ${frame}`).toBeLessThan(0.15);
      expect(distance(previous.cameraTarget, next.cameraTarget), `target at ${frame}`).toBeLessThan(0.15);
      expect(Math.abs(previous.cameraRoll - next.cameraRoll)).toBeLessThan(0.01);
      for (const key of ['panelPressure', 'stormStrength', 'explosion', 'backroom', 'aftermath'] as const) {
        expect(Math.abs(previous[key] - next[key]), `${key} at ${frame}`).toBeLessThan(0.1);
      }
    }
  });

  it.each(pilotTimeline.shots.slice(1).map((item) => [item.id, item.first_frame] as const))(
    'has no spatial cut at the %s boundary',
    (_id, frame) => {
      const previous = getDirectionState(frame - 1, seed);
      const next = getDirectionState(frame, seed);
      expect(distance(previous.cameraPosition, next.cameraPosition)).toBeLessThan(0.15);
      expect(distance(previous.cameraTarget, next.cameraTarget)).toBeLessThan(0.15);
      expect(Math.abs(previous.cameraRoll - next.cameraRoll)).toBeLessThan(0.01);
    },
  );

  it('pushes through the initial space, makes a fast spatial rush, then pulls back', () => {
    const first = getDirectionState(0, seed);
    const s04 = getDirectionState(shot('S04').first_frame, seed);
    const s05 = getDirectionState(shot('S05').first_frame, seed);
    const s07 = getDirectionState(shot('S07').first_frame, seed);
    const s08 = getDirectionState(shot('S08').first_frame, seed);
    const last = getDirectionState(pilotTimeline.video.total_frames - 1, seed);
    expect(first.cameraPosition).toEqual([0.1, 0.25, 10.9]);
    expect(first.cameraPosition[2] - s04.cameraPosition[2]).toBeGreaterThan(2);
    expect(s04.cameraPosition[0] - first.cameraPosition[0]).toBeGreaterThan(0.5);
    expect(s04.cameraPosition[2] - s05.cameraPosition[2]).toBeGreaterThan(2.5);
    const explosion = pilotTimeline.events.explosion_frame;
    expect(getDirectionState(explosion, seed).cameraPosition[2] - getDirectionState(explosion + 24, seed).cameraPosition[2]).toBeGreaterThan(1.8);
    expect(s07.cameraTarget).toEqual([0.35, -0.14, -3]);
    expect(s07.cameraPosition[1]).toBeLessThan(-0.5);
    expect(s08.cameraPosition[2]).toBeCloseTo(1.7);
    expect(s08.cameraTarget[2]).toBeCloseTo(-3.6);
    expect(last.cameraPosition[2] - s08.cameraPosition[2]).toBeGreaterThan(4);
    expect(last.cameraPosition[1] - s08.cameraPosition[1]).toBeGreaterThan(0.5);
  });

  it('builds pressure and directed storms, explodes at the event, then reassembles and recedes', () => {
    const s02 = shot('S02');
    const s03 = shot('S03');
    const s04 = shot('S04');
    const s05 = shot('S05');
    const s07 = shot('S07');
    const s08 = shot('S08');
    const { explosion_frame: explosion, reassembly_start_frame: start, reassembly_end_frame: end } = pilotTimeline.events;
    expect(getDirectionState(s02.first_frame, seed).panelPressure).toBe(0);
    expect(getDirectionState(s03.first_frame, seed).panelPressure).toBe(1);
    expect(getDirectionState(s04.first_frame - 1, seed).panelPressure).toBe(1);
    expect(getDirectionState(s04.first_frame, seed).stormStrength).toBe(1);
    expect(getDirectionState(explosion - 1, seed).explosion).toBe(0);
    expect(getDirectionState(explosion, seed).explosion).toBe(0);
    expect(getDirectionState(explosion + 18, seed).explosion).toBe(1);
    expect(getDirectionState(start, seed).explosion).toBe(1);
    expect(getDirectionState(Math.floor((start + end) / 2), seed).explosion).toBeCloseTo(0.5);
    expect(getDirectionState(end, seed).explosion).toBe(0);
    expect(getDirectionState(Math.floor((s05.first_frame + s05.last_frame_exclusive) / 2), seed).backroom).toBe(1);
    expect(getDirectionState(end, seed).backroom).toBe(0);
    expect(getDirectionState(end, seed).stormStrength).toBeGreaterThan(0.7);
    expect(getDirectionState(s07.first_frame, seed).stormStrength).toBeGreaterThan(getDirectionState(s08.first_frame, seed).stormStrength);
    expect(getDirectionState(s08.first_frame, seed).aftermath).toBe(1);
    expect(getDirectionState(pilotTimeline.video.total_frames - 1, seed).stormStrength).toBeGreaterThan(0);
  });

  it('reconstructs identical states after arbitrary jumps and varies the broad arc by seed', () => {
    const frame = Math.floor((shot('S03').first_frame + shot('S03').last_frame_exclusive) / 2);
    const first = getDirectionState(frame, seed);
    [899, 0, 548, 258, 72].forEach((jump) => getDirectionState(jump, seed));
    expect(getDirectionState(frame, seed)).toEqual(first);
    expect(getDirectionState(frame, seed + 1).cameraPosition).not.toEqual(first.cameraPosition);
    // Returned arrays are independent; consumers cannot mutate a future frame.
    first.cameraPosition[0] = 999;
    expect(getDirectionState(frame, seed).cameraPosition[0]).not.toBe(999);
  });

  it.each([-1, 0.5, 900, NaN, Infinity])('rejects invalid frame %s', (frame) => {
    expect(() => getDirectionState(frame, seed)).toThrow(RangeError);
  });

  it.each([-1, 0.5, NaN, Infinity, 0x100000000])('rejects invalid seed %s', (invalidSeed) => {
    expect(() => getDirectionState(0, invalidSeed)).toThrow(RangeError);
  });
});
