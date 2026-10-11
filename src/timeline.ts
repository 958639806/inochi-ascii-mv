import timelineConfig from '../config/pilot.timeline.json';

/** The JSON file is the single source for timing and shot metadata. */
export const pilotTimeline = timelineConfig;

export type PilotTimeline = typeof pilotTimeline;
export type PilotShot = PilotTimeline['shots'][number];

export interface FrameInfo {
  frame: number;
  localSeconds: number;
  sourceSeconds: number;
  shot: PilotShot;
  shotProgress: number;
  implemented: boolean;
}

/** Output frames use a left-closed, right-open range; 900 is an endpoint. */
export function assertOutputFrame(frame: number): void {
  if (
    !Number.isInteger(frame) ||
    frame < 0 ||
    frame >= pilotTimeline.video.total_frames
  ) {
    throw new RangeError(
      `Output frame must be an integer from 0 to ${pilotTimeline.video.total_frames - 1}; received ${frame}.`,
    );
  }
}

/** Query any frame directly, without relying on playback or a previous frame. */
export function getFrameInfo(frame: number): FrameInfo {
  assertOutputFrame(frame);

  const shot = pilotTimeline.shots.find(
    (candidate) =>
      frame >= candidate.first_frame && frame < candidate.last_frame_exclusive,
  );

  if (!shot) {
    throw new RangeError(`No configured shot covers output frame ${frame}.`);
  }

  const localSeconds =
    (frame * pilotTimeline.video.fps_den) / pilotTimeline.video.fps_num;

  return {
    frame,
    localSeconds,
    sourceSeconds: pilotTimeline.audio.source_start_seconds + localSeconds,
    shot,
    shotProgress:
      (frame - shot.first_frame) /
      (shot.last_frame_exclusive - shot.first_frame),
    implemented: true,
  };
}
