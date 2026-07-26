/** Lets non-React modules (e.g. deleteVideo) abort an in-flight background post. */
let cancelActiveBackgroundPostImpl: (() => void) | null = null;
let clearPostedOverrideImpl: (() => void) | null = null;

export function registerBackgroundPostCancel(fn: (() => void) | null) {
  cancelActiveBackgroundPostImpl = fn;
}

export function registerClearPostedOverride(fn: (() => void) | null) {
  clearPostedOverrideImpl = fn;
}

export function cancelActiveBackgroundPost() {
  cancelActiveBackgroundPostImpl?.();
}

export function clearPostedOverrideGlobal() {
  clearPostedOverrideImpl?.();
}

export class BackgroundPostAbortedError extends Error {
  constructor() {
    super('Background post cancelled.');
    this.name = 'BackgroundPostAbortedError';
  }
}
