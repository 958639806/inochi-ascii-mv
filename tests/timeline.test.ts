import { describe, expect, it } from 'vitest';
import { assertOutputFrame, getFrameInfo, pilotTimeline } from '../src/timeline';

describe('pilot timeline', () => {
  it('covers all 900 output frames exactly once, without gaps or overlaps', () => {
    expect(pilotTimeline.video.total_frames).toBe(900);
    expect(pilotTimeline.shots[0].first_frame).toBe(0);
    expect(
      pilotTimeline.shots[pilotTimeline.shots.length - 1].last_frame_exclusive,
    ).toBe(900);

    for (const [index, shot] of pilotTimeline.shots.entries()) {
      expect(shot.last_frame_exclusive).toBeGreaterThan(shot.first_frame);
      if (index > 0) {
        expect(shot.first_frame).toBe(
          pilotTimeline.shots[index - 1].last_frame_exclusive,
        );
      }
    }

    for (let frame = 0; frame < pilotTimeline.video.total_frames; frame += 1) {
      const coveringShots = pilotTimeline.shots.filter(
        (shot) => frame >= shot.first_frame && frame < shot.last_frame_exclusive,
      );
      expect(coveringShots, `unique ownership for frame ${frame}`).toHaveLength(1);
      expect(getFrameInfo(frame).shot).toBe(coveringShots[0]);
    }
  });

  it.each([
    [0, 'S01'],
    [71, 'S01'],
    [72, 'S02'],
    [149, 'S02'],
    [150, 'S03'],
    [239, 'S03'],
    [240, 'S04'],
    [329, 'S04'],
    [330, 'S05'],
    [419, 'S05'],
    [420, 'S06'],
    [569, 'S06'],
    [570, 'S07'],
    [707, 'S07'],
    [708, 'S08'],
    [899, 'S08'],
  ] as const)('assigns boundary frame %i to %s', (frame, shotId) => {
    expect(getFrameInfo(frame).shot.id).toBe(shotId);
  });

  it.each([0, 36, 71])('marks the initial render frame %i as S01 implemented', (frame) => {
    const info = getFrameInfo(frame);
    expect(info.frame).toBe(frame);
    expect(info.shot.id).toBe('S01');
    expect(info.implemented).toBe(true);
  });

  it('reports progress from the configured shot interval and keeps it below 1', () => {
    for (let frame = 0; frame < pilotTimeline.video.total_frames; frame += 1) {
      const info = getFrameInfo(frame);
      expect(info.shotProgress).toBe(
        (frame - info.shot.first_frame) /
          (info.shot.last_frame_exclusive - info.shot.first_frame),
      );
      expect(info.shotProgress).toBeGreaterThanOrEqual(0);
      expect(info.shotProgress).toBeLessThan(1);
    }

    expect(getFrameInfo(36).shotProgress).toBe(0.5);
    for (const shot of pilotTimeline.shots) {
      expect(getFrameInfo(shot.first_frame).shotProgress).toBe(0);
    }
  });

  it('keeps trimmed audio at local zero and maps source time to 58 + frame/60', () => {
    expect(pilotTimeline.audio.playback_offset_seconds).toBe(0);
    expect(getFrameInfo(0).localSeconds).toBe(0);
    expect(getFrameInfo(0).sourceSeconds).toBe(58);

    for (let frame = 0; frame < pilotTimeline.video.total_frames; frame += 1) {
      const info = getFrameInfo(frame);
      expect(info.localSeconds).toBe(frame / 60);
      expect(info.sourceSeconds).toBe(58 + frame / 60);
    }
  });

  it('marks the eight animated blockout shots as implemented', () => {
    for (let frame = 0; frame < pilotTimeline.video.total_frames; frame += 1) {
      expect(getFrameInfo(frame).implemented).toBe(true);
    }
  });

  it('keeps draft explosion and reassembly events inside their shots', () => {
    expect(getFrameInfo(pilotTimeline.events.explosion_frame).shot.id).toBe('S04');
    expect(getFrameInfo(pilotTimeline.events.reassembly_start_frame).shot.id).toBe('S06');
    expect(getFrameInfo(pilotTimeline.events.reassembly_end_frame).shot.id).toBe('S06');
    expect(pilotTimeline.events.reassembly_end_frame).toBeGreaterThan(pilotTimeline.events.reassembly_start_frame);
    expect(pilotTimeline.timing.beat_phase_verified).toBe(false);
  });

  it('returns the same metadata when queried in an arbitrary order', () => {
    const first = getFrameInfo(36);
    [899, 0, 420, 71, 240].forEach(getFrameInfo);
    expect(getFrameInfo(36)).toEqual(first);
  });

  it.each([NaN, Infinity, -Infinity, -1, -0.5, 0.5, 899.5, 900, 901])(
    'rejects invalid output frame %s',
    (frame) => {
      expect(() => assertOutputFrame(frame)).toThrow(RangeError);
      expect(() => getFrameInfo(frame)).toThrow(RangeError);
    },
  );
});
