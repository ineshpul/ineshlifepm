/** Shared layout for the floating bottom tab bar (Instagram-style pill). */

export const FLOATING_TAB_PILL_HEIGHT = 56;
/** Gap between the pill and the safe-area bottom inset. */
export const FLOATING_TAB_BOTTOM_GAP = 10;
/** Horizontal inset so the pill floats instead of spanning edge-to-edge. */
export const FLOATING_TAB_SIDE_INSET = 28;

/** Space reel sheets / FABs should clear so they sit above the floating pill. */
export function floatingTabContentClearance(safeAreaBottom: number): number {
  return FLOATING_TAB_PILL_HEIGHT + FLOATING_TAB_BOTTOM_GAP + Math.max(safeAreaBottom, 8);
}
