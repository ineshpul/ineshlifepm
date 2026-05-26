/** Wait for stacked back `CameraView` to report ready before `recordAsync` in dual mode. */
export async function waitForRecordCameraReady(
  isReady: () => boolean,
  timeoutMs = 8000,
  stepMs = 120
): Promise<boolean> {
  let waited = 0;
  while (!isReady() && waited < timeoutMs) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, stepMs));
    waited += stepMs;
  }
  return isReady();
}
