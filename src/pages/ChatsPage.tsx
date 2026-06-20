import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  Avatar,
  Box,
  ButtonBase,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  Fab,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import EditIcon from '@mui/icons-material/Edit';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import AddCircleRoundedIcon from '@mui/icons-material/AddCircleRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ArrowBackIosNewRoundedIcon from '@mui/icons-material/ArrowBackIosNewRounded';
import ArrowForwardIosRoundedIcon from '@mui/icons-material/ArrowForwardIosRounded';
import PersonIcon from '@mui/icons-material/Person';
import Groups2RoundedIcon from '@mui/icons-material/Groups2Rounded';
import BookmarkRoundedIcon from '@mui/icons-material/BookmarkRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import PsychologyRoundedIcon from '@mui/icons-material/PsychologyRounded';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import SportsEsportsRoundedIcon from '@mui/icons-material/SportsEsportsRounded';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import DoneRoundedIcon from '@mui/icons-material/DoneRounded';
import PushPinRoundedIcon from '@mui/icons-material/PushPinRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { useNavigate } from 'react-router-dom';
import { useRef } from 'react';
import { useChatStore } from '../stores/chatStore';
import { useContactsStore } from '../stores/contactsStore';
import { useAuthStore } from '../stores/authStore';
import { AppHeader } from '../components/AppHeader';
import { useSnackbarStore } from '../stores/snackbarStore';
import { useTheme } from '@mui/material/styles';
import { useSettingsStore } from '../stores/settingsStore';
import { useAdminStore } from '../stores/adminStore';
import { useAppConfigStore } from '../stores/appConfigStore';
import { storyApi, uploadApi, userApi } from '../lib/api';
import type { Chat, Story, StoryViewer } from '../lib/types';
import { isCreatorUser } from '../lib/creator';

const STORY_MEDIA_LIMIT = 10;
const STORY_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'bmp', 'avif'];

type StoryGroup = {
  userId: string;
  user: Story['user'];
  items: Story[];
  latestCreatedAt: number;
  viewed: boolean;
};

type StorySlide = {
  story: Story;
  mediaUrl: string | null;
};

const formatChatDate = (value?: string) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
};

function getChatName(chat: Chat, myId?: string, localDisplayName?: string) {
  if (chat.type === 'saved') return 'Избранное';
  if (chat.type === 'group') return chat.name?.trim() || 'Группа';
  if (chat.name?.trim()) return chat.name.trim();
  if (localDisplayName?.trim()) return localDisplayName.trim();
  const peer = chat.participants?.find((p) => p.id !== myId) || chat.participants?.[0];
  return peer?.fullName || (peer?.username ? `@${peer.username}` : 'Чат');
}

function getChatAvatar(chat: Chat, myId?: string, localDisplayName?: string) {
  if (chat.type === 'saved') return { initial: 'И', src: undefined as string | undefined };
  if (chat.type === 'group') {
    const title = getChatName(chat, myId, localDisplayName);
    return { initial: title.slice(0, 1).toUpperCase(), src: chat.avatar };
  }
  const peer = chat.participants?.find((p) => p.id !== myId) || chat.participants?.[0];
  const title = getChatName(chat, myId, localDisplayName);
  return { initial: title.slice(0, 1).toUpperCase(), src: chat.avatar || peer?.avatar };
}

const asStoryMediaUrls = (story: Story): string[] => {
  const list = Array.isArray(story.mediaUrls) ? story.mediaUrls : [];
  const normalized = list
    .map((value) => String(value || '').trim())
    .filter((value, index, arr) => value !== '' && arr.indexOf(value) === index);
  if (normalized.length > 0) {
    return normalized;
  }
  const fallback = String(story.mediaUrl || '').trim();
  return fallback ? [fallback] : [];
};

const formatStoryTime = (iso?: string): string => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
};

const isLikelyImageFile = (file: File): boolean => {
  if (String(file.type || '').toLowerCase().startsWith('image/')) return true;
  const name = String(file.name || '').toLowerCase();
  const ext = name.includes('.') ? name.split('.').pop() || '' : '';
  return STORY_IMAGE_EXTENSIONS.includes(ext);
};

