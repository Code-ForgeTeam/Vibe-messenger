import { BottomNavigation, BottomNavigationAction, Paper } from '@mui/material';
import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import Groups2RoundedIcon from '@mui/icons-material/Groups2Rounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useAdminStore } from '../stores/adminStore';
import { alpha, useTheme } from '@mui/material/styles';
import { isCreatorUser } from '../lib/creator';

export function BottomNav() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const user = useAuthStore((s) => s.user);
  const canUseAdminTools = useAdminStore((s) => s.canUseAdminTools);
  const isAdmin = isCreatorUser(user) || canUseAdminTools;

  const tabs = [
    { path: '/chats', label: 'Чаты', icon: <ChatBubbleOutlineRoundedIcon /> },
    { path: '/contacts', label: 'Контакты', icon: <Groups2RoundedIcon /> },
    { path: '/settings', label: 'Настройки', icon: <SettingsRoundedIcon /> },
    ...(isAdmin ? [{ path: '/admin', label: 'Админ', icon: <AdminPanelSettingsIcon /> }] : []),
  ];

  const value = tabs.findIndex((t) => t.path === pathname);
  if (value < 0) return null;

  return (
    <Paper
      sx={{
        position: 'fixed',
        left: 'max(env(safe-area-inset-left), 16px)',
        right: 'max(env(safe-area-inset-right), 16px)',
        bottom: 'max(env(safe-area-inset-bottom), 14px)',
        borderRadius: 999,
        overflow: 'hidden',
        border: '1px solid',
        borderColor: alpha(isDark ? '#D8E7FF' : '#153528', isDark ? 0.12 : 0.08),
        backdropFilter: 'blur(18px)',
        bgcolor: isDark ? 'rgba(16,28,43,0.82)' : 'rgba(255,255,255,0.82)',
        boxShadow: isDark
          ? '0 18px 44px rgba(0,0,0,0.32)'
          : '0 18px 44px rgba(20,70,50,0.14)',
      }}
    >
      <BottomNavigation
        value={value}
        onChange={(_, v) => navigate(tabs[v].path)}
        showLabels
        sx={{
          height: 78,
          px: 0.7,
          '& .MuiBottomNavigationAction-root': {
            color: isDark ? '#95A2B3' : '#7AA08B',
            minWidth: 64,
            mx: 0.18,
            my: 0.7,
            transition: 'transform 0.16s ease, background-color 0.16s ease, color 0.16s ease',
          },
          '& .MuiBottomNavigationAction-label': {
            fontSize: 12,
            marginTop: '2px',
          },
          '& .MuiBottomNavigationAction-root.Mui-selected': {
            color: isDark ? '#8CC8FF' : '#229A68',
            bgcolor: isDark ? 'rgba(100,180,255,0.14)' : 'rgba(34,154,104,0.12)',
            transform: 'translateY(-1px)',
          },
          bgcolor: 'transparent',
        }}
      >
        {tabs.map((tab) => (
          <BottomNavigationAction key={tab.path} label={tab.label} icon={tab.icon} />
        ))}
      </BottomNavigation>
    </Paper>
  );
}
