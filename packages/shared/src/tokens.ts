// Design tokens shared by web (CSS vars) and mobile (StyleSheet).
export const tokens = {
  color: {
    // slate palette matching the logo (#758FA8); light accent is darker so white button text stays readable (WCAG AA)
    dark: { bg: '#0e1116', surface: '#161a21', surface2: '#1f242d', border: '#2a303b', text: '#eef1f5', muted: '#8b95a5', accent: '#8ea6bf', accentText: '#0d1218', danger: '#ff5c6c', warn: '#f5a524' },
    light: { bg: '#f5f7fa', surface: '#ffffff', surface2: '#eceff4', border: '#dfe4eb', text: '#141920', muted: '#66707f', accent: '#4f6a86', accentText: '#ffffff', danger: '#dc2f42', warn: '#b7790a' },
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
