import type { ReactNode } from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNavigate } from 'react-router-dom';

interface AppHeaderProps {
  title: ReactNode;
  showBack?: boolean;
  backTo?: string;
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
}

export function AppHeader({ title, showBack = true, backTo = '/chats', leftSlot, rightSlot }: AppHeaderProps) {
  const navigate = useNavigate();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 9,
        pl: 'max(env(safe-area-inset-left), 8px)',
        pr: 'max(env(safe-area-inset-right), 8px)',
        pt: 'max(env(safe-area-inset-top), 12px)',
        pb: 1.1,
        mb: 1.15,
        backdropFilter: 'blur(18px)',
        background: isDark
          ? 'linear-gradient(180deg, rgba(8, 17, 29, 0.94) 46%, rgba(8, 17, 29, 0))'
          : 'linear-gradient(180deg, rgba(249, 252, 250, 0.94) 46%, rgba(249, 252, 250, 0))',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          minHeight: 58,
          px: 0.45,
          borderRadius: 3.2,
          border: '1px solid',
          borderColor: alpha(isDark ? '#D8E7FF' : '#153528', isDark ? 0.12 : 0.08),
          bgcolor: isDark ? 'rgba(16, 28, 43, 0.78)' : 'rgba(255, 255, 255, 0.78)',
          boxShadow: isDark
            ? '0 18px 36px rgba(0, 0, 0, 0.22)'
            : '0 18px 32px rgba(25, 82, 57, 0.08)',
        }}
      >
      {leftSlot ??
        (showBack ? (
          <IconButton
            onClick={() => navigate(backTo)}
            sx={{
              bgcolor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(34,154,104,0.08)',
              '&:hover': {
                bgcolor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(34,154,104,0.14)',
              },
            }}
          >
            <ArrowBackIcon />
          </IconButton>
        ) : (
          <Box sx={{ width: 40 }} />
        ))}

      <Typography
        variant="h6"
        sx={{
          fontSize: 20,
          fontWeight: 800,
          letterSpacing: '-0.03em',
          ml: 0.85,
          flex: 1,
          minWidth: 0,
        }}
      >
        {title}
      </Typography>

      {rightSlot ?? <Box sx={{ width: 40 }} />}
      </Box>
    </Box>
  );
}
