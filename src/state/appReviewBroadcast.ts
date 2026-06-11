type Listener = () => void;

const listeners = new Set<Listener>();

/** Show the App Store review sheet (from staff broadcast notification tap). */
export function requestStaffAppReviewPrompt(): void {
  for (const listener of listeners) listener();
}

export function subscribeStaffAppReviewPrompt(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
