import type { CameraPhotoOutput } from 'react-native-vision-camera';

import type { DualCamSession } from './dualCamSession';
import type { DualTake } from './dualCamTypes';
import { toFileUri } from './dualCamTypes';

type CaptureOpts = {
  session: DualCamSession;
  backPhoto: CameraPhotoOutput;
  frontPhoto: CameraPhotoOutput;
  getFrontIsPrimary: () => boolean;
};

/**
 * Capture stills from both multi-cam photo outputs. Layout at shutter time
 * decides which file is primary vs PIP.
 */
export async function captureDualPhotos(opts: CaptureOpts): Promise<DualTake> {
  const { session, backPhoto, frontPhoto, getFrontIsPrimary } = opts;
  if (session.getPhase() !== 'ready') {
    throw new Error('Dual camera is not ready.');
  }

  session.setPhase('recording');
  try {
    const settings = { flashMode: 'off' as const, enableShutterSound: true };
    const [backFile, frontFile] = await Promise.all([
      backPhoto.capturePhotoToFile(settings, {}),
      frontPhoto.capturePhotoToFile(settings, {}),
    ]);
    const backUri = toFileUri(backFile.filePath);
    const frontUri = toFileUri(frontFile.filePath);
    return {
      backUri,
      frontUri,
      frontIsPrimary: getFrontIsPrimary(),
    };
  } finally {
    session.setPhase('ready');
  }
}
