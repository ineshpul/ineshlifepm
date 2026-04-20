import * as React from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { colors } from '../theme/colors';
import { useAuth } from '../state/auth';
import { markNotificationRead, subscribeNotifications, type InAppNotification } from '../services/social';

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

  const onOpen = async (n: InAppNotification) => {
    if (!user?.uid || n.read) return;
    try {
      await markNotificationRead(user.uid, n.id);
    } catch {
      // ignore
    }
  };

  return (
    <Screen style={styles.screen}>
      <FlatList
        data={items}
        keyExtractor={(x) => x.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>No notifications yet.</Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.row, !item.read && styles.rowUnread]}
            onPress={() => void onOpen(item)}
            activeOpacity={0.85}
          >
            <View style={styles.dotWrap}>{!item.read ? <View style={styles.dot} /> : null}</View>
            <View style={{ flex: 1 }}>
              {item.type === 'admin_alert' ? (
                <Text style={styles.line}>
                  <Text style={styles.name}>Leap</Text> · {bodyFor(item)}
                </Text>
              ) : (
                <Text style={styles.line}>
                  <Text
                    style={styles.name}
                    onPress={() =>
                      nav.navigate('UserProfile', {
                        uid: item.fromUid,
                        username: item.fromUsername,
                      })
                    }
                    suppressHighlighting
                  >
                    @{item.fromUsername}
                  </Text>{' '}
                  {bodyFor(item)}
                </Text>
              )}
            </View>
          </TouchableOpacity>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    paddingHorizontal: 16,
    paddingTop: 8,
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
    alignItems: 'flex-start',
    gap: 8,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
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
    color: colors.text,
  },
});
