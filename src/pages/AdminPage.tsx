import { useEffect, useState, type ChangeEvent } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import { AppHeader } from '../components/AppHeader';
import { adminApi } from '../lib/api';
import { isCreatorUser } from '../lib/creator';
import { useAuthStore } from '../stores/authStore';
import { useAdminStore } from '../stores/adminStore';
import { useAppConfigStore } from '../stores/appConfigStore';
import { useChatStore } from '../stores/chatStore';
import { useSnackbarStore } from '../stores/snackbarStore';

type AdminOverview = {
  users?: number;
  chats?: number;
  messages?: number;
  creatorUserId?: string;
  gameEnabled?: boolean;
};

type AdminUser = {
  id: string;
  username: string;
  fullName: string;
  avatar?: string | null;
  bio?: string | null;
  status?: string;
  lastSeen?: string | null;
  isCreator?: boolean;
};

type AdminAction = 'clear-chats' | 'clear-messages' | 'clear-content' | 'clear-push-tokens' | 'reset-users' | null;

const ACTION_TEXT: Record<Exclude<AdminAction, null>, { title: string; body: string; button: string }> = {
  'clear-chats': {
    title: 'Очистить все чаты?',
    body: 'Будут удалены все чаты и вложения для всех пользователей.',
    button: 'Очистить чаты',
  },
  'clear-messages': {
    title: 'Удалить все сообщения?',
    body: 'Чаты останутся, но вся история сообщений будет удалена.',
    button: 'Очистить сообщения',
  },
  'clear-content': {
    title: 'Очистить весь медиа-контент?',
    body: 'Будут удалены все фото и файлы из чатов на сервере.',
    button: 'Очистить контент',
  },
  'clear-push-tokens': {
    title: 'Очистить push-токены?',
    body: 'Будут удалены все токены уведомлений. Пользователям потребуется снова открыть приложение.',
    button: 'Очистить push-токены',
  },
  'reset-users': {
    title: 'Сбросить пользователей?',
    body: 'Будут удалены все пользователи, кроме создателя приложения.',
    button: 'Сбросить пользователей',
  },
};

const UPDATE_EVENT_TITLE = 'Доступно обновление';
const UPDATE_EVENT_MESSAGE = 'Обновление на сайте';
const DEFAULT_UPDATE_DOWNLOAD_URL = 'http://q99916rz.beget.tech/update.html';

