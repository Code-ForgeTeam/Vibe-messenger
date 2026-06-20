import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { CssBaseline, ThemeProvider } from '@mui/material';
import App from './App';
import { useSettingsStore } from './stores/settingsStore';
import { createCustomTheme, darkTheme, lightTheme } from './theme/themes';
import { useEffect } from 'react';

function Root() {
  const { theme, customColors, fontSize } = useSettingsStore();
  const muiTheme = theme === 'dark' ? darkTheme : theme === 'light' ? lightTheme : createCustomTheme(customColors);

  useEffect(() => {
    const sizeMap: Record<typeof fontSize, string> = {
      small: '14px',
      medium: '16px',
      large: '18px',
    };
    document.documentElement.style.fontSize = sizeMap[fontSize] || '16px';
  }, [fontSize]);

  return (
    <ThemeProvider theme={muiTheme}>
      <CssBaseline />
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  );
}

const updateHeight = () => {
  const nextHeight = window.visualViewport?.height ?? window.innerHeight;
  document.documentElement.style.setProperty('--app-height', `${nextHeight}px`);
};

window.visualViewport?.addEventListener('resize', updateHeight);
window.visualViewport?.addEventListener('scroll', updateHeight);
window.addEventListener('resize', updateHeight);
updateHeight();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
