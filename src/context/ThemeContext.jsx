import React, { createContext, useContext, useMemo, useState, useEffect } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../supabase/client';

const themeColors = {
  'blue-600': '#2563eb',
  'emerald-500': '#10b981',
  'purple-600': '#7c3aed',
  'rose-500': '#f43f5e',
  'amber-500': '#f59e42',
};

const ThemeContext = createContext();

export function useThemeContext() {
  return useContext(ThemeContext);
}

export function ThemeContextProvider({ children }) {
  const { user, profile } = useAuth();
  const [mode, setModeState] = useState('light');
  const [accent, setAccentState] = useState('blue-600');
  const [loading, setLoading] = useState(true);

  // Load theme/accent from profile or localStorage
  useEffect(() => {
    async function loadTheme() {
      if (profile) {
        setModeState(profile.theme || 'light');
        setAccentState(profile.accent_color || 'blue-600');
      } else {
        setModeState(localStorage.getItem('theme') || 'light');
        setAccentState(localStorage.getItem('themeColor') || 'blue-600');
      }
      setLoading(false);
    }
    loadTheme();
  }, [profile]);

  // Save to localStorage and update <html> for custom CSS
  useEffect(() => {
    if (!loading) {
      localStorage.setItem('theme', mode);
      localStorage.setItem('themeColor', accent);
      document.documentElement.classList.toggle('dark', mode === 'dark');
      document.documentElement.style.setProperty('--accent', themeColors[accent] || themeColors['blue-600']);
    }
  }, [mode, accent, loading]);

  // Update Supabase profile when theme/accent changes (if logged in)
  useEffect(() => {
    if (!loading && user) {
      // Only update if values differ from profile
      if ((profile?.theme !== mode || profile?.accent_color !== accent)) {
        supabase.from('profiles').update({ theme: mode, accent_color: accent }).eq('id', user.id);
      }
    }
  }, [mode, accent, user, profile, loading]);

  const setMode = (newMode) => setModeState(newMode);
  const setAccent = (newAccent) => setAccentState(newAccent);

  const theme = useMemo(() =>
    createTheme({
      palette: {
        mode,
        primary: {
          main: themeColors[accent] || themeColors['blue-600'],
        },
        background: {
          default: '#fff',
          paper: '#fff',
        },
        text: {
          primary: '#111',
          secondary: '#444',
        },
      },
      typography: {
        fontFamily: 'Inter, Montserrat, system-ui',
        fontWeightBold: 900,
        fontWeightMedium: 700,
        fontWeightRegular: 500,
        h1: { fontWeight: 900 },
        h2: { fontWeight: 900 },
        h3: { fontWeight: 800 },
        h4: { fontWeight: 800 },
        h5: { fontWeight: 700 },
        h6: { fontWeight: 700 },
        button: { fontWeight: 700, textTransform: 'none', borderRadius: 999 },
      },
      shape: {
        borderRadius: 16,
      },
      components: {
        MuiPaper: {
          styleOverrides: {
            root: {
              backgroundColor: '#fff',
              borderRadius: 16,
              boxShadow: '0 2px 12px 0 rgba(16,24,40,0.04)',
              border: '1px solid #eee',
            },
          },
        },
        MuiButton: {
          styleOverrides: {
            root: {
              borderRadius: 999,
              fontWeight: 700,
              fontSize: 16,
              boxShadow: 'none',
              textTransform: 'none',
              padding: '8px 28px',
            },
            containedPrimary: {
              color: '#fff',
              backgroundColor: '#222',
              '&:hover': { backgroundColor: '#111' },
            },
            outlined: {
              borderRadius: 999,
              borderWidth: 2,
              fontWeight: 700,
            },
          },
        },
        MuiTableContainer: {
          styleOverrides: {
            root: {
              background: '#fff',
              borderRadius: 16,
              border: '1px solid #eee',
              boxShadow: 'none',
            },
          },
        },
        MuiTableCell: {
          styleOverrides: {
            root: {
              borderBottom: '1px solid #f3f3f3',
              fontSize: 16,
              color: '#111',
            },
            head: {
              fontWeight: 800,
              color: '#111',
              background: '#fafbfc',
            },
          },
        },
        MuiTextField: {
          styleOverrides: {
            root: {
              borderRadius: 12,
              background: '#fafbfc',
            },
          },
        },
        MuiInputBase: {
          styleOverrides: {
            root: {
              borderRadius: 12,
              background: '#fafbfc',
            },
          },
        },
        MuiAlert: {
          styleOverrides: {
            root: {
              borderRadius: 12,
              fontWeight: 600,
            },
          },
        },
      },
    }),
    [mode, accent]
  );

  const value = {
    mode,
    setMode,
    accent,
    setAccent,
    loading,
  };

  return (
    <ThemeContext.Provider value={value}>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </ThemeContext.Provider>
  );
} 