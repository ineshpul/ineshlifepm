export type AppColors = {
  bg: string;
  card: string;
  cardTint: string;
  text: string;
  text2: string;
  muted: string;
  muted2: string;
  border: string;
  border2: string;
  inputBg: string;
  green: string;
  moss: string;
  coral: string;
  black: string;
  white: string;
  danger: string;
  overlay: string;
  watermarkMeta: string;
  /** Soft accent border on profile cards */
  profileAccentBorder: string;
  /** Tab bar pill background */
  tabBarPill: string;
  /** Switch track when off */
  switchTrackOff: string;
  /** Switch thumb on Android when off */
  switchThumbOff: string;
  /** Leaderboard podium accent (top 3) */
  podiumAccent: string;
  podiumBg: string;
  podiumRank: string;
  /** Most-improved weekly callout */
  highlightCardBorder: string;
  highlightCardBg: string;
  highlightCardBadge: string;
  /** Current-user highlight on leaperboard rows */
  leaderboardMeBg: string;
};

export const lightColors: AppColors = {
  bg: '#FFFFFF',
  card: '#FFFFFF',
  cardTint: '#F1F8E9',
  text: '#000000',
  text2: '#1A1A1A',
  muted: '#666666',
  muted2: '#888888',
  border: '#C8E6C9',
  border2: '#E1F5E1',
  inputBg: '#FAFBFC',
  green: '#2E7D32',
  moss: '#4CAF50',
  coral: '#FF6B54',
  black: '#000000',
  white: '#FFFFFF',
  danger: '#FF6B54',
  overlay: 'rgba(0,0,0,0.55)',
  watermarkMeta: '#A5D6A7',
  profileAccentBorder: '#E6F4D7',
  tabBarPill: 'rgba(255, 255, 255, 0.96)',
  switchTrackOff: '#D1D5DB',
  switchThumbOff: '#F3F4F6',
  podiumAccent: '#C9A227',
  podiumBg: 'rgba(255, 215, 0, 0.10)',
  podiumRank: '#B8860B',
  highlightCardBorder: '#E67E22',
  highlightCardBg: 'rgba(255, 152, 0, 0.10)',
  highlightCardBadge: '#C0392B',
  leaderboardMeBg: 'rgba(39, 174, 96, 0.08)',
};

export const darkColors: AppColors = {
  bg: '#0B0F0E',
  card: '#141A18',
  cardTint: '#1A231F',
  text: '#F4F7F5',
  text2: '#DDE4E0',
  muted: '#9CA8A3',
  muted2: '#6B7872',
  border: '#2A3D32',
  border2: '#1F2E27',
  inputBg: '#1A231F',
  green: '#66BB6A',
  moss: '#81C784',
  coral: '#FF8A75',
  black: '#000000',
  white: '#FFFFFF',
  danger: '#FF8A75',
  overlay: 'rgba(0,0,0,0.65)',
  watermarkMeta: '#4CAF50',
  profileAccentBorder: '#2A3D32',
  tabBarPill: 'rgba(20, 26, 24, 0.96)',
  switchTrackOff: '#374151',
  switchThumbOff: '#9CA3AF',
  podiumAccent: '#4A6354',
  podiumBg: 'rgba(129, 199, 132, 0.10)',
  podiumRank: '#81C784',
  highlightCardBorder: '#3D5244',
  highlightCardBg: 'rgba(129, 199, 132, 0.08)',
  highlightCardBadge: '#81C784',
  leaderboardMeBg: 'rgba(129, 199, 132, 0.10)',
};

/** @deprecated Use `useTheme().colors` — kept for gradual migration. */
export const colors = lightColors;

export type ColorName = keyof AppColors;
