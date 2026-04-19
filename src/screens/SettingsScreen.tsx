import * as React from 'react';
import {
  Alert,
  Image,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { deleteUser } from 'firebase/auth';
import { doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';

import { Screen } from '../components/Screen';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors } from '../theme/colors';
import { useAuth } from '../state/auth';
import {
  SETTINGS_DEFAULTS,
  useSettingsPreferences,
  type FeedType,
  type CommentAudience,
  type MessageAudience,
} from '../state/settingsPreferences';
import { firebaseAuth, firestore, isFirebaseConfigured } from '../firebase/firebase';
import { LEAP_SUPPORT_EMAIL } from '../constants/support';
import type { LegalDocId } from '../content/settingsLegal';
import { showError, showInfo } from '../utils/ui';
import { recomputeVerticalScoreForUser } from '../services/verticalScore';

function SectionHeader({ title }: { title: string }) {
  return (
    <Text style={styles.sectionHeader} accessibilityRole="header">
      {title}
    </Text>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

function Separator() {
  return <View style={styles.separator} />;
}

function RowChevron({
  label,
  value,
  onPress,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} disabled={!onPress} activeOpacity={0.65}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowRight}>
        {value ? <Text style={styles.rowValue}>{value}</Text> : null}
        {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.muted2} /> : null}
      </View>
    </TouchableOpacity>
  );
}

function RowToggle({
  label,
  subtitle,
  value,
  onValueChange,
}: {
  label: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowTextCol}>
        <Text style={styles.rowLabel}>{label}</Text>
        {subtitle ? <Text style={styles.rowSub}>{subtitle}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#D1D5DB', true: '#A5D6A7' }}
        thumbColor={Platform.OS === 'android' ? (value ? colors.moss : '#F3F4F6') : undefined}
      />
    </View>
  );
}

