/**
 * "Neighborly" look (CLAUDE.md, design/checkin-composites). Every color a
 * screen uses comes from a Theme, so dark and high-contrast themes can be
 * added later as new objects without touching screens.
 */
import { createContext, useContext } from 'react';

export interface Theme {
  name: 'light';
  colors: {
    background: string;
    surface: string;
    text: string;
    textMuted: string;
    primary: string;
    primaryPressed: string;
    onPrimary: string;
    /** Soft terracotta wash for banners and condition summaries. */
    accentSoft: string;
    onAccentSoft: string;
    placeholder: string;
    border: string;
    dashed: string;
    success: string;
    danger: string;
    /** The camera step is dark in the designs. */
    camera: {
      background: string;
      surface: string;
      raised: string;
      text: string;
      textMuted: string;
      accent: string;
      shutter: string;
      track: string;
    };
  };
  fonts: { regular: string; semibold: string; bold: string; extrabold: string };
  radius: { sm: number; md: number; lg: number; xl: number; pill: number };
  shadow: { shadowColor: string; shadowOpacity: number; shadowRadius: number; shadowOffset: { width: number; height: number }; elevation: number };
}

export const lightTheme: Theme = {
  name: 'light',
  colors: {
    background: '#FBF6F1',
    surface: '#FFFFFF',
    text: '#2A1F1A',
    textMuted: '#6B5648',
    primary: '#A8482A',
    primaryPressed: '#83361E',
    onPrimary: '#FFFFFF',
    accentSoft: '#FBE7DA',
    onAccentSoft: '#5A2A16',
    placeholder: '#E6D9CC',
    border: '#E6D9CC',
    dashed: '#C9A792',
    success: '#3F7A4A',
    danger: '#A8482A',
    camera: {
      background: '#2A1F1A',
      surface: '#3D2F28',
      raised: '#4A3A31',
      text: '#FBF6F1',
      textMuted: '#E3C9BA',
      accent: '#F2B9A0',
      shutter: '#C65A35',
      track: '#4A3A31',
    },
  },
  fonts: {
    regular: 'Nunito_400Regular',
    semibold: 'Nunito_600SemiBold',
    bold: 'Nunito_700Bold',
    extrabold: 'Nunito_800ExtraBold',
  },
  radius: { sm: 14, md: 20, lg: 24, xl: 32, pill: 999 },
  shadow: {
    shadowColor: '#5A321E',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
};

export const ThemeContext = createContext<Theme>(lightTheme);

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
