/**
 * Stable dual-take identity. Audio always lives on `backUri`; layout at stop
 * time is `frontIsPrimary`. Parents map to primary/secondary for the feed.
 */
export type DualTake = {
  /** Back-camera file — always the audio-bearing clip. */
  backUri: string;
  /** Front-camera file — always silent. */
  frontUri: string;
  /** Whether the front camera was full-screen when recording stopped. */
  frontIsPrimary: boolean;
};

export type DualCamPhase =
  | 'idle'
  | 'warming'
  | 'ready'
  | 'recording'
  | 'stopping'
  | 'paused'
  | 'failed';

/** Product-facing capture shape used by RecordScreen / BestPart / feed. */
export type DualCameraCapture = {
  primaryUri: string;
  secondaryUri: string;
  frontIsPrimary: boolean;
};

export function dualTakeToCapture(take: DualTake): DualCameraCapture {
  return {
    primaryUri: take.frontIsPrimary ? take.frontUri : take.backUri,
    secondaryUri: take.frontIsPrimary ? take.backUri : take.frontUri,
    frontIsPrimary: take.frontIsPrimary,
  };
}

export function toFileUri(path: string): string {
  return path.startsWith('file://') ? path : `file://${path}`;
}
