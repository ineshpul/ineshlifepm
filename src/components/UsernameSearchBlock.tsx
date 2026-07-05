import * as React from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { isFirebaseConfigured } from '../firebase/firebase';
import { navigateToUserProfile } from '../navigation/navigationHelpers';
import { subscribeUsersByUsernamePrefix, type UserSearchHit } from '../services/userSearch';
import { useAuth } from '../state/auth';

type Props = {
  /** Hide the section label when the search sits inline on a busy screen. */
  showLabel?: boolean;
};

export function UsernameSearchBlock({ showLabel = true }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles((colors) => ({
    block: { marginBottom: 12 },
    label: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.muted,
      marginBottom: 8,
    },
    offline: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.muted,
    },
    input: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      fontWeight: '600',
      backgroundColor: colors.card,
      color: colors.text,
    },
    loading: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 10,
    },
    loadingTxt: { fontSize: 13, fontWeight: '700', color: colors.muted },
    resultsWrap: {
      marginTop: 8,
      maxHeight: 200,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
      overflow: 'hidden',
    },
    resultsList: { flexGrow: 0 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border2,
    },
    rowName: { fontSize: 15, fontWeight: '800', color: colors.coral, flexShrink: 1 },
    rowHint: { fontSize: 12, fontWeight: '700', color: colors.moss, marginLeft: 10 },
    empty: {
      padding: 14,
      fontSize: 13,
      fontWeight: '600',
      color: colors.muted,
      textAlign: 'center',
    },
  }));

  const nav = useNavigation<any>();
  const { user } = useAuth();
  const [profileQ, setProfileQ] = React.useState('');
  const [debouncedProfileQ, setDebouncedProfileQ] = React.useState('');
  const [profileHits, setProfileHits] = React.useState<UserSearchHit[]>([]);
  const [profileSearchLoading, setProfileSearchLoading] = React.useState(false);

  const qNorm = React.useMemo(() => profileQ.trim().toLowerCase().replace(/^@+/u, ''), [profileQ]);
  const profileSearchPending = Boolean(qNorm && qNorm !== debouncedProfileQ);

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedProfileQ(qNorm), 280);
    return () => clearTimeout(t);
  }, [qNorm]);

  React.useEffect(() => {
    if (!isFirebaseConfigured() || !user?.uid || !debouncedProfileQ) {
      setProfileHits([]);
      setProfileSearchLoading(false);
      return;
    }
    setProfileHits([]);
    setProfileSearchLoading(true);
    const unsub = subscribeUsersByUsernamePrefix(debouncedProfileQ, user.uid, 35, (hits) => {
      setProfileHits(hits);
      setProfileSearchLoading(false);
    });
    return () => unsub();
  }, [debouncedProfileQ, user?.uid]);

  const showProfileSpinner = Boolean(qNorm) && (profileSearchPending || profileSearchLoading);

  const clearSearch = React.useCallback(() => {
    setProfileQ('');
    setDebouncedProfileQ('');
    setProfileHits([]);
  }, []);

  return (
    <View style={styles.block}>
      {showLabel ? <Text style={styles.label}>Find someone on Leap</Text> : null}
      {!isFirebaseConfigured() ? (
        <Text style={styles.offline}>Connect Firebase to search profiles.</Text>
      ) : (
        <>
          <TextInput
            style={styles.input}
            placeholder="Search by username"
            placeholderTextColor={colors.muted2}
            value={profileQ}
            onChangeText={setProfileQ}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {showProfileSpinner ? (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.moss} />
              <Text style={styles.loadingTxt}>Searching…</Text>
            </View>
          ) : null}
          {qNorm && !showProfileSpinner ? (
            <View style={styles.resultsWrap}>
              <FlatList
                data={profileHits}
                keyExtractor={(h) => h.uid}
                scrollEnabled={profileHits.length > 4}
                style={styles.resultsList}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                  <Text style={styles.empty}>No users match that prefix.</Text>
                }
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.row}
                    onPress={() => {
                      clearSearch();
                      navigateToUserProfile(nav, { uid: item.uid, username: item.username });
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${item.username} profile`}
                  >
                    <Text style={styles.rowName}>@{item.username}</Text>
                    <Text style={styles.rowHint}>Open profile</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}
