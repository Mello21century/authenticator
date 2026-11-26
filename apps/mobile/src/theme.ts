import { useColorScheme } from 'react-native';
import { tokens, type ThemeColors } from '@auth/shared';

export const useTheme = (): ThemeColors => tokens.color[useColorScheme() === 'light' ? 'light' : 'dark'];
export const mono = 'Menlo';
