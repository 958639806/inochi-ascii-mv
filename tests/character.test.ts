import { describe, expect, it } from 'vitest';
import { characterIdHash, createBodySamples, noise, sampleCharacterFrame } from '../src/character';

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
  it('keeps every point and all bounds finite at the first, middle and last S01 frames', () => {
    for (const frame of [0, 36, 71]) {
      const state = sampleCharacterFrame(samples, frame, 958639806);
      expect(state.finite).toBe(true);
      expect(state.positions.length).toBe(samples.length * 3);
      expect(state.bounds.min.every(Number.isFinite)).toBe(true);
      expect(state.bounds.max.every(Number.isFinite)).toBe(true);
      expect(state.bounds.max[1] - state.bounds.min[1]).toBeGreaterThan(3.8);
    }
  });
  it('retains the S01 end pose for unimplemented shots', () => {
    expect(sampleCharacterFrame(samples, 899, 958639806)).toEqual(sampleCharacterFrame(samples, 71, 958639806));
  });
  it('has visible but restrained shoulder, head and arm motion with planted feet', () => {
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
    // At the 960x540 S01 camera these ranges are several pixels, not subpixel drift.
    expect(maxXYRange('torso')).toBeGreaterThan(0.035);
    expect(maxXYRange('torso')).toBeLessThan(0.08);
    expect(maxXYRange('head')).toBeGreaterThan(0.035);
    expect(maxXYRange('head')).toBeLessThan(0.08);
    expect(maxXYRange('arm')).toBeGreaterThan(0.06);
    expect(maxXYRange('arm')).toBeLessThan(0.12);
    expect(maxXYRange('foot')).toBe(0);
    expect(maxXYRange('leg')).toBe(0);
    for (const state of frames) expect(state.finite).toBe(true);
  });
  it('does not rely on a mutable random generator', () => {
    expect(noise(958639806, 100)).toBe(noise(958639806, 100));
    expect(noise(958639806, 100)).not.toBe(noise(958639806, 101));
  });
});
