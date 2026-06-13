export type PodiumTier = 1 | 2 | 3;

export type PodiumTierStyles = {
  /** Left accent bar */
  accent: string;
  /** Row background wash */
  bg: string;
  /** Rank numeral color */
  rank: string;
  /** Avatar ring */
  ring: string;
};

const LIGHT_PODIUM: Record<PodiumTier, PodiumTierStyles> = {
  1: {
    accent: '#D4AF37',
    bg: 'rgba(212, 175, 55, 0.14)',
    rank: '#B8860B',
    ring: '#D4AF37',
  },
  2: {
    accent: '#94A3B8',
    bg: 'rgba(148, 163, 184, 0.16)',
    rank: '#64748B',
    ring: '#94A3B8',
  },
  3: {
    accent: '#C97A3D',
    bg: 'rgba(201, 122, 61, 0.14)',
    rank: '#A0622E',
    ring: '#C97A3D',
  },
};

const DARK_PODIUM: Record<PodiumTier, PodiumTierStyles> = {
  1: {
    accent: '#F5C518',
    bg: 'rgba(245, 197, 24, 0.10)',
    rank: '#F5C518',
    ring: '#F5C518',
  },
  2: {
    accent: '#B0BEC5',
    bg: 'rgba(176, 190, 197, 0.10)',
    rank: '#CFD8DC',
    ring: '#B0BEC5',
  },
  3: {
    accent: '#E8965A',
    bg: 'rgba(232, 150, 90, 0.10)',
    rank: '#E8965A',
    ring: '#E8965A',
  },
};

export function podiumTierStyles(rank: number, isDark: boolean): PodiumTierStyles | null {
  if (rank < 1 || rank > 3) return null;
  const table = isDark ? DARK_PODIUM : LIGHT_PODIUM;
  return table[rank as PodiumTier];
}