function PickerModal<T extends string>(props: {
  visible: boolean;
  title: string;
  options: { key: T; label: string }[];
  selected: T;
  onClose: () => void;
  onSelect: (k: T) => void;
}) {
  const { visible, title, options, selected, onClose, onSelect } = props;
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.pickerRoot}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.pickerCard}>
        <Text style={styles.pickerTitle}>{title}</Text>
        {options.map((o) => (
          <TouchableOpacity
            key={o.key}
            style={[styles.pickerRow, selected === o.key && styles.pickerRowOn]}
            onPress={() => {
              onSelect(o.key);
              onClose();
            }}
          >
            <Text style={[styles.pickerLabel, selected === o.key && styles.pickerLabelOn]}>
              {o.label}
            </Text>
            {selected === o.key ? <Ionicons name="checkmark" size={20} color={colors.moss} /> : null}
          </TouchableOpacity>
        ))}
        <TouchableOpacity onPress={onClose} style={styles.pickerDone}>
          <Text style={styles.pickerDoneText}>Done</Text>
        </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export function SettingsScreen() {
  const nav = useNavigation<any>();
  const { user, signOut } = useAuth();
  const { preferences, patch, replace } = useSettingsPreferences();

  const [picker, setPicker] = React.useState<
    | null
    | 'feed'
    | 'comment'
    | 'message'
  >(null);

  const [profileBioFs, setProfileBioFs] = React.useState('');
  const [providers, setProviders] = React.useState<string[]>([]);

  React.useEffect(() => {
    const au = firebaseAuth().currentUser;
    if (!au) return;
    setProviders(au.providerData.map((p) => p?.providerId ?? '').filter(Boolean));
  }, [user?.uid]);

  React.useEffect(() => {
    if (!isFirebaseConfigured() || !user?.uid) return;
    const ref = doc(firestore(), 'users', user.uid);
    return onSnapshot(ref, (snap) => {
      const bio = snap.exists() ? String((snap.data() as any)?.bio ?? '') : '';
      setProfileBioFs(bio);
    });
  }, [user?.uid]);

  const saveProfile = async () => {
    if (!user || !isFirebaseConfigured()) {
      showInfo('Saved', 'Profile updated locally.');
      return;
    }
    try {
      await updateDoc(doc(firestore(), 'users', user.uid), {
        bio: (preferences.profileBio || profileBioFs).trim(),
        displayName: (preferences.profileDisplayName || user.username).trim(),
        updatedAt: serverTimestamp(),
      });
      const cur = firebaseAuth().currentUser;
      if (cur) {
        const { updateProfile } = await import('firebase/auth');
        await updateProfile(cur, {
          displayName: (preferences.profileDisplayName || user.username).trim(),
        });
      }
      showInfo('Saved', 'Your profile was updated.');
    } catch (e) {
      showError('Could not save profile', e);
    }
  };

  const refreshVerticalScore = async () => {
    if (!user?.uid) {
      showInfo('Sign in', 'Vertical Score needs an account.');
      return;
    }
    try {
      const r = await recomputeVerticalScoreForUser(user.uid);
      if (r) showInfo('Vertical Score', `Updated to ${r.verticalScore}.`);
      else showError('Could not update', new Error('Check your connection or try again.'));
    } catch (e) {
      showError('Could not update score', e);
    }
  };

  const pickPhoto = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showError('Permission needed', new Error('Photo library access is required.'));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (res.canceled) return;
    const uri = res.assets?.[0]?.uri;
    if (uri) patch({ profilePhotoUri: uri });
  };

  const onDeleteAccount = () => {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your Leap account and cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            void (async () => {
              if (!isFirebaseConfigured()) {
                showError(
                  'Not available',
                  new Error('Account services are not connected. Check your project configuration.')
                );
                return;
              }
              const au = firebaseAuth().currentUser;
              if (!au) return;
              try {
                await deleteUser(au);
                replace({ ...SETTINGS_DEFAULTS });
              } catch (e) {
                showError(
                  'Delete failed',
                  new Error(
                    'For your security, sign in again and try once more, or contact support if the problem continues.'
                  )
                );
              }
            })(),
        },
      ]
    );
  };

  const goLegal = (docId: LegalDocId) => {
    nav.navigate('LegalDocument', { docId });
  };

  const openSupportMail = async (subject: string) => {
    const q = encodeURIComponent(subject);
    const url = `mailto:${LEAP_SUPPORT_EMAIL}?subject=${q}`;
    try {
      await Linking.openURL(url);
    } catch {
      showError(
        'Contact support',
        new Error(`We could not open your mail app. Email ${LEAP_SUPPORT_EMAIL}`)
      );
    }
  };

  const providerLabel = (id: string) => {
    if (id.includes('google')) return 'Google';
    if (id.includes('apple')) return 'Apple';
    if (id.includes('password')) return 'Email & password';
    return id;
  };

  const goPass = () => {
    showInfo(
      'Password',
      'To change your password, sign out and use Forgot password on the sign-in screen, or manage your account through your email provider.'
    );
  };

  return (
    <Screen style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <SectionHeader title="Profile" />
        <Card>
          <TouchableOpacity style={styles.photoRow} onPress={pickPhoto}>
            <View style={styles.avatarRing}>
              {preferences.profilePhotoUri ? (
                <Image source={{ uri: preferences.profilePhotoUri }} style={styles.avatarImg} />
              ) : (
                <Ionicons name="person" size={36} color={colors.muted} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.photoTitle}>Profile photo</Text>
              <Text style={styles.photoSub}>Tap to choose a photo</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted2} />
          </TouchableOpacity>
          <Separator />
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput
              value={preferences.profileDisplayName || user?.username || ''}
              onChangeText={(t) => patch({ profileDisplayName: t })}
              placeholder="Display name"
              placeholderTextColor={colors.muted2}
              style={styles.fieldInput}
            />
          </View>
          <Separator />
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Username</Text>
            <TextInput
              value={preferences.profileUsername || user?.username || ''}
              onChangeText={(t) => patch({ profileUsername: t })}
              placeholder="Username"
              placeholderTextColor={colors.muted2}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.fieldInput}
            />
          </View>
          <Separator />
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>Bio</Text>
            <TextInput
              value={preferences.profileBio || profileBioFs}
              onChangeText={(t) => patch({ profileBio: t })}
              placeholder="A short bio"
              placeholderTextColor={colors.muted2}
              multiline
              style={[styles.fieldInput, styles.bioInput]}
            />
          </View>
          <PrimaryButton
            title="Save profile"
            variant="green"
            onPress={() => void saveProfile()}
            style={styles.saveProfileBtn}
          />
        </Card>

        <SectionHeader title="Account" />
        <Card>
          <RowChevron label="Email / phone" value={user?.email || '—'} />
          <Separator />
          <RowChevron label="Password" onPress={goPass} />
          <Separator />
          <View style={styles.connBlock}>
            <Text style={styles.connTitle}>Connected accounts</Text>
            {providers.length === 0 ? (
              <Text style={styles.connMuted}>None detected</Text>
            ) : (
              providers.map((p) => (
                <Text key={p} style={styles.connItem}>
                  · {providerLabel(p)}
                </Text>
              ))
            )}
          </View>
          <Separator />
          <TouchableOpacity style={styles.row} onPress={() => void signOut()}>
            <Text style={styles.rowLabel}>Log out</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.muted2} />
          </TouchableOpacity>
          <Separator />
          <TouchableOpacity style={styles.row} onPress={onDeleteAccount}>
            <Text style={[styles.rowLabel, styles.danger]}>Delete account</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.muted2} />
          </TouchableOpacity>
        </Card>

        <SectionHeader title="Notifications" />
        <Card>
          <RowToggle
            label="Notifications"
            subtitle="All Leap alerts on or off."
            value={preferences.notificationsEnabled}
            onValueChange={(v) => patch({ notificationsEnabled: v })}
          />
        </Card>

        <SectionHeader title="Feed" />
        <Card>
          <RowChevron
            label="Feed type"
            value={preferences.feedType === 'mixed' ? 'Mixed' : 'Friends only'}
            onPress={() => setPicker('feed')}
          />
          <Separator />
          <RowToggle
            label="Data saver mode"
            subtitle="Lighter playback updates."
            value={preferences.dataSaver}
            onValueChange={(v) => patch({ dataSaver: v })}
          />
        </Card>

        <SectionHeader title="Privacy" />
        <Card>
          <RowToggle
            label="Private account"
            value={preferences.privateAccount}
            onValueChange={(v) => patch({ privateAccount: v })}
          />
          <Separator />
          <RowChevron
            label="Who can comment"
            value={preferences.whoCanComment === 'everyone' ? 'Everyone' : 'Friends'}
            onPress={() => setPicker('comment')}
          />
          <Separator />
          <RowChevron
            label="Who can message"
            value={
              preferences.whoCanMessage === 'everyone'
                ? 'Everyone'
                : preferences.whoCanMessage === 'friends'
                  ? 'Friends'
                  : 'No one'
            }
            onPress={() => setPicker('message')}
          />
          <Separator />
          <RowToggle
            label="Activity status"
            value={preferences.activityStatus}
            onValueChange={(v) => patch({ activityStatus: v })}
          />
          <Separator />
          <RowToggle
            label="Show streak publicly"
            value={preferences.showStreakPublic}
            onValueChange={(v) => patch({ showStreakPublic: v })}
          />
          <Separator />
          <RowChevron label="Blocked users" onPress={() => nav.navigate('BlockedUsers')} />
          <Separator />
          <RowChevron label="Muted users" onPress={() => nav.navigate('MutedUsers')} />
        </Card>

        <SectionHeader title="Safety" />
        <Card>
          <RowChevron
            label="Report a problem"
            onPress={() => void openSupportMail('Leap report')}
          />
          <Separator />
          <RowChevron label="Block user" onPress={() => nav.navigate('BlockedUsers')} />
          <Separator />
          <RowToggle
            label="Content filtering"
            value={preferences.contentFiltering}
            onValueChange={(v) => patch({ contentFiltering: v })}
          />
          <Separator />
          <RowChevron label="Community guidelines" onPress={() => goLegal('community')} />
        </Card>

        <SectionHeader title="Streak / Performance" />
        <Card>
          <RowToggle
            label="Streak reminders"
            subtitle="Daily nudges when notifications are on."
            value={preferences.streakReminders}
            onValueChange={(v) => patch({ streakReminders: v })}
          />
          <Separator />
          <RowToggle
            label="Show streak publicly"
            value={preferences.showStreakPublic}
            onValueChange={(v) => patch({ showStreakPublic: v })}
          />
          <Separator />
          <RowToggle
            label="Show score publicly"
            value={preferences.showScorePublic}
            onValueChange={(v) => patch({ showScorePublic: v })}
          />
          <Separator />
          <RowChevron label="Recalculate vertical score" onPress={() => void refreshVerticalScore()} />
        </Card>

        <SectionHeader title="Camera / Upload" />
        <Card>
          <RowToggle
            label="Save to camera roll"
            value={preferences.saveToCameraRoll}
            onValueChange={(v) => patch({ saveToCameraRoll: v })}
          />
          <Separator />
          <RowToggle
            label="Upload over cellular"
            subtitle="When off, you’ll be asked before uploading."
            value={preferences.uploadOnCellular}
            onValueChange={(v) => patch({ uploadOnCellular: v })}
          />
        </Card>

        <SectionHeader title="Chat" />
        <Card>
          <RowChevron
            label="Open chats"
            onPress={() =>
              nav.navigate('Tabs', {
                screen: 'Chat',
                params: { screen: 'ChatInbox' },
              })
            }
          />
        </Card>

        <SectionHeader title="Help / Legal" />
        <Card>
          <RowChevron label="FAQ" onPress={() => goLegal('faq')} />
          <Separator />
          <RowChevron
            label="Contact support"
            onPress={() => void openSupportMail('Leap help')}
          />
          <Separator />
          <RowChevron label="Terms" onPress={() => goLegal('terms')} />
          <Separator />
          <RowChevron label="Privacy policy" onPress={() => goLegal('privacy')} />
        </Card>

        <Text style={styles.footer}>Leap · Settings</Text>
      </ScrollView>

      <PickerModal<FeedType>
        visible={picker === 'feed'}
        title="Feed type"
        selected={preferences.feedType}
        options={[
          { key: 'mixed', label: 'Mixed' },
          { key: 'friends', label: 'Friends only' },
        ]}
        onSelect={(k) => patch({ feedType: k })}
        onClose={() => setPicker(null)}
      />
      <PickerModal<CommentAudience>
        visible={picker === 'comment'}
        title="Who can comment"
        selected={preferences.whoCanComment}
        options={[
          { key: 'everyone', label: 'Everyone' },
          { key: 'friends', label: 'Friends' },
        ]}
        onSelect={(k) => patch({ whoCanComment: k })}
        onClose={() => setPicker(null)}
      />
      <PickerModal<MessageAudience>
        visible={picker === 'message'}
        title="Who can message"
        selected={preferences.whoCanMessage}
        options={[
          { key: 'everyone', label: 'Everyone' },
          { key: 'friends', label: 'Friends' },
          { key: 'none', label: 'No one' },
        ]}
        onSelect={(k) => patch({ whoCanMessage: k })}
        onClose={() => setPicker(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 8 },
  sectionHeader: {
    marginTop: 20,
    marginBottom: 8,
    marginLeft: 4,
    fontSize: 13,
    fontWeight: '800',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  card: {
    borderRadius: 16,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 4,
    paddingVertical: 6,
    marginBottom: 4,
    gap: 0,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border2,
    marginLeft: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 12,
  },
  rowTextCol: { flex: 1, paddingRight: 8 },
  rowLabel: { fontSize: 16, fontWeight: '600', color: colors.text },
  rowSub: { marginTop: 2, fontSize: 12, color: colors.muted, fontWeight: '600' },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowValue: { fontSize: 15, color: colors.muted, fontWeight: '600', maxWidth: 140 },
  danger: { color: colors.danger, fontWeight: '700' },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  avatarRing: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.cardTint,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: { width: 64, height: 64, borderRadius: 20 },
  photoTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  photoSub: { fontSize: 12, color: colors.muted, fontWeight: '600', marginTop: 2 },
  fieldBlock: { paddingHorizontal: 12, paddingVertical: 10 },
  fieldLabel: { fontSize: 12, fontWeight: '800', color: colors.muted, marginBottom: 6, letterSpacing: 0.4 },
  fieldInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    backgroundColor: '#FAFBFC',
  },
  bioInput: { minHeight: 88, textAlignVertical: 'top' },
  saveProfileBtn: { marginTop: 8, marginHorizontal: 8, marginBottom: 4 },
  connBlock: { paddingHorizontal: 12, paddingVertical: 10, gap: 4 },
  connTitle: { fontSize: 12, fontWeight: '800', color: colors.muted, letterSpacing: 0.4 },
  connMuted: { fontSize: 14, color: colors.muted, fontWeight: '600' },
  connItem: { fontSize: 15, color: colors.text, fontWeight: '600' },
  footer: { textAlign: 'center', marginTop: 28, fontSize: 12, color: colors.muted2, fontWeight: '600' },
  pickerRoot: { flex: 1, justifyContent: 'center' },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  pickerCard: {
    marginHorizontal: 20,
    borderRadius: 18,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 4,
    zIndex: 2,
  },
  pickerTitle: { fontSize: 17, fontWeight: '900', color: colors.text, marginBottom: 8 },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  pickerRowOn: { backgroundColor: colors.cardTint },
  pickerLabel: { fontSize: 16, fontWeight: '600', color: colors.text },
  pickerLabelOn: { fontWeight: '800' },
  pickerDone: { alignItems: 'center', paddingVertical: 12 },
  pickerDoneText: { fontSize: 16, fontWeight: '800', color: colors.moss },
});