export default function ChatsPage() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const setTheme = useSettingsStore((s) => s.setTheme);
  const chatCompactMode = useSettingsStore((s) => s.chatCompactMode);
  const savedChatHidden = useSettingsStore((s) => s.savedChatHidden);
  const setSavedChatHidden = useSettingsStore((s) => s.setSavedChatHidden);
  const gameEnabled = useAppConfigStore((s) => s.gameEnabled);
  const navigate = useNavigate();
  const {
    chats,
    messages,
    isLoading,
    loadChats,
    archiveChat,
    unarchiveChat,
    pinChat,
    deleteChat,
  } = useChatStore();
  const getContactByUserId = useContactsStore((s) => s.getContactByUserId);
  const user = useAuthStore((s) => s.user);
  const canUseAdminTools = useAdminStore((s) => s.canUseAdminTools);
  const isCreator = isCreatorUser(user) || canUseAdminTools;
  const updateUser = useAuthStore((s) => s.updateUser);
  const logout = useAuthStore((s) => s.logout);
  const pushSnackbar = useSnackbarStore((s) => s.push);
  const [q, setQ] = useState('');
  const deferredQuery = useDeferredValue(q);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [chatActionsAnchor, setChatActionsAnchor] = useState<null | HTMLElement>(null);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [waveTitleActive, setWaveTitleActive] = useState(false);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [storyComposerOpen, setStoryComposerOpen] = useState(false);
  const [storyText, setStoryText] = useState('');
  const [storyFiles, setStoryFiles] = useState<File[]>([]);
  const [storyViewerOpen, setStoryViewerOpen] = useState(false);
  const [storyViewerGroup, setStoryViewerGroup] = useState<StoryGroup | null>(null);
  const [storyViewerSlides, setStoryViewerSlides] = useState<StorySlide[]>([]);
  const [storyViewerIndex, setStoryViewerIndex] = useState(0);
  const [storySubmitting, setStorySubmitting] = useState(false);
  const [storyDeleting, setStoryDeleting] = useState(false);
  const [storyViewers, setStoryViewers] = useState<StoryViewer[]>([]);
  const [storyViewersLoading, setStoryViewersLoading] = useState(false);
  const [storyViewersSheetOpen, setStoryViewersSheetOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const holdTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef<string | null>(null);
  const storyInputRef = useRef<HTMLInputElement | null>(null);
  const menuItemSx = {
    borderRadius: 2.5,
    px: 1.2,
    py: 1,
    mb: 0.5,
    '& .MuiListItemIcon-root': {
      minWidth: 36,
      color: isDark ? '#AFC1D9' : '#45635A',
    },
    '&:hover': {
      bgcolor: isDark ? 'rgba(143,177,213,0.14)' : 'rgba(31,163,91,0.10)',
    },
  };

  useEffect(() => {
    if (!user?.id) return;
    loadChats();
  }, [loadChats, user?.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    const timerId = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      loadChats({ silent: true }).catch(() => null);
    }, 5000);

    return () => window.clearInterval(timerId);
  }, [loadChats, user?.id]);

  useEffect(() => {
    let active = true;
    if (!user?.id) return;
    if (user.username && user.fullName && typeof user.isCreator === 'boolean') return;

    userApi
      .getMe()
      .then((profile) => {
        if (!active) return;
        const username = profile?.username ?? profile?.user_name ?? user.username;
        const fullName = profile?.fullName ?? profile?.full_name ?? profile?.name ?? user.fullName;
        const lastSeen = profile?.lastSeen ?? profile?.last_seen ?? user.lastSeen;

        updateUser({
          username,
          fullName,
          avatar: profile?.avatar ?? user.avatar,
          bio: profile?.bio ?? user.bio,
          status: profile?.status ?? user.status,
          lastSeen,
          isCreator: Boolean(profile?.isCreator ?? profile?.is_creator ?? user.isCreator),
        });
      })
      .catch(() => null);

    return () => {
      active = false;
    };
  }, [user?.id, user?.username, user?.fullName, user?.avatar, user?.bio, user?.status, user?.lastSeen, user?.isCreator, updateUser]);

  useEffect(() => {
    const onIntroFinished = () => {
      setWaveTitleActive(true);
      window.setTimeout(() => setWaveTitleActive(false), 1100);
    };

    window.addEventListener('vibe:intro-finished', onIntroFinished as EventListener);
    return () => window.removeEventListener('vibe:intro-finished', onIntroFinished as EventListener);
  }, []);

  const storyPreviewUrls = useMemo(
    () => storyFiles.map((file) => URL.createObjectURL(file)),
    [storyFiles],
  );

  useEffect(() => {
    return () => {
      storyPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [storyPreviewUrls]);

  const loadStories = async () => {
    if (!user?.id) {
      setStories([]);
      return;
    }

    try {
      const feed = await storyApi.getFeed();
      const items = Array.isArray(feed) ? (feed as Story[]) : [];
      setStories(items);
    } catch {
      // keep the last successful state
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    loadStories().catch(() => null);

    const timerId = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      loadStories().catch(() => null);
    }, 20000);
    return () => window.clearInterval(timerId);
  }, [user?.id]);

  const groupedStories = useMemo(() => {
    const groups = new Map<string, StoryGroup>();
    const now = Date.now();

    stories.forEach((story) => {
      const userId = String(story.userId || '').trim();
      if (!userId) return;
      const expiresAt = new Date(story.expiresAt).getTime();
      if (Number.isFinite(expiresAt) && expiresAt <= now) return;

      const existing = groups.get(userId);
      if (!existing) {
        groups.set(userId, {
          userId,
          user: story.user,
          items: [story],
          latestCreatedAt: new Date(story.createdAt).getTime() || now,
          viewed: Boolean(story.isViewed),
        });
        return;
      }

      existing.items.push(story);
      existing.latestCreatedAt = Math.max(existing.latestCreatedAt, new Date(story.createdAt).getTime() || now);
      if (!story.isViewed) {
        existing.viewed = false;
      }
    });

    const list = Array.from(groups.values()).map((group) => ({
      ...group,
      items: group.items.slice().sort((a, b) => {
        const aTime = new Date(a.createdAt).getTime() || 0;
        const bTime = new Date(b.createdAt).getTime() || 0;
        return aTime - bTime;
      }),
    }));

    list.sort((a, b) => b.latestCreatedAt - a.latestCreatedAt);
    return list;
  }, [stories]);

  const myStoryGroup = useMemo(
    () => groupedStories.find((group) => String(group.userId) === String(user?.id)),
    [groupedStories, user?.id],
  );

  const storyGroupsForStrip = useMemo(() => {
    if (!myStoryGroup) return groupedStories;
    return [myStoryGroup, ...groupedStories.filter((group) => group.userId !== myStoryGroup.userId)];
  }, [groupedStories, myStoryGroup]);

  const pickStoryFiles = (list: FileList | null) => {
    if (!list?.length) return;
    const incoming = Array.from(list).filter((file) => isLikelyImageFile(file));
    if (!incoming.length) {
      pushSnackbar({ message: 'Можно выбрать только фото', timeout: 2200, tone: 'error' });
      return;
    }

    setStoryFiles((prev) => {
      const next = [...prev];
      for (const file of incoming) {
        if (next.length >= STORY_MEDIA_LIMIT) break;
        next.push(file);
      }
      if (prev.length + incoming.length > STORY_MEDIA_LIMIT) {
        pushSnackbar({ message: 'Максимум 10 фото в статусе', timeout: 2200 });
      }
      return next;
    });
  };

  const openStoryComposer = () => {
    setStoryComposerOpen(true);
  };

  const closeStoryComposer = () => {
    setStoryComposerOpen(false);
    setStoryText('');
    setStoryFiles([]);
    if (storyInputRef.current) {
      storyInputRef.current.value = '';
    }
  };

  const submitStory = async () => {
    const trimmedText = storyText.trim();
    if (!trimmedText && storyFiles.length === 0) {
      pushSnackbar({ message: 'Добавьте текст или фото для статуса', timeout: 2200 });
      return;
    }
    if (storyFiles.length > STORY_MEDIA_LIMIT) {
      pushSnackbar({ message: 'Максимум 10 фото в статусе', timeout: 2200 });
      return;
    }

    setStorySubmitting(true);
    try {
      let mediaUrls: string[] = [];
      if (storyFiles.length > 0) {
        const uploaded = await uploadApi.uploadStoryFiles(storyFiles);
        mediaUrls = (Array.isArray(uploaded) ? uploaded : [])
          .map((item) => String(item?.url || '').trim())
          .filter((url) => url !== '');
        if (mediaUrls.length !== storyFiles.length) {
          throw new Error('PARTIAL_STORY_UPLOAD');
        }
      }

      await storyApi.create({
        text: trimmedText || undefined,
        mediaUrls,
      });

      closeStoryComposer();
      await loadStories();
      pushSnackbar({ message: 'Статус опубликован на 24 часа', timeout: 2200, tone: 'success' });
    } catch (error: any) {
      const rawApiError = String(error?.response?.data?.error || '').trim();
      const normalized = rawApiError.toLowerCase();
      const isPartial =
        String(error?.message || '').trim() === 'PARTIAL_STORY_UPLOAD'
        || normalized.includes('no valid image files uploaded')
        || normalized.includes('maximum 10 photos')
        || normalized.includes('photo')
        || normalized.includes('image');
      pushSnackbar({
        message: isPartial ? 'Не все фото загрузились. Проверьте формат/размер и повторите.' : 'Не удалось опубликовать статус',
        timeout: 2800,
        tone: 'error',
      });
    } finally {
      setStorySubmitting(false);
    }
  };

  const openStoryViewer = (group: StoryGroup) => {
    if (!group.items.length) return;

    const slides: StorySlide[] = [];
    for (const item of group.items) {
      const mediaUrls = asStoryMediaUrls(item);
      if (mediaUrls.length === 0) {
        slides.push({ story: item, mediaUrl: null });
        continue;
      }
      for (const mediaUrl of mediaUrls) {
        slides.push({ story: item, mediaUrl });
      }
    }

    if (!slides.length) return;

    const firstNotViewedIndex = slides.findIndex((item) => !item.story.isViewed);
    setStoryViewerGroup(group);
    setStoryViewerSlides(slides);
    setStoryViewerIndex(firstNotViewedIndex >= 0 ? firstNotViewedIndex : 0);
    setStoryViewerOpen(true);
  };

  const closeStoryViewer = () => {
    setStoryViewerOpen(false);
    setStoryViewerGroup(null);
    setStoryViewerSlides([]);
    setStoryViewerIndex(0);
    setStoryDeleting(false);
    setStoryViewers([]);
    setStoryViewersSheetOpen(false);
    setStoryViewersLoading(false);
  };

  const activeStorySlide = useMemo(() => {
    if (!storyViewerSlides.length) return null;
    const index = Math.max(0, Math.min(storyViewerIndex, storyViewerSlides.length - 1));
    return storyViewerSlides[index] || null;
  }, [storyViewerIndex, storyViewerSlides]);

  const activeStory = activeStorySlide?.story || null;
  const isOwnActiveStory = Boolean(activeStory && user?.id && String(activeStory.userId) === String(user.id));
  const activeStoryViewsCount = useMemo(() => {
    if (!isOwnActiveStory) return 0;
    return Math.max(storyViewers.length, Number(activeStory?.viewsCount || 0));
  }, [activeStory?.viewsCount, isOwnActiveStory, storyViewers.length]);

  const openStoryViewersSheet = () => {
    if (!isOwnActiveStory) return;
    setStoryViewersSheetOpen(true);
  };

  useEffect(() => {
    if (!storyViewerOpen || !activeStory || !user?.id) return;
    if (String(activeStory.userId) === String(user.id) || activeStory.isViewed) return;

    storyApi
      .markViewed(activeStory.id)
      .then(() => loadStories())
      .catch(() => null);
  }, [storyViewerOpen, activeStory?.id, activeStory?.isViewed, activeStory?.userId, user?.id]);

  useEffect(() => {
    if (!storyViewerOpen || !activeStory || !isOwnActiveStory) {
      setStoryViewers([]);
      setStoryViewersLoading(false);
      return;
    }

    const targetStoryId = String(activeStory.id || '').trim();
    if (!targetStoryId) {
      setStoryViewers([]);
      setStoryViewersLoading(false);
      return;
    }

    let active = true;
    setStoryViewersLoading(true);
    storyApi
      .getViewers(targetStoryId)
      .then((response: any) => {
        if (!active) return;
        const items = Array.isArray(response?.items) ? response.items : [];
        const normalized = items
          .map((item: any): StoryViewer | null => {
            const userId = String(item?.userId || item?.user?.id || '').trim();
            if (!userId) return null;
            return {
              userId,
              viewedAt: String(item?.viewedAt || item?.viewed_at || '').trim(),
              user: {
                id: userId,
                username: String(item?.user?.username || item?.user_name || '').trim(),
                fullName: String(item?.user?.fullName || item?.user?.full_name || '').trim(),
                avatar: item?.user?.avatar || undefined,
              },
            };
          })
          .filter((item: StoryViewer | null): item is StoryViewer => Boolean(item))
          .sort((a: StoryViewer, b: StoryViewer) => {
          const aTs = Date.parse(a.viewedAt || '');
          const bTs = Date.parse(b.viewedAt || '');
          if (!Number.isFinite(aTs) && !Number.isFinite(bTs)) return 0;
          if (!Number.isFinite(aTs)) return 1;
          if (!Number.isFinite(bTs)) return -1;
          return bTs - aTs;
        });

        setStoryViewers(normalized);
      })
      .catch(() => {
        if (!active) return;
        setStoryViewers([]);
      })
      .finally(() => {
        if (!active) return;
        setStoryViewersLoading(false);
      });

    return () => {
      active = false;
    };
  }, [storyViewerOpen, activeStory?.id, isOwnActiveStory]);

  useEffect(() => {
    if (isOwnActiveStory) return;
    setStoryViewersSheetOpen(false);
  }, [isOwnActiveStory]);

  const stepStory = (direction: -1 | 1) => {
    const max = storyViewerSlides.length - 1;
    if (max < 0) return;
    setStoryViewerIndex((prev) => {
      const next = prev + direction;
      if (next < 0) return 0;
      if (next > max) return max;
      return next;
    });
  };

  const deleteActiveStory = async () => {
    if (!activeStory || !isOwnActiveStory || storyDeleting) return;
    const confirmed = window.confirm('Удалить этот статус?');
    if (!confirmed) return;

    setStoryDeleting(true);
    try {
      await storyApi.delete(activeStory.id);
      await loadStories();
      closeStoryViewer();
      pushSnackbar({ message: 'Статус удалён', timeout: 1800, tone: 'success' });
    } catch {
      pushSnackbar({ message: 'Не удалось удалить статус', timeout: 2400, tone: 'error' });
    } finally {
      setStoryDeleting(false);
    }
  };

  const visible = useMemo(() => {
    const needle = deferredQuery.toLowerCase().trim();
    const base = chats.filter((c) => !c.archived && c.type !== 'ai' && !(savedChatHidden && c.type === 'saved'));
    if (!needle) return base;

    return base.filter((chat) => {
      const peer = chat.participants?.find((p) => p.id !== user?.id) || chat.participants?.[0];
      const contactName = peer ? getContactByUserId(peer.id)?.displayName : '';
      const name = chat.name || contactName || peer?.fullName || peer?.username || '';
      return name.toLowerCase().includes(needle);
    });
  }, [chats, deferredQuery, getContactByUserId, user?.id, savedChatHidden]);

  const selectedChat = useMemo(
    () => (selectedChatId ? chats.find((item) => item.id === selectedChatId) || null : null),
    [chats, selectedChatId],
  );

  useEffect(() => {
    if (!selectedChatId) return;
    if (!visible.some((chat) => chat.id === selectedChatId)) {
      setSelectedChatId(null);
      setChatActionsAnchor(null);
    }
  }, [visible, selectedChatId]);

  const clearHoldTimer = () => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  useEffect(() => () => clearHoldTimer(), []);

  const startChatLongPress = (chatId: string) => {
    clearHoldTimer();
    longPressTriggeredRef.current = null;
    holdTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = chatId;
      setSelectedChatId(chatId);
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(16);
      }
    }, 650);
  };

  const handleChatClick = (chatId: string) => {
    if (longPressTriggeredRef.current === chatId) {
      longPressTriggeredRef.current = null;
      return;
    }
    if (selectedChatId) {
      setSelectedChatId(selectedChatId === chatId ? null : chatId);
      return;
    }
    navigate(`/chat/${chatId}`);
  };

  const runSelectedChatAction = async (actionType: 'pin' | 'archive' | 'delete') => {
    const target = selectedChat;
    if (!target) return;
    try {
      if (actionType === 'pin') {
        await pinChat(target.id);
      } else if (actionType === 'archive') {
        if (target.archived) {
          await unarchiveChat(target.id);
        } else {
          await archiveChat(target.id);
        }
      } else {
        await deleteChat(target.id);
      }
      setSelectedChatId(null);
      setChatActionsAnchor(null);
    } catch {
      pushSnackbar({ message: 'Не удалось выполнить действие с чатом', timeout: 2200, tone: 'error' });
    }
  };

  const openSavedFromDrawer = async () => {
    setDrawerOpen(false);
    try {
      let saved = chats.find((c) => c.type === 'saved');

      if (!saved) {
        await loadChats();
        saved = useChatStore.getState().chats.find((c) => c.type === 'saved');
      }

      if (saved) {
        navigate(`/chat/${saved.id}`);
        return;
      }
    } catch {
      // fallback below
    }

    navigate('/favorites');
  };

  if (isLoading) {
    return <Box sx={{ p: 4, display: 'grid', placeItems: 'center', height: '100%' }}><CircularProgress /></Box>;
  }

  return (
    <Box
      sx={{
        px: 1.25,
        pb: 'max(env(safe-area-inset-bottom), 92px)',
        height: '100%',
        overflow: 'auto',
        bgcolor: 'transparent',
      }}
    >
      <AppHeader
        title={
          !isOnline ? (
            <Box
              id="vibe-home-anchor"
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                fontWeight: 800,
                fontSize: 18,
                color: isDark ? '#FFB7B7' : '#B04A4A',
              }}
            >
              соеденение...
            </Box>
          ) : (
            <Box
              id="vibe-home-anchor"
              sx={{ display: 'inline-flex', alignItems: 'center', gap: 0 }}
            >
              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0 }}>
                {['V', 'i', 'b', 'e'].map((letter, idx) => (
                  <Box
                    key={`${letter}-${idx}`}
                    component="span"
                    sx={{
                      display: 'inline-block',
                      fontWeight: 800,
                      ...(waveTitleActive
                        ? {
                            animation: 'vibeWaveIn 620ms ease forwards',
                            animationDelay: `${idx * 85}ms`,
                            opacity: 0.35,
                            transform: 'translateY(6px) scale(0.94)',
                          }
                        : {}),
                      '@keyframes vibeWaveIn': {
                        '0%': { opacity: 0.35, transform: 'translateY(6px) scale(0.94)' },
                        '55%': { opacity: 1, transform: 'translateY(-2px) scale(1.04)' },
                        '100%': { opacity: 1, transform: 'translateY(0) scale(1)' },
                      },
                    }}
                  >
                    {letter}
                  </Box>
                ))}
              </Box>
            </Box>
          )
        }
        showBack={false}
        leftSlot={
          <IconButton onClick={() => setDrawerOpen(true)} sx={{ bgcolor: isDark ? 'rgba(39,57,78,0.75)' : 'rgba(31,163,91,0.12)' }}>
            <Box sx={{ width: 22, display: 'grid', gap: 0.6 }}>
              <Box sx={{ height: 2.5, borderRadius: 2, bgcolor: '#2DBB63' }} />
              <Box sx={{ height: 2.5, borderRadius: 2, bgcolor: '#FFFFFF', border: '1px solid #D2D7DF' }} />
              <Box sx={{ height: 2.5, borderRadius: 2, bgcolor: '#E8443A' }} />
            </Box>
          </IconButton>
        }
        rightSlot={
          selectedChat ? (
            <IconButton
              onClick={(e) => setChatActionsAnchor(e.currentTarget)}
              sx={{ bgcolor: isDark ? 'rgba(143,177,213,0.2)' : 'rgba(31,163,91,0.12)' }}
            >
              <MoreVertIcon />
            </IconButton>
          ) : null
        }
      />

      <Paper
        sx={{
          p: 1,
          pb: 0.85,
          borderRadius: 3,
          bgcolor: isDark ? 'rgba(16, 28, 43, 0.74)' : 'rgba(255,255,255,0.82)',
        }}
      >
        <TextField
          fullWidth
          size="small"
          placeholder="Поиск по чатам"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          InputProps={{ startAdornment: <SearchRoundedIcon sx={{ mr: 1, color: 'text.secondary' }} /> }}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 3 } }}
        />
        <Box
          sx={{
            mt: 1,
            pt: 0.9,
            borderTop: '1px solid',
            borderColor: isDark ? 'rgba(216,231,255,0.08)' : 'rgba(21,53,40,0.08)',
          }}
        >
          <Box sx={{ px: 0.45, pb: 0.55, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography sx={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.02em' }}>
            Статусы
          </Typography>
          <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
            24 часа
          </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1.1, overflowX: 'auto', pb: 0.2 }}>
          <ButtonBase
            onClick={() => {
              if (myStoryGroup?.items?.length) {
                openStoryViewer(myStoryGroup);
                return;
              }
              openStoryComposer();
            }}
            sx={{
              minWidth: 72,
              flexDirection: 'column',
              alignItems: 'center',
              gap: 0.45,
              borderRadius: 2.2,
              p: 0.6,
            }}
          >
            <Box sx={{ position: 'relative' }}>
              <Avatar
                src={user?.avatar}
                sx={{
                  width: 58,
                  height: 58,
                  border: '2px solid',
                  borderColor: isDark ? 'rgba(114,169,231,0.65)' : 'rgba(31,163,91,0.7)',
                }}
              >
                {(user?.fullName || user?.username || 'A').slice(0, 1).toUpperCase()}
              </Avatar>
              <AddCircleRoundedIcon
                onClick={(event) => {
                  event.stopPropagation();
                  openStoryComposer();
                }}
                sx={{
                  position: 'absolute',
                  right: -2,
                  bottom: -2,
                  fontSize: 22,
                  color: isDark ? '#6EB7FF' : '#1FA35B',
                  bgcolor: isDark ? '#0A1A32' : '#fff',
                  borderRadius: '50%',
                }}
              />
            </Box>
            <Typography variant="caption" noWrap sx={{ maxWidth: 72 }}>
              Мой статус
            </Typography>
          </ButtonBase>

          {storyGroupsForStrip
            .filter((group) => group.userId !== String(user?.id || ''))
            .map((group) => (
              <ButtonBase
                key={group.userId}
                onClick={() => openStoryViewer(group)}
                sx={{
                  minWidth: 72,
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 0.45,
                  borderRadius: 2.2,
                  p: 0.6,
                }}
              >
                <Avatar
                  src={group.user?.avatar}
                  sx={{
                    width: 58,
                    height: 58,
                    border: '2.5px solid',
                    borderColor: group.viewed
                      ? (isDark ? 'rgba(146,167,191,0.5)' : 'rgba(132,149,165,0.6)')
                      : (isDark ? '#62AFFF' : '#1FA35B'),
                  }}
                >
                  {(group.user?.fullName || group.user?.username || 'U').slice(0, 1).toUpperCase()}
                </Avatar>
                <Typography variant="caption" noWrap sx={{ maxWidth: 74 }}>
                  {group.user?.fullName || `@${group.user?.username || 'user'}`}
                </Typography>
              </ButtonBase>
            ))}
          </Box>
        </Box>
      </Paper>

      <List sx={{ mt: 1, px: 0.1 }}>
        {visible.map((chat) => {
          const rawChat = chat as Chat & Record<string, any>;
          const rawLastMessage = (rawChat.lastMessage ?? rawChat.last_message) as Record<string, any> | undefined;
          const peer = chat.participants?.find((p) => p.id !== user?.id) || chat.participants?.[0];
          const localContactName = peer ? getContactByUserId(peer.id)?.displayName : '';
          const name = getChatName(chat, user?.id, localContactName);
          const date = formatChatDate(chat.lastMessageTime || rawChat.last_message_time || chat.updatedAt || rawChat.updated_at);
          const avatarData = getChatAvatar(chat, user?.id, localContactName);
          const serverUnreadCount = Math.max(0, Number(rawChat.unreadCount ?? rawChat.unread_count ?? 0));
          const lastAuthorId = String(
            rawLastMessage?.userId ??
              rawLastMessage?.user_id ??
              rawLastMessage?.senderId ??
              rawLastMessage?.sender_id ??
              rawChat.lastMessageUserId ??
              rawChat.last_message_user_id ??
              '',
          );
          const localLastMessage = (messages[chat.id] || [])[Math.max((messages[chat.id] || []).length - 1, 0)];
          const rawLastAttachments = Array.isArray(rawLastMessage?.attachments) ? rawLastMessage.attachments : [];
          const localLastAttachments = Array.isArray((localLastMessage as any)?.attachments)
            ? ((localLastMessage as any).attachments as any[])
            : [];
          const allLastAttachments = [...rawLastAttachments, ...localLastAttachments];
          const attachmentHint = allLastAttachments.some((item) => item?.type === 'image')
            ? 'Фото'
            : allLastAttachments.some((item) => item?.type === 'video')
              ? 'Видео'
              : allLastAttachments.length > 0
                ? 'Вложение'
                : '';
          const subtitle =
            chat.lastMessageText ||
            rawChat.last_message_text ||
            attachmentHint ||
            (chat.type === 'saved' ? 'Сообщения самому себе' : '');
          const inferredAuthorId =
            lastAuthorId ||
            String(
              localLastMessage?.userId ??
                rawChat.lastMessageUserId ??
                rawChat.last_message_user_id ??
                '',
            );
          const outgoingFlag = Boolean(
            rawLastMessage?.isOutgoing ??
              rawLastMessage?.outgoing ??
              rawChat.lastMessageOutgoing ??
              rawChat.last_message_outgoing ??
              rawChat.last_message_is_mine,
          );
          const ownLastMessage =
            (!!user?.id && !!inferredAuthorId && String(user.id) === inferredAuthorId) ||
            (!!user?.id && !inferredAuthorId && outgoingFlag && serverUnreadCount === 0);
          const lastMessageStatus = String(
            rawLastMessage?.status ?? localLastMessage?.status ?? rawChat.lastMessageStatus ?? rawChat.last_message_status ?? '',
          ).toLowerCase();
          const isLastReadByPeer =
            lastMessageStatus.includes('read') ||
            lastMessageStatus.includes('seen') ||
            localLastMessage?.status === 'read' ||
            !!(
              rawLastMessage?.readAt ||
              rawLastMessage?.read_at ||
              rawLastMessage?.seenAt ||
              rawLastMessage?.seen_at ||
              rawChat.lastMessageReadAt ||
              rawChat.last_message_read_at ||
              rawChat.last_message_read === true ||
              rawChat.last_message_read === 1
            );
          const hasUnread = chat.type !== 'saved' && serverUnreadCount > 0;
          const unreadCount = hasUnread ? serverUnreadCount : 0;
          const isSelected = selectedChatId === chat.id;

          return (
            <ListItemButton
              key={chat.id}
              onClick={() => handleChatClick(chat.id)}
              onContextMenu={(event) => event.preventDefault()}
              onPointerDown={(event) => {
                if (event.pointerType === 'mouse' && event.button !== 0) return;
                startChatLongPress(chat.id);
              }}
              onPointerUp={clearHoldTimer}
              onPointerLeave={clearHoldTimer}
              onPointerCancel={clearHoldTimer}
              sx={{
                py: chatCompactMode ? 0.8 : 1.2,
                borderRadius: 3,
                mb: 0.7,
                border: '1px solid',
                borderColor: isSelected
                  ? (isDark ? 'rgba(103,182,255,0.36)' : 'rgba(34,154,104,0.28)')
                  : (isDark ? 'rgba(216,231,255,0.08)' : 'rgba(21,53,40,0.06)'),
                bgcolor: isSelected
                  ? isDark
                    ? 'rgba(47, 85, 122, 0.72)'
                    : 'rgba(230, 246, 238, 0.98)'
                  : hasUnread
                    ? isDark
                      ? 'rgba(24, 44, 68, 0.88)'
                      : 'rgba(245, 251, 247, 0.98)'
                    : isDark
                      ? 'rgba(14, 24, 37, 0.72)'
                      : 'rgba(255,255,255,0.86)',
                boxShadow: isDark
                  ? '0 14px 28px rgba(0,0,0,0.18)'
                  : '0 14px 28px rgba(25,82,57,0.06)',
              }}
            >
              <Avatar
                src={avatarData.src}
                sx={{
                  mr: 1.5,
                  width: chatCompactMode ? 48 : 56,
                  height: chatCompactMode ? 48 : 56,
                  bgcolor: chat.type === 'saved' ? '#D6A21B' : 'primary.main',
                  boxShadow: isDark
                    ? '0 10px 24px rgba(0,0,0,0.24)'
                    : '0 10px 24px rgba(31,163,91,0.16)',
                }}
              >
                {chat.type === 'saved' ? <BookmarkRoundedIcon sx={{ fontSize: 30 }} /> : avatarData.initial}
              </Avatar>
              <ListItemText
                primary={<Typography fontWeight={hasUnread ? 800 : 700}>{name}</Typography>}
                secondary={<Typography color="text.secondary" noWrap>{subtitle}</Typography>}
              />
              <Box sx={{ textAlign: 'right' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                  {!!chat.pinned && (
                    <PushPinRoundedIcon sx={{ fontSize: 15, color: isDark ? '#A8CBF0' : '#1A8F51' }} />
                  )}
                  <Typography variant="body2" color="text.secondary">{date}</Typography>
                </Box>
                {hasUnread ? (
                  <Box
                    sx={{
                      mt: 0.6,
                      minWidth: 20,
                      height: 20,
                      px: unreadCount > 9 ? 0.6 : 0,
                      borderRadius: 99,
                      display: 'inline-grid',
                      placeItems: 'center',
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#fff',
                      bgcolor: isDark ? '#3E92E2' : '#1FA35B',
                    }}
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </Box>
                ) : ownLastMessage && !!subtitle ? (
                  isLastReadByPeer ? (
                    <DoneAllIcon sx={{ fontSize: 16, color: isDark ? '#73B4FF' : '#1C9C58', mt: 0.5 }} />
                  ) : (
                    <DoneRoundedIcon sx={{ fontSize: 16, color: 'text.secondary', mt: 0.5 }} />
                  )
                ) : null}
              </Box>
            </ListItemButton>
          );
        })}
      </List>

      {!visible.length && <Typography sx={{ p: 2, textAlign: 'center' }} color="text.secondary">Чаты не найдены</Typography>}

      <Fab
        color="primary"
        sx={{
          position: 'fixed',
          right: 'max(env(safe-area-inset-right), 24px)',
          bottom: 'calc(max(env(safe-area-inset-bottom), 14px) + 96px)',
          boxShadow: isDark ? '0 10px 24px rgba(125,106,227,0.45)' : '0 10px 24px rgba(31,163,91,0.35)',
        }}
        onClick={() => navigate('/add-contact')}
      >
        <EditIcon />
      </Fab>

      <Drawer anchor="left" open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <Box sx={{ width: 'min(320px, 88vw)', height: '100%', bgcolor: 'transparent', display: 'flex', flexDirection: 'column' }}>
          <Box
            sx={{
              pt: 'max(env(safe-area-inset-top), 12px)',
              px: 2,
              pb: 1.5,
              borderBottom: '1px solid',
              borderColor: 'divider',
              background: isDark ? 'linear-gradient(160deg, #13283D, #0E1B2A)' : 'linear-gradient(160deg, #1FA35B, #22C36A)',
            }}
          >
            <Box sx={{ display: 'flex', gap: 1.2, alignItems: 'center' }}>
              <Avatar src={user?.avatar} onClick={() => { if (user?.id) { navigate(`/user/${user.id}`); setDrawerOpen(false); } }} sx={{ width: 58, height: 58, bgcolor: 'primary.main', flexShrink: 0, cursor: 'pointer' }}>
                {(user?.fullName || user?.username || 'A').slice(0, 1).toUpperCase()}
              </Avatar>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="h6" fontWeight={700} sx={{ color: '#fff', fontSize: 18 }} noWrap>
                  {user?.fullName || 'Пользователь'}
                </Typography>
                <Typography sx={{ color: 'rgba(255,255,255,0.9)', fontSize: 14 }} noWrap>
                  @{user?.username || 'username'}
                </Typography>
              </Box>
              <IconButton
                onClick={() => setTheme(isDark ? 'light' : 'dark')}
                size="small"
                sx={{
                  border: '1px solid',
                  borderColor: 'rgba(255,255,255,0.45)',
                  color: '#fff',
                  bgcolor: 'rgba(255,255,255,0.12)',
                  flexShrink: 0,
                }}
              >
                {isDark ? <LightModeOutlinedIcon sx={{ color: '#fff' }} /> : <DarkModeOutlinedIcon sx={{ color: '#fff' }} />}
              </IconButton>
            </Box>
          </Box>

          <Box sx={{ p: 1.5, flex: 1, display: 'flex', flexDirection: 'column' }}>
            <Box
              sx={{
                borderRadius: 3,
                p: 0.8,
                border: '1px solid',
                borderColor: isDark ? 'rgba(175,193,217,0.18)' : 'rgba(31,163,91,0.2)',
                bgcolor: isDark ? 'rgba(17,33,50,0.75)' : '#FFFFFF',
                boxShadow: isDark ? '0 8px 22px rgba(0,0,0,0.28)' : '0 8px 22px rgba(31,163,91,0.12)',
              }}
            >
              <Typography
                sx={{
                  px: 1.2,
                  pt: 0.6,
                  pb: 0.7,
                  fontSize: 12,
                  letterSpacing: 0.45,
                  textTransform: 'uppercase',
                  color: isDark ? '#8FA8C2' : '#5E7168',
                }}
              >
                Меню
              </Typography>
              <List sx={{ p: 0 }}>
                <ListItemButton
                  sx={menuItemSx}
                  onClick={() => {
                    if (user?.id) navigate(`/user/${user.id}`);
                    setDrawerOpen(false);
                  }}
                >
                  <ListItemIcon><PersonIcon /></ListItemIcon><ListItemText primary="Мой профиль" />
                </ListItemButton>
                <ListItemButton sx={menuItemSx} onClick={() => { navigate('/contacts'); setDrawerOpen(false); }}>
                  <ListItemIcon><Groups2RoundedIcon /></ListItemIcon><ListItemText primary="Контакты" />
                </ListItemButton>
                <ListItemButton sx={menuItemSx} onClick={() => { void openSavedFromDrawer(); }}>
                  <ListItemIcon><BookmarkRoundedIcon /></ListItemIcon><ListItemText primary="Избранное" />
                </ListItemButton>
                <ListItemButton sx={menuItemSx} onClick={() => { navigate('/settings'); setDrawerOpen(false); }}>
                  <ListItemIcon><SettingsRoundedIcon /></ListItemIcon><ListItemText primary="Настройки" />
                </ListItemButton>
                <ListItemButton sx={menuItemSx} onClick={() => { navigate('/support'); setDrawerOpen(false); }}>
                  <ListItemIcon><PsychologyRoundedIcon /></ListItemIcon><ListItemText primary="AI чат" />
                </ListItemButton>
                {gameEnabled && (
                  <ListItemButton sx={menuItemSx} onClick={() => { navigate('/game'); setDrawerOpen(false); }}>
                    <ListItemIcon><SportsEsportsRoundedIcon /></ListItemIcon><ListItemText primary="Игра" />
                  </ListItemButton>
                )}
                {isCreator && (
                  <ListItemButton sx={menuItemSx} onClick={() => { navigate('/admin'); setDrawerOpen(false); }}>
                    <ListItemIcon><AdminPanelSettingsIcon /></ListItemIcon><ListItemText primary="Инструменты" />
                  </ListItemButton>
                )}
                <ListItemButton
                  sx={{
                    ...menuItemSx,
                    mt: 0.4,
                    mb: 0,
                    '& .MuiTypography-root': { color: '#E44B4B', fontWeight: 600 },
                  }}
                  onClick={() => {
                    setDrawerOpen(false);
                    setShowLogoutDialog(true);
                  }}
                >
                  <ListItemText primary="Выйти" />
                </ListItemButton>
              </List>
            </Box>
          </Box>
        </Box>
      </Drawer>

      <Dialog open={storyComposerOpen} onClose={closeStoryComposer} fullWidth maxWidth="sm">
        <DialogTitle>Новый статус (24 часа)</DialogTitle>
        <DialogContent sx={{ pt: 1.2 }}>
          <input
            ref={storyInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={(event) => {
              pickStoryFiles(event.target.files);
              if (storyInputRef.current) {
                storyInputRef.current.value = '';
              }
            }}
          />

          <TextField
            fullWidth
            multiline
            minRows={2}
            maxRows={4}
            label="Подпись"
            placeholder="Что нового?"
            value={storyText}
            onChange={(event) => setStoryText(event.target.value)}
            sx={{ mb: 1.2 }}
          />

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.8 }}>
            <Typography variant="body2" color="text.secondary">
              Фото: {storyFiles.length}/{STORY_MEDIA_LIMIT}
            </Typography>
            <Button
              size="small"
              onClick={() => storyInputRef.current?.click()}
              disabled={storyFiles.length >= STORY_MEDIA_LIMIT}
            >
              Добавить фото
            </Button>
          </Box>

          <Box sx={{ display: 'flex', gap: 0.9, overflowX: 'auto', pb: 0.4 }}>
            {storyPreviewUrls.map((url, index) => (
              <Box
                key={`${url}-${index}`}
                sx={{
                  position: 'relative',
                  width: 74,
                  height: 74,
                  borderRadius: 2,
                  overflow: 'hidden',
                  border: '1px solid',
                  borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.12)',
                  flexShrink: 0,
                }}
              >
                <Box component="img" src={url} alt={`story-${index}`} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <IconButton
                  size="small"
                  onClick={() => setStoryFiles((prev) => prev.filter((_, fileIndex) => fileIndex !== index))}
                  sx={{
                    position: 'absolute',
                    right: 2,
                    top: 2,
                    width: 20,
                    height: 20,
                    color: '#fff',
                    bgcolor: 'rgba(0,0,0,0.55)',
                    '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' },
                  }}
                >
                  <CloseRoundedIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Box>
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeStoryComposer}>Отмена</Button>
          <Button variant="contained" onClick={submitStory} disabled={storySubmitting}>
            {storySubmitting ? 'Публикация...' : 'Опубликовать'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={storyViewerOpen} onClose={closeStoryViewer} fullScreen>
        <Box
          sx={{
            height: '100%',
            bgcolor: '#000',
            color: '#fff',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.2, pt: 'max(env(safe-area-inset-top), 12px)' }}>
            <Avatar src={activeStory?.user?.avatar} sx={{ width: 36, height: 36 }}>
              {(activeStory?.user?.fullName || activeStory?.user?.username || 'U').slice(0, 1).toUpperCase()}
            </Avatar>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography sx={{ fontWeight: 700 }} noWrap>
                {activeStory?.user?.fullName || `@${activeStory?.user?.username || 'user'}`}
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.82 }}>
                {formatStoryTime(activeStory?.createdAt)}
              </Typography>
            </Box>
            {isOwnActiveStory && (
              <IconButton onClick={() => void deleteActiveStory()} disabled={storyDeleting} sx={{ color: '#fff' }}>
                <DeleteOutlineRoundedIcon />
              </IconButton>
            )}
            <IconButton onClick={closeStoryViewer} sx={{ color: '#fff' }}>
              <CloseRoundedIcon />
            </IconButton>
          </Box>

          <Box sx={{ px: 1.2, pb: 0.6 }}>
            <Box sx={{ display: 'flex', gap: 0.55 }}>
              {storyViewerSlides.map((item, index) => (
                <Box
                  key={`${item.story.id}-${index}`}
                  sx={{
                    flex: 1,
                    height: 3,
                    borderRadius: 99,
                    bgcolor: index <= storyViewerIndex ? '#fff' : 'rgba(255,255,255,0.35)',
                  }}
                />
              ))}
            </Box>
          </Box>

          <Box sx={{ flex: 1, position: 'relative', display: 'grid', placeItems: 'center' }}>
            {activeStorySlide?.mediaUrl ? (
              <Box
                component="img"
                src={activeStorySlide.mediaUrl}
                alt="story"
                sx={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            ) : activeStory ? (
              <Typography sx={{ px: 3, textAlign: 'center', fontSize: 22, fontWeight: 700 }}>
                {activeStory.text || 'Статус'}
              </Typography>
            ) : null}

            {!!activeStory?.text && !!activeStorySlide?.mediaUrl && (
              <Box
                sx={{
                  position: 'absolute',
                  left: 16,
                  right: 16,
                  bottom: 'max(env(safe-area-inset-bottom), 24px)',
                  p: 1.1,
                  borderRadius: 2,
                  bgcolor: 'rgba(0,0,0,0.48)',
                }}
              >
                <Typography sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {activeStory.text}
                </Typography>
              </Box>
            )}

            <IconButton
              onClick={() => stepStory(-1)}
              disabled={storyViewerIndex <= 0}
              sx={{
                position: 'absolute',
                left: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#fff',
                bgcolor: 'rgba(0,0,0,0.35)',
                '&:hover': { bgcolor: 'rgba(0,0,0,0.5)' },
              }}
            >
              <ArrowBackIosNewRoundedIcon />
            </IconButton>
            <IconButton
              onClick={() => stepStory(1)}
              disabled={storyViewerSlides.length === 0 || storyViewerIndex >= storyViewerSlides.length - 1}
              sx={{
                position: 'absolute',
                right: 8,
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#fff',
                bgcolor: 'rgba(0,0,0,0.35)',
                '&:hover': { bgcolor: 'rgba(0,0,0,0.5)' },
              }}
            >
              <ArrowForwardIosRoundedIcon />
            </IconButton>

            {isOwnActiveStory && (
              <Box
                sx={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 'max(env(safe-area-inset-bottom), 14px)',
                  display: 'flex',
                  justifyContent: 'center',
                  px: 2,
                }}
              >
                <ButtonBase
                  onClick={openStoryViewersSheet}
                  sx={{
                    minHeight: 36,
                    px: 1.2,
                    borderRadius: 99,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.7,
                    bgcolor: 'rgba(0,0,0,0.42)',
                    border: '1px solid rgba(255,255,255,0.22)',
                  }}
                >
                  <VisibilityRoundedIcon sx={{ fontSize: 18 }} />
                  <Typography sx={{ fontSize: 13, fontWeight: 700 }}>
                    {storyViewersLoading ? 'Загрузка...' : `Просмотры: ${activeStoryViewsCount}`}
                  </Typography>
                </ButtonBase>
              </Box>
            )}
          </Box>
        </Box>
      </Dialog>

      <Drawer
        anchor="bottom"
        open={storyViewersSheetOpen}
        onClose={() => setStoryViewersSheetOpen(false)}
        sx={{ zIndex: (muiTheme) => muiTheme.zIndex.modal + 6 }}
        ModalProps={{ keepMounted: true }}
        PaperProps={{
          sx: {
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            bgcolor: isDark ? '#0E1C2E' : '#FFFFFF',
            pb: 'max(env(safe-area-inset-bottom), 10px)',
          },
        }}
      >
        <Box sx={{ p: 1.2 }}>
          <Typography sx={{ fontWeight: 700, mb: 1 }}>Кто смотрел статус</Typography>
          {storyViewersLoading ? (
            <Box sx={{ py: 3, display: 'grid', placeItems: 'center' }}>
              <CircularProgress size={22} />
            </Box>
          ) : storyViewers.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 1.5 }}>
              Нет просмотров.
            </Typography>
          ) : (
            <Box sx={{ maxHeight: '55dvh', overflowY: 'auto', display: 'grid', gap: 0.75 }}>
              {storyViewers.map((viewer) => (
                <Box
                  key={`${viewer.userId}-${viewer.viewedAt}`}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    p: 0.8,
                    borderRadius: 2,
                    bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                  }}
                >
                  <Avatar src={viewer.user.avatar} sx={{ width: 34, height: 34 }}>
                    {(viewer.user.fullName || viewer.user.username || 'U').slice(0, 1).toUpperCase()}
                  </Avatar>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography noWrap sx={{ fontWeight: 700, fontSize: 14 }}>
                      {viewer.user.fullName || `@${viewer.user.username || 'user'}`}
                    </Typography>
                    <Typography variant="caption" sx={{ opacity: 0.76 }}>
                      {viewer.viewedAt
                        ? new Date(viewer.viewedAt).toLocaleString('ru-RU', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'Недавно'}
                    </Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Drawer>

      <Menu anchorEl={chatActionsAnchor} open={!!chatActionsAnchor} onClose={() => setChatActionsAnchor(null)}>
        <MenuItem
          onClick={() => {
            void runSelectedChatAction('pin');
          }}
        >
          {selectedChat?.pinned ? 'Открепить' : 'Закрепить'}
        </MenuItem>
        {selectedChat?.type === 'saved' && (
          <MenuItem
            onClick={() => {
              setSavedChatHidden(true);
              setSelectedChatId(null);
              setChatActionsAnchor(null);
              pushSnackbar({ message: 'Избранное скрыто из списка чатов', timeout: 1800 });
            }}
          >
            Скрыть из списка чатов
          </MenuItem>
        )}
        {selectedChat?.type !== 'saved' && (
          <MenuItem
            onClick={() => {
              void runSelectedChatAction('archive');
            }}
          >
            {selectedChat?.archived ? 'Вернуть из архива' : 'В архив'}
          </MenuItem>
        )}
        {selectedChat?.type !== 'saved' && (
          <MenuItem
            sx={{ color: 'error.main' }}
            onClick={() => {
              void runSelectedChatAction('delete');
            }}
          >
            Удалить чат
          </MenuItem>
        )}
      </Menu>

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

