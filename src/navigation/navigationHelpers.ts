import { CommonActions, type NavigationProp, type ParamListBase } from '@react-navigation/native';

import { rootNavigationRef } from './RootNavigator';
import type { MainStackParamList } from './types';

/** Closes Record (and any stack above Tabs) and lands on the Feed tab like tapping the play icon. */
export function navigateToFeedTab(navigation: NavigationProp<ParamListBase>) {
  const resetAction = CommonActions.reset({
    index: 0,
    routes: [
      {
        name: 'Tabs',
        state: {
          index: 2,
          routes: [
            { name: 'Today' },
            { name: 'Best' },
            { name: 'Feed' },
            { name: 'Top' },
            { name: 'Chat' },
            { name: 'Me' },
          ],
        },
      },
    ],
  });

  if (rootNavigationRef.isReady()) {
    rootNavigationRef.dispatch(resetAction);
    return;
  }
  navigation.dispatch(resetAction);
}

/** Record lives on the root stack (modal), not inside tabs — resolve the stack that owns `Record`. */
/** Opens `UserProfile` on the root stack (works from nested tab routes like Top). */
export function navigateToUserProfile(
  navigation: NavigationProp<ParamListBase>,
  params: MainStackParamList['UserProfile']
) {
  if (rootNavigationRef.isReady()) {
    rootNavigationRef.navigate('UserProfile', params);
    return;
  }
  const parent = navigation.getParent?.();
  const nav = parent ?? navigation;
  (nav as { navigate: (name: 'UserProfile', p: MainStackParamList['UserProfile']) => void }).navigate(
    'UserProfile',
    params
  );
}

export function navigateToRecord(navigation: NavigationProp<ParamListBase>) {
  if (rootNavigationRef.isReady()) {
    rootNavigationRef.navigate('Record');
    return;
  }
  const parent = navigation.getParent?.();
  if (parent?.navigate) {
    parent.navigate('Record' as never);
    return;
  }
  navigation.navigate('Record' as never);
}

export function navigateToBestPartCapture(navigation: NavigationProp<ParamListBase>) {
  if (rootNavigationRef.isReady()) {
    rootNavigationRef.navigate('BestPartCapture');
    return;
  }
  const parent = navigation.getParent?.();
  if (parent?.navigate) {
    parent.navigate('BestPartCapture' as never);
    return;
  }
  navigation.navigate('BestPartCapture' as never);
}

export function navigateToBestPartWeekRecap(
  navigation: NavigationProp<ParamListBase>,
  params: MainStackParamList['BestPartWeekRecap']
) {
  if (rootNavigationRef.isReady()) {
    rootNavigationRef.navigate('BestPartWeekRecap', params);
    return;
  }
  const parent = navigation.getParent?.();
  if (parent?.navigate) {
    (parent as { navigate: (n: 'BestPartWeekRecap', p: typeof params) => void }).navigate(
      'BestPartWeekRecap',
      params
    );
    return;
  }
  (navigation as { navigate: (n: 'BestPartWeekRecap', p: typeof params) => void }).navigate(
    'BestPartWeekRecap',
    params
  );
}

const tabsStateToday = {
  index: 0,
  routes: [
    { name: 'Today' as const },
    { name: 'Best' as const },
    { name: 'Feed' as const },
    { name: 'Top' as const },
    { name: 'Chat' as const },
    { name: 'Me' as const },
  ],
};

/** Dismisses Settings / intro modals and opens Record with Today (home) underneath. */
export function navigateToTodayAndRecord() {
  const resetAction = CommonActions.reset({
    index: 1,
    routes: [{ name: 'Tabs', state: tabsStateToday }, { name: 'Record' }],
  });

  if (rootNavigationRef.isReady()) {
    rootNavigationRef.dispatch(resetAction);
    return;
  }
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
