import * as React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useThemedStackScreenOptions } from './themedStackScreenOptions';
import { ChatInboxScreen } from '../screens/ChatInboxScreen';
import { ConversationScreen } from '../screens/ConversationScreen';
import { GroupInfoScreen } from '../screens/GroupInfoScreen';
import { NewChatScreen } from '../screens/NewChatScreen';
import { NewGroupScreen } from '../screens/NewGroupScreen';
import { MemberPickerScreen } from '../screens/MemberPickerScreen';
import { ChatSearchScreen } from '../screens/ChatSearchScreen';
import type { SharePostPayload } from '../chat/types';

export type ChatStackParamList = {
  ChatInbox: undefined;
  Conversation: {
    conversationId: string;
    threadTitle?: string;
    pendingShare?: SharePostPayload;
  };
  GroupInfo: { conversationId: string };
  NewChat: { sharePost?: SharePostPayload } | undefined;
  NewGroup: { pickedUids?: string[] } | undefined;
  MemberPicker: { mode: 'group'; existingUids: string[] };
  ChatSearch: undefined;
};

const Stack = createNativeStackNavigator<ChatStackParamList>();

export function ChatStackNavigator() {
  const themedHeader = useThemedStackScreenOptions();

  return (
    <Stack.Navigator screenOptions={themedHeader}>
      <Stack.Screen name="ChatInbox" component={ChatInboxScreen} options={{ title: 'Chats' }} />
      <Stack.Screen
        name="Conversation"
        component={ConversationScreen}
        options={{
          title: 'Chat',
          gestureEnabled: true,
          /** Leave edge-swipe room so the tab pager can move off Chat; back still works from the bar. */
          fullScreenGestureEnabled: false,
        }}
      />
      <Stack.Screen name="GroupInfo" component={GroupInfoScreen} options={{ title: 'Group info' }} />
      <Stack.Screen name="NewChat" component={NewChatScreen} options={{ title: 'New message' }} />
      <Stack.Screen name="NewGroup" component={NewGroupScreen} options={{ title: 'New group' }} />
      <Stack.Screen name="MemberPicker" component={MemberPickerScreen} options={{ title: 'Add people' }} />
      <Stack.Screen name="ChatSearch" component={ChatSearchScreen} options={{ title: 'Search' }} />
    </Stack.Navigator>
  );
}
