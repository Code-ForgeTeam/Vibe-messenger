import { useState } from 'react';
import { Box, Button, CircularProgress, Paper, TextField, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { useAuthStore } from '../stores/authStore';
import { APP_NAME } from '../lib/appMeta';

export function AuthPage() {
  const { login, register, isLoading, error } = useAuthStore();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    const normalizedUsername = username.trim();
    const normalizedFullName = fullName.trim();

    try {
      if (isRegister) {
        await register(normalizedUsername, normalizedFullName, password);
      } else {
        await login(normalizedUsername, password);
      }
    } catch {
      // Error text is stored in authStore and rendered below.
    }
  };

  return (
    <Box sx={{ height: '100%', display: 'grid', placeItems: 'center', p: 2.2 }}>
      <Paper
        component="form"
        onSubmit={submit}
        sx={{
          width: '100%',
          maxWidth: 420,
          p: { xs: 2, sm: 2.5 },
          borderRadius: 4,
          bgcolor: isDark ? 'rgba(15, 28, 43, 0.86)' : 'rgba(255, 255, 255, 0.86)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: isDark
              ? 'radial-gradient(circle at top right, rgba(100,180,255,0.18), transparent 32%), radial-gradient(circle at top left, rgba(123,226,196,0.12), transparent 24%)'
              : 'radial-gradient(circle at top right, rgba(34,154,104,0.16), transparent 32%), radial-gradient(circle at top left, rgba(77,124,254,0.10), transparent 24%)',
          }}
        />

        <Box sx={{ position: 'relative', zIndex: 1 }}>
          <Typography
            variant="overline"
            sx={{
              color: isDark ? '#8EBBF0' : '#229A68',
              letterSpacing: '0.18em',
              fontWeight: 800,
            }}
          >
            messenger
          </Typography>
          <Typography variant="h4" sx={{ mt: 0.25, mb: 0.7 }}>
            {APP_NAME}
          </Typography>
          <Typography sx={{ mb: 2.2, color: 'text.secondary' }}>
            Современный чат, статусы и быстрый доступ ко всему важному в одном месте.
          </Typography>

          <TextField
            fullWidth
            label="Имя пользователя"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            sx={{ mb: 2 }}
          />

          {isRegister && (
            <TextField
              fullWidth
              label="Имя и фамилия"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              sx={{ mb: 2 }}
            />
          )}

          <TextField
            fullWidth
            type="password"
            label="Пароль"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            sx={{ mb: 2 }}
          />

          {error && (
            <Box
              sx={{
                mb: 2,
                px: 1.2,
                py: 1,
                borderRadius: 2,
                border: '1px solid',
                borderColor: alpha(theme.palette.error.main, 0.32),
                bgcolor: alpha(theme.palette.error.main, 0.08),
              }}
            >
              <Typography color="error" sx={{ fontSize: 14 }}>
                {error}
              </Typography>
            </Box>
          )}

          <Button fullWidth type="submit" variant="contained" disabled={isLoading}>
            {isLoading ? <CircularProgress size={18} color="inherit" /> : isRegister ? 'Создать аккаунт' : 'Войти'}
          </Button>
          <Button fullWidth sx={{ mt: 1.1 }} onClick={() => setIsRegister((v) => !v)}>
            {isRegister ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться'}
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}
