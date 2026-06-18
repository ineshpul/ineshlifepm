import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { DMMono_400Regular, DMMono_500Medium } from '@expo-google-fonts/dm-mono';

export const onboardingFontAssets = {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  DMMono_400Regular,
  DMMono_500Medium,
};

export const ob = {
  jakarta: {
    regular: 'PlusJakartaSans_400Regular',
    medium: 'PlusJakartaSans_500Medium',
    semibold: 'PlusJakartaSans_600SemiBold',
    bold: 'PlusJakartaSans_700Bold',
    extrabold: 'PlusJakartaSans_800ExtraBold',
  },
  mono: {
    regular: 'DMMono_400Regular',
    medium: 'DMMono_500Medium',
  },
} as const;

/** Design tokens from onboarding handoff (light-only). */
export const onboardingColors = {
  bg: '#FFFFFF',
  text: '#0B0F0E',
  muted: '#6B7872',
  soft: '#3A4A3A',
  line: '#E8F1E4',
  accent: '#2E7D32',
  coral: '#FF6B54',
  cam: '#0B0F0E',
  meBg: 'rgba(46,125,50,0.08)',
} as const;
