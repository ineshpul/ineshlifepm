/** Whether this user’s following list is visible on their profile to other signed-in users. */
export function showFollowingListToOthers(data: Record<string, unknown> | undefined): boolean {
  if (!data) return true;
  return data.showFollowingListToOthers !== false;
}
