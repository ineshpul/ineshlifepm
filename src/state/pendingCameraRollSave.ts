import { stageVideoForCameraRollOffer } from '../services/saveVideoToCameraRoll';

/** Local clip URI to offer saving after post — consumed when Feed tab focuses. */
let pendingUri: string | undefined;

/**
 * Copy the recording to app storage before navigating away from Record.
 * Avoids iOS failing to save when the camera temp file is gone or has no extension.
 */
export async function offerCameraRollSaveAfterPost(uri: string): Promise<void> {
  try {
    pendingUri = await stageVideoForCameraRollOffer(uri);
  } catch {
    pendingUri = uri;
  }
}

export function takeCameraRollSaveOffer(): string | undefined {
  const uri = pendingUri;
  pendingUri = undefined;
  return uri;
}
