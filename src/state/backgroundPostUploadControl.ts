/** Lets non-React modules (e.g. deleteVideo) abort an in-flight background post. */
let cancelActiveBackgroundPostImpl: (() => void) | null = null;

export function registerBackgroundPostCancel(fn: (() => void) | null) {
  cancelActiveBackgroundPostImpl = fn;
}

export function cancelActiveBackgroundPost() {
  cancelActiveBackgroundPostImpl?.();
}

export class BackgroundPostAbortedError extends Error {
  constructor() {
    super('Background post cancelled.');
    this.name = 'BackgroundPostAbortedError';
  }
}