function normalizeHttpUrl(raw: string): string | null {
  const value = raw.trim();
  if (value === '') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

export default function AdminPage() {
  const navigate = useNavigate();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const me = useAuthStore((s) => s.user);
  const canUseAdminTools = useAdminStore((s) => s.canUseAdminTools);
  const setAdminAccess = useAdminStore((s) => s.setAdminAccess);
  const loadChats = useChatStore((s) => s.loadChats);
  const pushSnackbar = useSnackbarStore((s) => s.push);
  const gameEnabled = useAppConfigStore((s) => s.gameEnabled);
  const hydrateAppConfig = useAppConfigStore((s) => s.hydrateConfig);
  const updateGameEnabled = useAppConfigStore((s) => s.updateGameEnabled);

  const [overview, setOverview] = useState<AdminOverview>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [isGameToggleBusy, setIsGameToggleBusy] = useState(false);
  const [action, setAction] = useState<AdminAction>(null);
  const [targetUsername, setTargetUsername] = useState('');
  const [confirmDeleteUserOpen, setConfirmDeleteUserOpen] = useState(false);
  const [usersDialogOpen, setUsersDialogOpen] = useState(false);
  const [usersListLoading, setUsersListLoading] = useState(false);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);

  const [eventTemplate, setEventTemplate] = useState<'update' | 'custom'>('update');
  const [eventTitle, setEventTitle] = useState(UPDATE_EVENT_TITLE);
  const [eventMessage, setEventMessage] = useState(UPDATE_EVENT_MESSAGE);
  const [eventDownloadUrl, setEventDownloadUrl] = useState(DEFAULT_UPDATE_DOWNLOAD_URL);
  const [isEventBusy, setIsEventBusy] = useState(false);

  const isCreator = isCreatorUser(me) || canUseAdminTools;

  const refreshOverview = async () => {
    if (!me?.id) return;
    setIsLoading(true);
    try {
      const data = await adminApi.getOverview();
      setAdminAccess(true, me.id);
      setOverview(data || {});
      hydrateAppConfig(data || {});
    } catch (error: any) {
      if (error?.response?.status === 403) {
        setAdminAccess(false, me.id);
        return;
      }
      pushSnackbar({
        message: error?.response?.data?.error || 'Не удалось загрузить данные админ-панели',
        timeout: 2600,
        tone: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleGame = async (_event: ChangeEvent<HTMLInputElement>, checked: boolean) => {
    setIsGameToggleBusy(true);
    try {
      await updateGameEnabled(checked);
      setOverview((prev) => ({ ...prev, gameEnabled: checked }));
      pushSnackbar({
        message: checked ? 'Кнопка "Игра" снова доступна всем' : 'Кнопка "Игра" отключена для всех',
        timeout: 2400,
        tone: 'success',
      });
    } catch (error: any) {
      pushSnackbar({
        message: error?.response?.data?.error || 'Не удалось обновить доступность игры',
        timeout: 2600,
        tone: 'error',
      });
    } finally {
      setIsGameToggleBusy(false);
    }
  };

  useEffect(() => {
    if (!me?.id) return;
    void refreshOverview();
  }, [me?.id]);

  const openUsersDialog = async () => {
    setUsersDialogOpen(true);
    setUsersListLoading(true);
    try {
      const response = await adminApi.getUsers();
      const items = Array.isArray(response?.items)
        ? response.items
        : (Array.isArray(response) ? response : []);
      setAdminUsers(items as AdminUser[]);
    } catch (error: any) {
      const message =
        Number(error?.response?.status ?? 0) === 404
          ? 'Backend не обновлён: загрузите backend/app/Api.php на сервер'
          : undefined;
      pushSnackbar({
        message: message || error?.response?.data?.error || 'Не удалось загрузить список пользователей',
        timeout: 2600,
        tone: 'error',
      });
    } finally {
      setUsersListLoading(false);
    }
  };

  const runAction = async () => {
    if (!action) return;
    setIsBusy(true);
    try {
      let result: any = null;
      if (action === 'clear-chats') {
        result = await adminApi.clearAllChats();
      } else if (action === 'clear-messages') {
        result = await adminApi.clearAllMessages();
      } else if (action === 'clear-content') {
        result = await adminApi.clearAllContent();
      } else if (action === 'clear-push-tokens') {
        result = await adminApi.clearPushTokens();
      } else if (action === 'reset-users') {
        result = await adminApi.resetUsersExceptCreator();
      }

      await loadChats({ silent: true });
      await refreshOverview();

      if (action === 'clear-content') {
        const clearedBytes = Number(result?.clearedFilesBytes ?? 0);
        const clearedMb = clearedBytes > 0 ? Math.round((clearedBytes / (1024 * 1024)) * 10) / 10 : 0;
        pushSnackbar({
          message: clearedMb > 0 ? `Контент очищен (${clearedMb} MB)` : 'Контент очищен',
          timeout: 2600,
          tone: 'success',
        });
        setAction(null);
        return;
      }

      if (action === 'clear-push-tokens') {
        const deleted = Number(result?.deleted ?? 0);
        pushSnackbar({
          message: deleted > 0 ? `Push-токены очищены (${deleted})` : 'Push-токены очищены',
          timeout: 2600,
          tone: 'success',
        });
        setAction(null);
        return;
      }

      pushSnackbar({ message: 'Операция выполнена', timeout: 2200, tone: 'success' });
      setAction(null);
    } catch (error: any) {
      pushSnackbar({
        message: error?.response?.data?.error || 'Операция не выполнена',
        timeout: 2600,
        tone: 'error',
      });
    } finally {
      setIsBusy(false);
    }
  };

  const deleteByUsername = async () => {
    const username = targetUsername.replace('@', '').trim();
    if (!username) {
      pushSnackbar({ message: 'Введите username', timeout: 2200, tone: 'error' });
      return;
    }
    setIsBusy(true);
    try {
      await adminApi.deleteUserByUsername(username);
      pushSnackbar({ message: `Пользователь @${username} удалён`, timeout: 2300, tone: 'success' });
      setTargetUsername('');
      setConfirmDeleteUserOpen(false);
      await loadChats({ silent: true });
      await refreshOverview();
    } catch (error: any) {
      pushSnackbar({
        message: error?.response?.data?.error || 'Не удалось удалить пользователя',
        timeout: 2600,
        tone: 'error',
      });
    } finally {
      setIsBusy(false);
    }
  };

  const sendEvent = async () => {
    const title = eventTemplate === 'update' ? UPDATE_EVENT_TITLE : eventTitle.trim();
    const message = eventTemplate === 'update' ? UPDATE_EVENT_MESSAGE : eventMessage.trim();
    const normalizedDownloadUrl = normalizeHttpUrl(eventDownloadUrl);

    if (eventTemplate === 'custom' && title === '' && message === '') {
      pushSnackbar({
        message: 'Заполните заголовок или текст ивента',
        timeout: 2400,
        tone: 'error',
      });
      return;
    }

    if (eventTemplate === 'update' && !normalizedDownloadUrl) {
      pushSnackbar({
        message: 'Укажите корректную ссылку http:// или https:// на файл обновления',
        timeout: 2800,
        tone: 'error',
      });
      return;
    }
    if (eventTemplate === 'custom' && eventDownloadUrl.trim() !== '' && !normalizedDownloadUrl) {
      pushSnackbar({
        message: 'Ссылка должна начинаться с http:// или https://',
        timeout: 2600,
        tone: 'error',
      });
      return;
    }

    setIsEventBusy(true);
    try {
      await adminApi.createEvent({
        template: eventTemplate,
        title,
        message,
        downloadUrl: normalizedDownloadUrl ?? undefined,
      });
      pushSnackbar({ message: 'Ивент отправлен', timeout: 2200, tone: 'success' });
      if (eventTemplate === 'custom') {
        setEventTitle('');
        setEventMessage('');
        setEventDownloadUrl('');
      } else {
        setEventDownloadUrl(DEFAULT_UPDATE_DOWNLOAD_URL);
      }
    } catch (error: any) {
      pushSnackbar({
        message: error?.response?.data?.error || 'Не удалось отправить ивент',
        timeout: 2600,
        tone: 'error',
      });
    } finally {
      setIsEventBusy(false);
    }
  };

  return (
    <Box
      sx={{
        px: 1.5,
        pb: 'max(env(safe-area-inset-bottom), 96px)',
        height: '100%',
        overflowY: 'auto',
        bgcolor: isDark ? '#0D1A2E' : '#FFFFFF',
      }}
    >
      <AppHeader title="Инструменты" />

      {!isCreator ? (
        <Alert severity="error" sx={{ mt: 1.2 }}>
          Доступ запрещен. Этот раздел доступен только владельцу приложения.
        </Alert>
      ) : (
        <>
          {isLoading ? (
            <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              <Paper
                elevation={0}
                sx={{
                  p: 2,
                  borderRadius: 3,
                  border: '1px solid',
                  borderColor: isDark ? 'rgba(175,193,217,0.2)' : '#E5ECE9',
                  bgcolor: isDark ? 'rgba(17,33,50,0.8)' : '#F7FBF8',
                }}
              >
                <Typography sx={{ fontWeight: 800, mb: 1 }}>Состояние сервера</Typography>
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
                  <Paper
                    component="button"
                    onClick={() => { void openUsersDialog(); }}
                    sx={{
                      px: 1.4,
                      py: 1,
                      borderRadius: 2,
                      border: '1px solid',
                      borderColor: isDark ? 'rgba(175,193,217,0.28)' : '#D7E4DE',
                      bgcolor: isDark ? 'rgba(17,33,50,0.9)' : '#FFFFFF',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <Typography variant="caption" color="text.secondary">Пользователи</Typography>
                    <Typography sx={{ fontWeight: 800 }}>{overview.users ?? 0}</Typography>
                  </Paper>
                  <Paper sx={{ px: 1.4, py: 1, borderRadius: 2 }}>
                    <Typography variant="caption" color="text.secondary">Чаты</Typography>
                    <Typography sx={{ fontWeight: 800 }}>{overview.chats ?? 0}</Typography>
                  </Paper>
                  <Paper sx={{ px: 1.4, py: 1, borderRadius: 2 }}>
                    <Typography variant="caption" color="text.secondary">Сообщения</Typography>
                    <Typography sx={{ fontWeight: 800 }}>{overview.messages ?? 0}</Typography>
                  </Paper>
                </Stack>
              </Paper>

              <Paper
                elevation={0}
                sx={{
                  mt: 1.4,
                  p: 1.5,
                  borderRadius: 3,
                  border: '1px solid',
                  borderColor: isDark ? 'rgba(129,187,243,0.24)' : 'rgba(34,154,104,0.18)',
                  bgcolor: isDark ? 'rgba(15,34,53,0.8)' : 'rgba(248,252,249,0.96)',
                }}
              >
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1.4}
                  alignItems={{ xs: 'flex-start', sm: 'center' }}
                  justifyContent="space-between"
                >
                  <Box>
                    <Typography sx={{ fontWeight: 800, mb: 0.35 }}>Игра для пользователей</Typography>
                    <Typography color="text.secondary" sx={{ maxWidth: 560 }}>
                      Управляет кнопкой и переходом в раздел игры по всему приложению.
                    </Typography>
                  </Box>
                  <FormControlLabel
                    sx={{ m: 0 }}
                    control={
                      <Switch
                        checked={gameEnabled}
                        onChange={handleToggleGame}
                        disabled={isGameToggleBusy}
                      />
                    }
                    label={gameEnabled ? 'Включена' : 'Отключена'}
                    labelPlacement="start"
                  />
                </Stack>
              </Paper>

              <Paper
                elevation={0}
                sx={{
                  mt: 1.4,
                  p: 1.5,
                  borderRadius: 3,
                  border: '1px solid',
                  borderColor: isDark ? 'rgba(129,187,243,0.3)' : 'rgba(31,163,91,0.22)',
                  bgcolor: isDark ? 'rgba(17,40,62,0.72)' : 'rgba(242,251,246,0.96)',
                }}
              >
                <Typography sx={{ fontWeight: 800, mb: 1 }}>Ивент</Typography>
                <Stack spacing={1.1}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={0.8}>
                    <Button
                      size="small"
                      variant={eventTemplate === 'update' ? 'contained' : 'outlined'}
                      onClick={() => {
                        setEventTemplate('update');
                        setEventTitle(UPDATE_EVENT_TITLE);
                        setEventMessage(UPDATE_EVENT_MESSAGE);
                        setEventDownloadUrl(DEFAULT_UPDATE_DOWNLOAD_URL);
                      }}
                      sx={{ flex: 1 }}
                    >
                      Доступно обновление
                    </Button>
                    <Button
                      size="small"
                      variant={eventTemplate === 'custom' ? 'contained' : 'outlined'}
                      onClick={() => {
                        setEventTemplate('custom');
                        if (eventTitle === UPDATE_EVENT_TITLE && eventMessage === UPDATE_EVENT_MESSAGE) {
                          setEventTitle('');
                          setEventMessage('');
                        }
                      }}
                      sx={{ flex: 1 }}
                    >
                      Кастом
                    </Button>
                  </Stack>

                  {eventTemplate === 'custom' && (
                    <>
                      <TextField
                        size="small"
                        label="Заголовок"
                        value={eventTitle}
                        onChange={(e) => setEventTitle(e.target.value)}
                      />
                      <TextField
                        size="small"
                        multiline
                        minRows={2}
                        label="Текст уведомления"
                        value={eventMessage}
                        onChange={(e) => setEventMessage(e.target.value)}
                      />
                    </>
                  )}

                  <TextField
                    size="small"
                    label="Ссылка на артефакт (APK)"
                    placeholder="http://example.com/Vibe.apk"
                    value={eventDownloadUrl}
                    onChange={(e) => setEventDownloadUrl(e.target.value)}
                    required={eventTemplate === 'update'}
                    helperText={
                      eventTemplate === 'update'
                        ? 'Для этого ивента укажите только ссылку на обновление.'
                        : 'Необязательно: можно указать ссылку и для кастомного ивента.'
                    }
                  />

                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={0.8}>
                    <Button
                      sx={{ flex: 1 }}
                      variant="contained"
                      onClick={sendEvent}
                      disabled={isEventBusy || (eventTemplate === 'update' && eventDownloadUrl.trim() === '')}
                    >
                      {isEventBusy ? 'Отправка...' : 'Отправить ивент'}
                    </Button>
                  </Stack>
                </Stack>
              </Paper>

              <Paper
                elevation={0}
                sx={{
                  mt: 1.4,
                  p: 1.4,
                  borderRadius: 3,
                  border: '1px solid',
                  borderColor: isDark ? 'rgba(228,75,75,0.35)' : 'rgba(228,75,75,0.25)',
                  bgcolor: isDark ? 'rgba(37,17,26,0.55)' : 'rgba(255,242,242,0.92)',
                }}
              >
                <Typography sx={{ fontWeight: 800, mb: 1 }}>Опасные действия</Typography>
                <Stack spacing={1}>
                  <Button color="error" variant="outlined" onClick={() => setAction('clear-messages')}>
                    Очистить все сообщения
                  </Button>
                  <Button color="error" variant="outlined" onClick={() => setAction('clear-content')}>
                    Очистить весь контент
                  </Button>
                  <Button color="error" variant="outlined" onClick={() => setAction('clear-push-tokens')}>
                    Очистить push-токены
                  </Button>
                  <Button color="error" variant="outlined" onClick={() => setAction('clear-chats')}>
                    Очистить все чаты
                  </Button>
                  <Button color="error" variant="contained" onClick={() => setAction('reset-users')}>
                    Сбросить пользователей (кроме владельца)
                  </Button>
                </Stack>
              </Paper>

              <Paper
                elevation={0}
                sx={{
                  mt: 1.4,
                  p: 1.4,
                  borderRadius: 3,
                  border: '1px solid',
                  borderColor: isDark ? 'rgba(175,193,217,0.28)' : '#DDE7E2',
                  bgcolor: isDark ? 'rgba(14,29,47,0.74)' : '#F7FBF8',
                }}
              >
                <Typography sx={{ fontWeight: 800, mb: 1 }}>Удаление пользователя</Typography>
                <Stack spacing={1}>
                  <TextField
                    size="small"
                    label="Username"
                    placeholder="@username"
                    value={targetUsername}
                    onChange={(e) => setTargetUsername(e.target.value)}
                  />
                  <Button
                    color="error"
                    variant="contained"
                    onClick={() => {
                      if (!targetUsername.replace('@', '').trim()) {
                        pushSnackbar({ message: 'Введите username', timeout: 2200, tone: 'error' });
                        return;
                      }
                      setConfirmDeleteUserOpen(true);
                    }}
                    disabled={isBusy}
                  >
                    Удалить пользователя
                  </Button>
                </Stack>
              </Paper>
            </>
          )}
        </>
      )}

      <Dialog open={!!action} onClose={() => (!isBusy ? setAction(null) : null)} fullWidth maxWidth="xs">
        <DialogTitle>{action ? ACTION_TEXT[action].title : ''}</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary">
            {action ? ACTION_TEXT[action].body : ''}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button disabled={isBusy} onClick={() => setAction(null)}>Отмена</Button>
          <Button disabled={isBusy} color="error" variant="contained" onClick={runAction}>
            {isBusy ? 'Выполняется...' : action ? ACTION_TEXT[action].button : 'Подтвердить'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmDeleteUserOpen} onClose={() => (!isBusy ? setConfirmDeleteUserOpen(false) : null)} fullWidth maxWidth="xs">
        <DialogTitle>Удалить пользователя?</DialogTitle>
        <DialogContent>
          <Typography color="text.secondary">
            Пользователь @{targetUsername.replace('@', '').trim()} будет удалён из системы. Это действие необратимо.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button disabled={isBusy} onClick={() => setConfirmDeleteUserOpen(false)}>Отмена</Button>
          <Button disabled={isBusy} color="error" variant="contained" onClick={deleteByUsername}>
            {isBusy ? 'Удаление...' : 'Удалить'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={usersDialogOpen} onClose={() => setUsersDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Пользователи</DialogTitle>
        <DialogContent sx={{ px: 0 }}>
          {usersListLoading ? (
            <Box sx={{ display: 'grid', placeItems: 'center', py: 4 }}>
              <CircularProgress size={24} />
            </Box>
          ) : !adminUsers.length ? (
            <Typography color="text.secondary" sx={{ textAlign: 'center', py: 3 }}>
              Пользователи не найдены
            </Typography>
          ) : (
            <List disablePadding>
              {adminUsers.map((item) => (
                <ListItemButton
                  key={item.id}
                  onClick={() => {
                    setUsersDialogOpen(false);
                    navigate(`/user/${item.id}`);
                  }}
                >
                  <Avatar
                    src={item.avatar || undefined}
                    sx={{ width: 36, height: 36, mr: 1.2, bgcolor: 'primary.main', flexShrink: 0 }}
                  >
                    {(item.fullName || item.username || 'U').slice(0, 1).toUpperCase()}
                  </Avatar>
                  <ListItemText
                    primary={item.fullName || `@${item.username}`}
                    secondary={
                      item.username
                        ? `@${item.username}${item.isCreator ? ' • создатель' : ''}`
                        : (item.isCreator ? 'создатель' : '')
                    }
                  />
                </ListItemButton>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUsersDialogOpen(false)}>Закрыть</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
