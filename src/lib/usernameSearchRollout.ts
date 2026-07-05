/**
 * Staged rollout for moving global username search from Today → Leaperboard.
 * Flip to `false` and OTA to ship the leaperboard search to everyone.
 */
export const USERNAME_SEARCH_ON_LEADERBOARD_STAFF_ONLY = false;

export function showUsernameSearchOnToday(isStaff: boolean): boolean {
  return USERNAME_SEARCH_ON_LEADERBOARD_STAFF_ONLY && !isStaff;
}

export function showUsernameSearchOnLeaderboard(isStaff: boolean): boolean {
  return !USERNAME_SEARCH_ON_LEADERBOARD_STAFF_ONLY || isStaff;
}
