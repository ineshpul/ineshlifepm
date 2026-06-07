import type { ChallengeWatermarkInfo } from '../services/challengeWatermarkCapture';
import { stageVideoForCameraRollOffer } from '../services/saveVideoToCameraRoll';

export type CameraRollSaveOffer = {
  uri: string;
  challenge: ChallengeWatermarkInfo;
};

/** Local clip + challenge metadata to offer saving after post — consumed when Feed tab focuses. */
let pendingOffer: CameraRollSaveOffer | undefined;

/**
 * Copy the recording to app storage before navigating away from Record.
 * Avoids iOS failing to save when the camera temp file is gone or has no extension.
 */
export async function offerCameraRollSaveAfterPost(
  uri: string,
  challenge: ChallengeWatermarkInfo
): Promise<void> {
  try {
    const stagedUri = await stageVideoForCameraRollOffer(uri);
    pendingOffer = { uri: stagedUri, challenge };
  } catch {
    pendingOffer = { uri, challenge };
  }
}

export function takeCameraRollSaveOffer(): CameraRollSaveOffer | undefined {
  const offer = pendingOffer;
  pendingOffer = undefined;
  return offer;
}
