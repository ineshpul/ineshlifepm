import type { NavigationProp, ParamListBase } from '@react-navigation/native';

import { rootNavigationRef } from './RootNavigator';

/** Record lives on the root stack (modal), not inside tabs — resolve the stack that owns `Record`. */
export function navigateToRecord(navigation: NavigationProp<ParamListBase>) {
  const parent = navigation.getParent?.();
  if (parent?.navigate) {
    parent.navigate('Record' as never);
    return;
  }
  navigation.navigate('Record' as never);
}

export type ChatSharePostPayload = {
  videoId: string;
  videoUrl: string;
  title: string;
  ownerUid: string;
  ownerUsername?: string;
};

/**
 * Open New Chat with a clip to share. Works from the tab bar (Chat is a tab) and from root-stack
 * screens (e.g. UserLeaps) where `navigate('Chat')` alone would not resolve.
 */
export function navigateToChatSharePost(
  navigation: NavigationProp<ParamListBase>,
  sharePost: ChatSharePostPayload
) {
  const nested = {
    screen: 'NewChat' as const,
    params: { sharePost },
  };
  let nav: any = navigation;
  for (let i = 0; i < 8; i++) {
    const names: string[] | undefined = nav?.getState?.()?.routeNames;
    if (!names?.length) break;
    if (names.includes('Chat')) {
      nav.navigate('Chat', nested);
      return;
    }
    if (names.includes('Tabs')) {
      nav.navigate('Tabs', { screen: 'Chat', params: nested });
      return;
    }
    nav = nav.getParent?.();
    if (!nav) break;
  }
  if (rootNavigationRef.isReady()) {
    rootNavigationRef.navigate('Tabs', { screen: 'Chat', params: nested });
  }
}
