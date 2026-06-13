import * as React from 'react';
import { ScrollView, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Screen } from '../components/Screen';
import { LEGAL_DOCS } from '../content/settingsLegal';
import { useThemedStyles } from '../theme/ThemeProvider';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'LegalDocument'>;

export function LegalDocumentScreen({ route }: Props) {
  const { docId } = route.params;
  const doc = LEGAL_DOCS[docId];
  const styles = useThemedStyles((colors) => ({
    screen: { flex: 1, backgroundColor: colors.bg },
    scroll: { flex: 1 },
    content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },
    body: {
      fontSize: 16,
      lineHeight: 24,
      fontWeight: '500',
      color: colors.text,
    },
  }));

  return (
    <Screen style={styles.screen}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.body}>{doc.body}</Text>
      </ScrollView>
    </Screen>
  );
}
