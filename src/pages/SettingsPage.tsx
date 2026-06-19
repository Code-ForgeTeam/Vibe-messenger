import {
  Avatar,
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  IconButton,
  Paper,
  Typography,
  Button,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import NotificationsNoneRoundedIcon from '@mui/icons-material/NotificationsNoneRounded';
import StorageRoundedIcon from '@mui/icons-material/StorageRounded';
import DevicesRoundedIcon from '@mui/icons-material/DevicesRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@mui/material/styles';
import { useSettingsStore } from '../stores/settingsStore';
import { useAuthStore } from '../stores/authStore';
import { useSnackbarStore } from '../stores/snackbarStore';
import { AppHeader } from '../components/AppHeader';

export default function SettingsPage() {
  const navigate = useNavigate();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const { theme: appTheme, setTheme } = useSettingsStore();
  const push = useSnackbarStore((s) => s.push);

  const [showLogoutDialog, setShowLogoutDialog] = useState(false);

  const aboutTapRef = useRef<{ count: number; timer: number | null }>({ count: 0, timer: null });
  useEffect(
    () => () => {
      if (aboutTapRef.current.timer) {
        window.clearTimeout(aboutTapRef.current.timer);
      }
    },
    [],
  );

  const onAboutTap = () => {
    const state = aboutTapRef.current;
    state.count += 1;
    if (state.timer) {
      window.clearTimeout(state.timer);
    }
    state.timer = window.setTimeout(() => {
      state.count = 0;
      state.timer = null;
    }, 800);

    if (state.count >= 3) {
      state.count = 0;
      if (state.timer) {
        window.clearTimeout(state.timer);
        state.timer = null;
      }
      window.open('http://code-forge.ru', '_blank', 'noopener,noreferrer');
      push({ message: 'Открываем code-forge.ru', timeout: 1800, tone: 'success' });
      return;
    }

    navigate('/author-support');
  };

  return (
    <Box
      sx={{
        px: 1.5,
        pb: 'max(env(safe-area-inset-bottom), 92px)',
        height: '100%',
        overflowY: 'auto',
        bgcolor: 'transparent',
      }}
    >
      <AppHeader title="Настройки" />

      <Paper
        elevation={0}
        sx={{ p: 1.5, mb: 1.2, borderRadius: 3, bgcolor: isDark ? 'rgba(16,29,46,0.68)' : 'rgba(255,255,255,0.74)' }}
      >
        <Box sx={{ textAlign: 'center', pb: 0.5, position: 'relative' }}>
          <IconButton
            onClick={() => navigate('/edit-profile')}
            sx={{
              position: 'absolute',
              top: 0,
              right: 0,
              bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(31,163,91,0.12)',
            }}
          >
            <EditIcon />
          </IconButton>
          <Avatar
            src={user?.avatar}
            sx={{
              width: 94,
              height: 94,
              mx: 'auto',
              mb: 1,
              bgcolor: isDark ? '#2B5F8F' : 'primary.main',
              cursor: 'pointer',
            }}
            onClick={() => user?.id && navigate(`/user/${user.id}`)}
          >
            {(user?.fullName || user?.username || 'U').slice(0, 1).toUpperCase()}
          </Avatar>
          <Typography fontWeight={700}>{user?.fullName || 'Пользователь'}</Typography>
          <Typography color="text.secondary">@{user?.username || 'username'}</Typography>
        </Box>
      </Paper>

      <Paper
        elevation={0}
        sx={{ borderRadius: 3, overflow: 'hidden', mb: 1.2, bgcolor: isDark ? 'rgba(16,29,46,0.66)' : 'rgba(255,255,255,0.74)' }}
      >
        <Typography sx={{ px: 2, pt: 1.5, pb: 0.5, color: 'text.secondary', fontSize: 13 }}>Основные</Typography>
        <List disablePadding>
          <ListItemButton onClick={() => navigate('/chat-settings')} sx={{ py: 1.25 }}>
            <ListItemIcon sx={{ minWidth: 38, color: 'text.secondary' }}>
              <ChatBubbleOutlineRoundedIcon />
            </ListItemIcon>
            <ListItemText primary="Настройки чатов" primaryTypographyProps={{ fontSize: 15, fontWeight: 500 }} />
          </ListItemButton>
          <ListItemButton onClick={() => navigate('/privacy')} sx={{ py: 1.25 }}>
            <ListItemIcon sx={{ minWidth: 38, color: 'text.secondary' }}>
              <LockOutlinedIcon />
            </ListItemIcon>
            <ListItemText primary="Конфиденциальность" primaryTypographyProps={{ fontSize: 15, fontWeight: 500 }} />
          </ListItemButton>
          <ListItemButton onClick={() => navigate('/notifications-settings')} sx={{ py: 1.25 }}>
            <ListItemIcon sx={{ minWidth: 38, color: 'text.secondary' }}>
              <NotificationsNoneRoundedIcon />
            </ListItemIcon>
            <ListItemText primary="Уведомления" primaryTypographyProps={{ fontSize: 15, fontWeight: 500 }} />
          </ListItemButton>
          <ListItemButton onClick={() => navigate('/data-storage')} sx={{ py: 1.25 }}>
            <ListItemIcon sx={{ minWidth: 38, color: 'text.secondary' }}>
              <StorageRoundedIcon />
            </ListItemIcon>
            <ListItemText primary="Данные и хранилище" primaryTypographyProps={{ fontSize: 15, fontWeight: 500 }} />
          </ListItemButton>
          <ListItemButton onClick={() => navigate('/devices')} sx={{ py: 1.25 }}>
            <ListItemIcon sx={{ minWidth: 38, color: 'text.secondary' }}>
              <DevicesRoundedIcon />
            </ListItemIcon>
            <ListItemText primary="Устройства" primaryTypographyProps={{ fontSize: 15, fontWeight: 500 }} />
          </ListItemButton>
          <ListItemButton onClick={() => navigate('/special-features')} sx={{ py: 1.25 }}>
            <ListItemIcon sx={{ minWidth: 38, color: 'text.secondary' }}>
              <AutoAwesomeRoundedIcon />
            </ListItemIcon>
            <ListItemText primary="Спец. возможности" primaryTypographyProps={{ fontSize: 15, fontWeight: 500 }} />
          </ListItemButton>
        </List>
      </Paper>

      <Paper elevation={0} sx={{ borderRadius: 3, overflow: 'hidden', bgcolor: isDark ? 'rgba(16,29,46,0.66)' : 'rgba(255,255,255,0.74)' }}>
        <Typography sx={{ px: 2, pt: 1.5, pb: 0.5, color: 'text.secondary', fontSize: 13 }}>Приложение</Typography>
        <List disablePadding>
          <ListItemButton onClick={() => setTheme(appTheme === 'dark' ? 'light' : 'dark')} sx={{ py: 1.25 }}>
            <ListItemIcon sx={{ minWidth: 38, color: 'text.secondary' }}>
              <PaletteOutlinedIcon />
            </ListItemIcon>
            <ListItemText
              primary={appTheme === 'dark' ? 'Тема: Тёмная' : 'Тема: Светлая'}
              primaryTypographyProps={{ fontSize: 15, fontWeight: 500 }}
            />
          </ListItemButton>
          <ListItemButton onClick={onAboutTap} sx={{ py: 1.25 }}>
            <ListItemIcon sx={{ minWidth: 38, color: 'text.secondary' }}>
              <InfoOutlinedIcon />
            </ListItemIcon>
            <ListItemText primary="О приложении" primaryTypographyProps={{ fontSize: 15, fontWeight: 500 }} />
          </ListItemButton>
        </List>

        <Divider />

        <List disablePadding>
          <ListItemButton onClick={() => setShowLogoutDialog(true)} sx={{ py: 1.25 }}>
            <ListItemIcon sx={{ minWidth: 38, color: 'error.main' }}>
              <LogoutRoundedIcon />
            </ListItemIcon>
            <ListItemText primary="Выйти" primaryTypographyProps={{ color: 'error.main', fontSize: 15, fontWeight: 600 }} />
          </ListItemButton>
        </List>
      </Paper>

      <Dialog open={showLogoutDialog} onClose={() => setShowLogoutDialog(false)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ color: 'error.main', fontWeight: 800 }}>Выйти из аккаунта?</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary">Вы всегда сможете войти снова по логину и паролю.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowLogoutDialog(false)}>Нет</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              setShowLogoutDialog(false);
              logout();
            }}
          >
            Да
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
