import 'react-native-gesture-handler';
import { enableFreeze, enableScreens } from 'react-native-screens';
import { registerRootComponent } from 'expo';

import App from './App';

// Show events in Firebase / GA4 DebugView during development builds.
if (__DEV__) {
  (globalThis as { RNFBDebug?: boolean }).RNFBDebug = true;
}

enableScreens(true);
enableFreeze(true);

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
