// Design tokens shared by web (CSS vars) and mobile (StyleSheet).
export const tokens = {
  color: {
    dark: { bg: '#16141c', surface: '#1f1d26', surface2: '#2a2733', border: '#33303d', text: '#f2f1f5', muted: '#9a98a6', accent: '#8b7cf6', accentText: '#ffffff', danger: '#e5484d', warn: '#f5a524' },
    light: { bg: '#f7f6fa', surface: '#ffffff', surface2: '#efedf4', border: '#e2e0e8', text: '#1a1822', muted: '#6b6878', accent: '#6d5ae6', accentText: '#ffffff', danger: '#d93036', warn: '#c7850e' },
  },
  radius: { sm: 8, md: 12, lg: 16, pill: 999 },
  space: [0, 4, 8, 12, 16, 24, 32, 48],
  font: {
    family: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif",
    mono: "'SF Mono', ui-monospace, Menlo, Consolas, monospace",
    size: { xs: 12, sm: 14, md: 16, lg: 20, xl: 28, code: 26 },
  },
};
export type ThemeName = keyof typeof tokens.color;
export type ThemeColors = (typeof tokens.color)['dark'];
