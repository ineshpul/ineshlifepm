import type { NavigationProp, ParamListBase } from '@react-navigation/native';

/** Record lives on the root stack (modal), not inside tabs — resolve the stack that owns `Record`. */
export function navigateToRecord(navigation: NavigationProp<ParamListBase>) {
  const parent = navigation.getParent?.();
  if (parent?.navigate) {
    parent.navigate('Record' as never);
    return;
  }
  navigation.navigate('Record' as never);
}
