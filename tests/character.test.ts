import { describe, expect, it } from 'vitest';
import { characterIdHash, createBodySamples, noise, sampleCharacterFrame } from '../src/character';
import { pilotTimeline } from '../src/timeline';

describe('fixed character samples and frame reconstruction', () => {
  const samples = createBodySamples();
  it('has unique stable IDs for the recognizable anatomical parts', () => {
    expect(new Set(samples.map((point) => point.id)).size).toBe(samples.length);
    expect(characterIdHash(createBodySamples())).toBe(characterIdHash(samples));
    expect(new Set(samples.map((point) => point.part)).size).toBe(9);
    expect(samples.length).toBe(1426);
    expect(characterIdHash(samples)).toBe('149d2e90');
  });
  it('reconstructs the same frame after arbitrary jumps and seed changes', () => {
    const first = sampleCharacterFrame(samples, 36, 958639806);
    sampleCharacterFrame(samples, 71, 17);
    sampleCharacterFrame(samples, 0, 958639806);
    expect(sampleCharacterFrame(samples, 36, 958639806)).toEqual(first);
    expect(sampleCharacterFrame(samples, 36, 17).positions).not.toEqual(first.positions);
  });
  it('keeps all 900 frames finite without deleting or resampling body IDs', () => {
    for (let frame = 0; frame < pilotTimeline.video.total_frames; frame++) {
      const state = sampleCharacterFrame(samples, frame, 958639806);
      expect(state.finite).toBe(true);
      expect(state.positions.length).toBe(samples.length * 3);
      expect(state.bounds.min.every(Number.isFinite)).toBe(true);
      expect(state.bounds.max.every(Number.isFinite)).toBe(true);
      expect(state.rootPosition.every(Number.isFinite)).toBe(true);
      expect(state.dispersion).toBeGreaterThanOrEqual(0);
      expect(state.dispersion).toBeLessThanOrEqual(1);
      expect(state.reassembly).toBeGreaterThanOrEqual(0);
      expect(state.reassembly).toBeLessThanOrEqual(1);
    }
    expect(() => sampleCharacterFrame(samples, 900, 958639806)).toThrow(RangeError);
  });
  it('gives S01 substantial upper-body motion while keeping the feet planted', () => {
    const frames = Array.from({ length: 72 }, (_, frame) => sampleCharacterFrame(samples, frame, 958639806));
    const maxXYRange = (part: string) => {
      let maximum = 0;
      samples.forEach((sample, index) => {
        if (!sample.part.startsWith(part)) return;
        const xs = frames.map((state) => state.positions[index * 3]);
        const ys = frames.map((state) => state.positions[index * 3 + 1]);
        maximum = Math.max(maximum, Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)));
      });
      return maximum;
    };
    // At the original 960x540 S01 camera the torso moves more than ten pixels.
    expect(maxXYRange('torso')).toBeGreaterThan(0.15);
    expect(maxXYRange('torso')).toBeLessThan(0.40);
    expect(maxXYRange('head')).toBeGreaterThan(0.15);
    expect(maxXYRange('head')).toBeLessThan(0.45);
    expect(maxXYRange('arm')).toBeGreaterThan(0.25);
    expect(maxXYRange('arm')).toBeLessThan(0.65);
    expect(maxXYRange('foot')).toBe(0);
    expect(maxXYRange('leg')).toBe(0);
    for (const state of frames) expect(state.finite).toBe(true);
  });
  it('explodes the same samples over a broad span and leaves the original chest IDs as a core', () => {
    const fractured = sampleCharacterFrame(samples, 310, 958639806);
    const core = sampleCharacterFrame(samples, 375, 958639806);
    expect(fractured.bodyMode).toBe('fractured');
    expect(fractured.dispersion).toBe(1);
    expect(fractured.bounds.max[0] - fractured.bounds.min[0]).toBeGreaterThan(6);
    expect(fractured.bounds.max[0] - fractured.bounds.min[0]).toBeLessThan(11);
    expect(core.bodyMode).toBe('core');
    expect(Array.from(core.brightness).filter((light) => light < 0.1).length / samples.length).toBeGreaterThan(0.9);
    const coreIndices = samples.flatMap((sample, index) => sample.part === 'torso' && Math.hypot(sample.position[0] * 1.3, sample.position[1] - 0.37) < 0.25 ? [index] : []);
    expect(coreIndices.length).toBeGreaterThan(10);
    for (const index of coreIndices) {
      expect(Math.abs(core.positions[index * 3])).toBeLessThan(0.25);
      expect(Math.abs(core.positions[index * 3 + 1] - 0.32)).toBeLessThan(0.2);
      expect(core.brightness[index]).toBeGreaterThan(0.3);
    }
  });
  it('reassembles in order, retains about five percent dim gaps and advances through space', () => {
    const start = sampleCharacterFrame(samples, pilotTimeline.events.reassembly_start_frame, 958639806);
    const middle = sampleCharacterFrame(samples, 495, 958639806);
    const end = sampleCharacterFrame(samples, pilotTimeline.events.reassembly_end_frame, 958639806);
    const stride = sampleCharacterFrame(samples, 708, 958639806);
    expect(start.reassembly).toBe(0);
    expect(middle.reassembly).toBeGreaterThan(0.3);
    expect(middle.reassembly).toBeLessThan(1);
    expect(middle.bodyMode).toBe('reforming');
    expect(end.reassembly).toBe(1);
    expect(end.dispersion).toBe(0);
    expect(end.bodyMode).toBe('active');
    const gaps = Array.from(end.brightness).filter((light) => light < 0.09).length / samples.length;
    expect(gaps).toBeGreaterThan(0.035);
    expect(gaps).toBeLessThan(0.07);
    expect(stride.rootPosition).toEqual([0.5, 0, -3.6]);
    expect(sampleCharacterFrame(samples, 899, 958639806).rootPosition).toEqual(stride.rootPosition);
    expect(end.positions).not.toEqual(start.positions);
  });
  it('has no pose resets at shot boundaries or the configured fracture/reassembly events', () => {
    const boundaries = [...pilotTimeline.shots.slice(1).map((shot) => shot.first_frame), pilotTimeline.events.explosion_frame, pilotTimeline.events.reassembly_end_frame];
    for (const boundary of boundaries) {
      const before = sampleCharacterFrame(samples, boundary - 1, 958639806);
      const after = sampleCharacterFrame(samples, boundary, 958639806);
      let largestStep = 0;
      for (let index = 0; index < samples.length; index++) {
        largestStep = Math.max(largestStep, Math.hypot(...[0, 1, 2].map((axis) => after.positions[index * 3 + axis] - before.positions[index * 3 + axis])));
      }
      expect(largestStep, `boundary frame ${boundary}`).toBeLessThan(0.25);
    }
  });
  it('reconstructs fracture and reassembly frames identically after arbitrary jumps', () => {
    for (const frame of [258, 285, 375, 495, 548, 639, 899]) {
      const initial = sampleCharacterFrame(samples, frame, 958639806);
      sampleCharacterFrame(samples, 17, 123);
      sampleCharacterFrame(samples, 804, 17);
      expect(sampleCharacterFrame(samples, frame, 958639806)).toEqual(initial);
    }
  });
  it('does not rely on a mutable random generator', () => {
    expect(noise(958639806, 100)).toBe(noise(958639806, 100));
    expect(noise(958639806, 100)).not.toBe(noise(958639806, 101));
  });
});
