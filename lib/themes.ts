export interface ThemeConfig {
  id: string
  name: string
  color: string // Hex code for swatch
  primary: string
  primaryHover: string
  secondary: string
  glow: string
  ringColor: string
  borderAccent: string
}

export const THEMES: ThemeConfig[] = [
  {
    id: 'white',
    name: 'Pure White',
    color: '#ffffff',
    primary: '#ffffff',
    primaryHover: '#f4f4f5',
    secondary: '#a1a1aa',
    glow: 'rgba(255, 255, 255, 0.45)',
    ringColor: 'ring-white',
    borderAccent: 'rgba(255, 255, 255, 0.4)',
  },
  {
    id: 'emerald',
    name: 'Emerald Jade',
    color: '#10b981',
    primary: '#10b981',
    primaryHover: '#059669',
    secondary: '#047857',
    glow: 'rgba(16, 185, 129, 0.35)',
    ringColor: 'ring-emerald-400',
    borderAccent: 'rgba(16, 185, 129, 0.4)',
  },
  {
    id: 'cyan',
    name: 'Cyber Cyan',
    color: '#06b6d4',
    primary: '#06b6d4',
    primaryHover: '#0891b2',
    secondary: '#0e7490',
    glow: 'rgba(6, 182, 212, 0.35)',
    ringColor: 'ring-cyan-400',
    borderAccent: 'rgba(6, 182, 212, 0.4)',
  },
  {
    id: 'violet',
    name: 'Neon Violet',
    color: '#a855f7',
    primary: '#a855f7',
    primaryHover: '#9333ea',
    secondary: '#7e22ce',
    glow: 'rgba(168, 85, 247, 0.35)',
    ringColor: 'ring-purple-400',
    borderAccent: 'rgba(168, 85, 247, 0.4)',
  },
  {
    id: 'ruby',
    name: 'Crimson Ruby',
    color: '#f43f5e',
    primary: '#f43f5e',
    primaryHover: '#e11d48',
    secondary: '#be123c',
    glow: 'rgba(244, 63, 94, 0.35)',
    ringColor: 'ring-rose-400',
    borderAccent: 'rgba(244, 63, 94, 0.4)',
  },
  {
    id: 'gold',
    name: 'Solar Amber',
    color: '#f59e0b',
    primary: '#f59e0b',
    primaryHover: '#d97706',
    secondary: '#b45309',
    glow: 'rgba(245, 158, 11, 0.35)',
    ringColor: 'ring-amber-400',
    borderAccent: 'rgba(245, 158, 11, 0.4)',
  },
  {
    id: 'blue',
    name: 'Electric Blue',
    color: '#3b82f6',
    primary: '#3b82f6',
    primaryHover: '#2563eb',
    secondary: '#1d4ed8',
    glow: 'rgba(59, 130, 246, 0.35)',
    ringColor: 'ring-blue-400',
    borderAccent: 'rgba(59, 130, 246, 0.4)',
  },
]
