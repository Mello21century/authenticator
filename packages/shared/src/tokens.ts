// Design tokens shared by web (CSS vars) and mobile (StyleSheet).
export const tokens = {
  color: {
    // accent from Proton Authenticator's asset catalog (AccentColor light/dark); rest is our own palette
    dark: { bg: '#0f0e15', surface: '#191823', surface2: '#232130', border: '#2d2b3b', text: '#f3f2f8', muted: '#9593a6', accent: '#b080ff', accentText: '#140b26', danger: '#ff5c6c', warn: '#f5a524' },
    light: { bg: '#f6f5fb', surface: '#ffffff', surface2: '#eeecf6', border: '#e3e1ee', text: '#16141f', muted: '#6a6780', accent: '#6d4aff', accentText: '#ffffff', danger: '#dc2f42', warn: '#b7790a' },
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
