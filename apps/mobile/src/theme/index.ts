export const theme = {
  colors: {
    bg: '#0B0B0F',
    fg: '#F5F5F7',
    accent: '#E10600',
    muted: '#8A8A93',
    border: '#1F1F24',
  },
  radii: { sm: 4, md: 8, lg: 12 },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 },
  font: {
    family: { regular: 'System', bold: 'System' },
    size: { sm: 12, md: 14, lg: 16, xl: 20, xxl: 28 },
  },
} as const;

export type Theme = typeof theme;
