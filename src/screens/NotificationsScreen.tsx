import * as React from 'react';
import { FlatList, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import { FollowButton } from '../components/FollowButton';
import { UsernameLink } from '../components/UsernameLink';
import { Screen } from '../components/Screen';
import { colors } from '../theme/colors';
import { useAuth } from '../state/auth';
import {
  markAllNotificationsRead,
  markNotificationRead,
  subscribeNotifications,
  type InAppNotification,
} from '../services/social';
import { setAppBadgeCount } from '../services/pushNotifications';
import { navigateToUserProfile } from '../navigation/navigationHelpers';

function bodyFor(n: InAppNotification) {
  if (n.type === 'admin_alert') return n.snippet ? String(n.snippet) : 'Admin alert';
  if (n.type === 'like') return 'liked your leap';
  if (n.type === 'follow') return 'started following you';
  return n.snippet ? `commented: ${n.snippet}` : 'commented on your leap';
}

export function NotificationsScreen() {
  const nav = useNavigation<any>();
  const { user } = useAuth();
  const [items, setItems] = React.useState<InAppNotification[]>([]);

  React.useEffect(() => {
    return subscribeNotifications(user?.uid, setItems);
  }, [user?.uid]);

  useFocusEffect(
    React.useCallback(() => {
      if (!user?.uid) return;
      void markAllNotificationsRead(user.uid).then(() => {
        void setAppBadgeCount(0);
      });
    }, [user?.uid])
  );

  const openNotification = async (n: InAppNotification) => {
    if (user?.uid && !n.read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      try {
        await markNotificationRead(user.uid, n.id);
      } catch {
        setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: false } : x)));
      }
    }
    if (n.type === 'admin_alert') return;
    if (n.type === 'follow') {
      navigateToUserProfile(nav, { uid: n.fromUid, username: n.fromUsername });
      return;
    }
    if ((n.type === 'like' || n.type === 'comment') && n.videoId) {
      nav.navigate('VideoPost', { videoId: n.videoId });
      return;
    }
    navigateToUserProfile(nav, { uid: n.fromUid, username: n.fromUsername });
  };

  return (
    <Screen edges={['bottom', 'left', 'right']} style={styles.screen}>
      <FlatList
        data={items}
        keyExtractor={(x) => x.id}
        contentInsetAdjustmentBehavior={Platform.OS === 'ios' ? 'never' : undefined}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>No notifications yet.</Text>
        }
        renderItem={({ item }) => (
          <View style={[styles.row, !item.read && styles.rowUnread]}>
            <View style={styles.rowMain}>
              <TouchableOpacity
                onPress={() => void openNotification(item)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={item.read ? 'Notification' : 'Unread notification'}
              >
                <View style={styles.dotWrap}>{!item.read ? <View style={styles.dot} /> : null}</View>
              </TouchableOpacity>
              <View style={styles.rowBody}>
                {item.type === 'admin_alert' ? (
                  <TouchableOpacity onPress={() => void openNotification(item)} activeOpacity={0.85}>
                    <Text style={styles.line}>
                      <Text style={styles.name}>Leap</Text> · {bodyFor(item)}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.rowTextRow}>
                    <UsernameLink uid={item.fromUid} username={item.fromUsername} style={styles.name} />
                    <TouchableOpacity
                      onPress={() => void openNotification(item)}
                      activeOpacity={0.85}
                      style={styles.rowBodyTail}
                    >
                      <Text style={styles.line}> {bodyFor(item)}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
            {item.type === 'follow' && user?.uid && item.fromUid && item.fromUid !== user.uid ? (
              <FollowButton
                viewerUid={user.uid}
                viewerUsername={user.username}
                targetUid={item.fromUid}
                targetUsername={item.fromUsername}
              />
            ) : null}
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 16,
    paddingTop: 0,
    flex: 1,
  },
  list: {
    paddingBottom: 80,
    gap: 8,
  },
  empty: {
    textAlign: 'center',
    marginTop: 40,
    color: colors.muted,
    fontWeight: '600',
    fontSize: 15,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    minWidth: 0,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowTextRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  rowBodyTail: {
    flexShrink: 1,
    minWidth: 0,
  },
  rowUnread: {
    backgroundColor: 'rgba(255, 107, 84, 0.06)',
    borderColor: 'rgba(255, 107, 84, 0.25)',
  },
  dotWrap: {
    width: 12,
    paddingTop: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.coral,
  },
  line: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.muted,
    lineHeight: 20,
  },
  name: {
    fontWeight: '900',
    fontSize: 14,
  },
});
