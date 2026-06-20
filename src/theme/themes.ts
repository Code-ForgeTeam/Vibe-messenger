import { alpha, createTheme } from '@mui/material/styles';

const FONT_FAMILY = '"Manrope", "SF Pro Display", "Segoe UI Variable", "Segoe UI", sans-serif';

const buildTheme = ({
  mode,
  primary,
  secondary,
  backgroundDefault,
  paper,
  textPrimary,
  textSecondary,
  bodyBackground,
}: {
  mode: 'light' | 'dark';
  primary: string;
  secondary: string;
  backgroundDefault: string;
  paper: string;
  textPrimary: string;
  textSecondary: string;
  bodyBackground: string;
}) =>
  createTheme({
    palette: {
      mode,
      primary: { main: primary },
      secondary: { main: secondary },
      background: {
        default: backgroundDefault,
        paper,
      },
      text: {
        primary: textPrimary,
        secondary: textSecondary,
      },
      divider: alpha(mode === 'dark' ? '#D8E7FF' : '#153528', mode === 'dark' ? 0.12 : 0.09),
    },
    shape: {
      borderRadius: 16,
    },
    typography: {
      fontFamily: FONT_FAMILY,
      h5: {
        fontWeight: 800,
        letterSpacing: '-0.03em',
      },
      h6: {
        fontWeight: 800,
        letterSpacing: '-0.025em',
      },
      subtitle1: {
        fontWeight: 700,
      },
      button: {
        fontWeight: 700,
        letterSpacing: '-0.01em',
        textTransform: 'none',
      },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ':root': {
            colorScheme: mode,
            '--vibe-accent': primary,
            '--vibe-surface': mode === 'dark' ? 'rgba(15, 27, 43, 0.74)' : 'rgba(255, 255, 255, 0.78)',
            '--vibe-surface-soft': mode === 'dark' ? 'rgba(19, 34, 53, 0.64)' : 'rgba(248, 251, 249, 0.84)',
            '--vibe-outline': mode === 'dark' ? 'rgba(195, 219, 247, 0.12)' : 'rgba(23, 53, 40, 0.08)',
          },
          html: {
            height: '100%',
          },
          body: {
            height: '100%',
            minHeight: '100%',
            background: bodyBackground,
            backgroundAttachment: 'fixed',
            overflow: 'hidden',
          },
          '#root': {
            height: '100%',
            minHeight: '100%',
          },
          '*': {
            scrollbarWidth: 'thin',
            scrollbarColor:
              mode === 'dark'
                ? 'rgba(146, 187, 233, 0.34) rgba(255, 255, 255, 0.02)'
                : 'rgba(31, 163, 91, 0.32) rgba(0, 0, 0, 0.02)',
          },
          '*::-webkit-scrollbar': {
            width: 7,
            height: 7,
          },
          '*::-webkit-scrollbar-thumb': {
            borderRadius: 999,
            backgroundColor:
              mode === 'dark'
                ? 'rgba(146, 187, 233, 0.28)'
                : 'rgba(31, 163, 91, 0.28)',
          },
          '*::-webkit-scrollbar-track': {
            backgroundColor: 'transparent',
          },
        },
      },
      MuiPaper: {
        defaultProps: {
          elevation: 0,
        },
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            border: `1px solid ${alpha(mode === 'dark' ? '#D8E7FF' : '#153528', mode === 'dark' ? 0.12 : 0.08)}`,
            boxShadow:
              mode === 'dark'
                ? '0 18px 54px rgba(0, 0, 0, 0.22)'
                : '0 16px 40px rgba(25, 82, 57, 0.09)',
            backdropFilter: 'blur(16px)',
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: {
            minHeight: 42,
            borderRadius: 15,
            paddingInline: 18,
          },
          contained: {
            boxShadow:
              mode === 'dark'
                ? '0 12px 28px rgba(91, 161, 255, 0.28)'
                : '0 12px 26px rgba(31, 163, 91, 0.24)',
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            borderRadius: 14,
            transition: 'transform 0.16s ease, background-color 0.16s ease, box-shadow 0.16s ease',
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            borderRadius: 16,
            backgroundColor: alpha(mode === 'dark' ? '#14263B' : '#FFFFFF', mode === 'dark' ? 0.78 : 0.82),
            transition: 'box-shadow 0.18s ease, border-color 0.18s ease',
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: alpha(mode === 'dark' ? '#D8E7FF' : '#153528', mode === 'dark' ? 0.14 : 0.09),
            },
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: alpha(primary, 0.4),
            },
            '&.Mui-focused': {
              boxShadow:
                mode === 'dark'
                  ? '0 0 0 4px rgba(106, 176, 255, 0.12)'
                  : '0 0 0 4px rgba(31, 163, 91, 0.10)',
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: alpha(primary, 0.75),
            },
          },
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: {
            fontWeight: 600,
          },
        },
      },
      MuiBottomNavigation: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
          },
        },
      },
      MuiBottomNavigationAction: {
        styleOverrides: {
          root: {
            borderRadius: 16,
          },
          label: {
            fontWeight: 700,
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundImage: 'none',
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: 24,
            overflow: 'hidden',
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 16,
          },
        },
      },
    },
  });

export const darkTheme = buildTheme({
  mode: 'dark',
  primary: '#64B4FF',
  secondary: '#7BE2C4',
  backgroundDefault: '#08111D',
  paper: '#101C2B',
  textPrimary: '#F4F8FF',
  textSecondary: '#97AEC8',
  bodyBackground:
    'radial-gradient(circle at top left, rgba(100, 180, 255, 0.14), transparent 32%), radial-gradient(circle at top right, rgba(123, 226, 196, 0.12), transparent 24%), linear-gradient(180deg, #09121F 0%, #0B1624 48%, #08111D 100%)',
});

export const lightTheme = buildTheme({
  mode: 'light',
  primary: '#229A68',
  secondary: '#4D7CFE',
  backgroundDefault: '#EEF5F1',
  paper: '#FFFFFF',
  textPrimary: '#193128',
  textSecondary: '#61756B',
  bodyBackground:
    'radial-gradient(circle at top left, rgba(34, 154, 104, 0.14), transparent 32%), radial-gradient(circle at top right, rgba(77, 124, 254, 0.10), transparent 24%), linear-gradient(180deg, #F9FCFA 0%, #EFF5F1 46%, #E7F0EB 100%)',
});

export const createCustomTheme = (colors: {
  primary: string;
  secondary: string;
  background: string;
  paper: string;
}) =>
  buildTheme({
    mode: 'dark',
    primary: colors.primary,
    secondary: colors.secondary,
    backgroundDefault: colors.background,
    paper: colors.paper,
    textPrimary: '#FFFFFF',
    textSecondary: '#C3CED9',
    bodyBackground: `linear-gradient(180deg, ${colors.background} 0%, ${colors.paper} 100%)`,
  });
