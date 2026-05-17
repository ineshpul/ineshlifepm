import * as React from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Audio, ResizeMode, Video } from 'expo-av';
import { doc, getDoc } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../../theme/colors';
import { firestore, isFirebaseConfigured } from '../../firebase/firebase';
import { formatJumpedThatDay } from '../../lib/verticalScore';

type Props = {
  visible: boolean;
  onClose: () => void;
  postId: string | null;
  fallbackInches: number;
};

const WINDOW_H = Dimensions.get('window').height;
const VIDEO_MAX_H = Math.min(WINDOW_H * 0.42, 360);

function formatLeapDate(challengeDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(challengeDate).trim());
  if (!m) return challengeDate || '—';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(d.getTime())) return challengeDate;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function HighestLeapSheet({ visible, onClose, postId, fallbackInches }: Props) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = React.useState(false);
  const [url, setUrl] = React.useState('');
  const [dateLabel, setDateLabel] = React.useState('');

  React.useEffect(() => {
    if (!visible) return;
    void Audio.setAudioModeAsync({ playsInSilentModeIOS: true }).catch(() => {});
  }, [visible]);

  React.useEffect(() => {
    if (!visible || !postId) {
      setUrl('');
      setDateLabel('');
      return;
    }
    if (!isFirebaseConfigured()) return;
    let alive = true;
    setLoading(true);
    void getDoc(doc(firestore(), 'videos', postId))
      .then((snap) => {
        if (!alive) return;
        if (!snap.exists()) {
          setUrl('');
          setDateLabel('');
          return;
        }
        const data = snap.data() as Record<string, unknown>;
        setUrl(String(data.url ?? '').trim());
        setDateLabel(formatLeapDate(String(data.challengeDate ?? '')));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [visible, postId]);

  const bottomPad = Math.max(insets.bottom, 16) + 12;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { maxHeight: WINDOW_H * 0.9 }]}>
          <View style={styles.handleRow}>
            <Text style={styles.title}>Highest leap</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            bounces={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad }]}
          >
            {loading ? (
              <View style={[styles.center, { height: VIDEO_MAX_H }]}>
                <ActivityIndicator size="large" color={colors.moss} />
              </View>
            ) : url ? (
              <View style={[styles.videoWrap, { height: VIDEO_MAX_H }]}>
                <Video
                  source={{ uri: url }}
                  style={styles.video}
                  resizeMode={ResizeMode.CONTAIN}
                  shouldPlay
                  isLooping
                  useNativeControls
                />
              </View>
            ) : (
              <View style={[styles.center, { height: 120 }]}>
                <Text style={styles.muted}>Video unavailable</Text>
              </View>
            )}

            {dateLabel ? <Text style={styles.metaDate}>{dateLabel}</Text> : null}
            <Text style={styles.metaInches}>{formatJumpedThatDay(fallbackInches)}</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: colors.white,
    paddingHorizontal: 18,
  },
  scrollContent: { flexGrow: 1 },
  handleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 14,
    paddingBottom: 10,
  },
  title: { fontSize: 18, fontWeight: '900', color: colors.text },
  videoWrap: {
    width: '100%',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
    alignSelf: 'center',
  },
  video: { width: '100%', height: '100%' },
  center: { alignItems: 'center', justifyContent: 'center' },
  muted: { fontSize: 14, fontWeight: '600', color: colors.muted },
  metaDate: { marginTop: 14, fontSize: 14, fontWeight: '700', color: colors.muted },
  metaInches: {
    marginTop: 6,
    fontSize: 20,
    fontWeight: '900',
    color: colors.text,
    lineHeight: 28,
  },
});
