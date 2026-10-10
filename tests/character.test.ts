import { describe, expect, it } from 'vitest';
import { characterIdHash, createBodySamples, noise, sampleCharacterFrame } from '../src/character';

describe('fixed character samples and frame reconstruction', () => {
  const samples = createBodySamples();
  it('has unique stable IDs for the recognizable anatomical parts', () => {
    expect(new Set(samples.map((point) => point.id)).size).toBe(samples.length);
    expect(characterIdHash(createBodySamples())).toBe(characterIdHash(samples));
    expect(new Set(samples.map((point) => point.part)).size).toBe(9);
    expect(samples.length).toBeGreaterThan(1000);
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
  it('does not rely on a mutable random generator', () => {
    expect(noise(958639806, 100)).toBe(noise(958639806, 100));
    expect(noise(958639806, 100)).not.toBe(noise(958639806, 101));
  });
});
