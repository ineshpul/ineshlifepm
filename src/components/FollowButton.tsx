import * as React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity } from 'react-native';

import { colors } from '../theme/colors';
import { followUser, subscribeIsFollowing, unfollowUser } from '../services/social';
import { showError } from '../utils/ui';

type Props = {
  viewerUid: string;
  viewerUsername: string;
  targetUid: string;
  targetUsername: string;
  /** When set, stored on the follow edge for avatar lists (see `FollowingRow.targetPhotoUrl`). */
  targetPhotoUrl?: string | null;
};

export function FollowButton({
  viewerUid,
  viewerUsername,
  targetUid,
  targetUsername,
  targetPhotoUrl,
}: Props) {
  const [following, setFollowing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    return subscribeIsFollowing(viewerUid, targetUid, setFollowing);
  }, [viewerUid, targetUid]);

  if (viewerUid === targetUid) return null;

  const onToggle = async () => {
    setBusy(true);
    try {
      if (following) {
        await unfollowUser(viewerUid, targetUid);
      } else {
        await followUser({
          viewerUid,
          targetUid,
          targetUsername,
          viewerUsername,
          targetPhotoUrl: targetPhotoUrl?.trim() || null,
        });
      }
    } catch (e) {
      showError(following ? 'Unfollow failed' : 'Follow failed', e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <TouchableOpacity
      style={[styles.btn, following && styles.btnFollowing]}
      onPress={onToggle}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={following ? 'Unfollow' : 'Follow'}
    >
      {busy ? (
        <ActivityIndicator size="small" color={following ? colors.text : colors.white} />
      ) : (
        <Text style={[styles.text, following && styles.textFollowing]}>
          {following ? 'Following' : 'Follow'}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.moss,
    minWidth: 86,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnFollowing: {
    backgroundColor: colors.cardTint,
    borderWidth: 1,
    borderColor: colors.border,
  },
  text: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  textFollowing: {
    color: colors.text,
  },
});
