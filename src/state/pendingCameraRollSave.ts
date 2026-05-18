/** Local clip URI to offer saving after post — consumed when Feed tab focuses. */
let pendingUri: string | undefined;

export function offerCameraRollSaveAfterPost(uri: string) {
  pendingUri = uri;
}

export function takeCameraRollSaveOffer(): string | undefined {
  const uri = pendingUri;
  pendingUri = undefined;
  return uri;
}
