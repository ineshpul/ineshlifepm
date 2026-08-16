# Leap UI modernization

Reference: 11-screen mockup export dated August 16, 2026.

## Visual language

- Ivory app surfaces with soft green depth instead of flat white.
- Forest green for navigation and positive actions.
- Coral as the single attention accent.
- Gold only for first-place and leaderboard moments.
- Near-black for the strongest primary action.
- Bricolage Grotesque for display text and Geist for interface copy.
- Rounded 16–24 px cards and a floating bottom navigation pill.

## Screen coverage

1. Today
2. Prompt suggestion
3. Leaperboard
4. Daily Leaps
5. Best of the Day
6. Create sheet
7. Review and post
8. Co-Leap recorder
9. Chats
10. Profile — Leaps
11. Profile — Best of Day

The modernization changes presentation without replacing existing recording,
posting, feed-gating, chat, engagement, upload, moderation, or profile behavior.
Mockup-only concepts without production data or backend support remain omitted
or are represented through the nearest existing feature.

## Product contracts for this PR

- All five tab routes remain (indexes stay stable). The floating bar adds a
  centered green `+` create sheet between Best and Chat; Best keeps normal
  tap navigation to Mine/Community. Feed ↔ Best switching also uses the shared
  mode control.
- Voting candidates, live vote percentages, prize claim, and prize email
  enrollment are **not** implemented here — there is no production vote model
  yet. Suggestion UI continues to use the existing suggestion submit path
  (inline in the create sheet / Today entry).
- Daily Leap and Best Part keep separate upload / scoring / privacy adapters
  even when review chrome looks similar.
