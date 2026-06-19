import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  Avatar,
  Box,
  Button,
  ButtonBase,
  CircularProgress,
  Dialog,
  Drawer,
  IconButton,
  Menu,
  MenuItem,
  Popover,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import BookmarkRoundedIcon from '@mui/icons-material/BookmarkRounded';
import DoneRoundedIcon from '@mui/icons-material/DoneRounded';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import InsertDriveFileRoundedIcon from '@mui/icons-material/InsertDriveFileRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded';
import PhotoCameraRoundedIcon from '@mui/icons-material/PhotoCameraRounded';
import CollectionsRoundedIcon from '@mui/icons-material/CollectionsRounded';
import InsertEmoticonRoundedIcon from '@mui/icons-material/InsertEmoticonRounded';
import PushPinRoundedIcon from '@mui/icons-material/PushPinRounded';
import { useNavigate, useParams } from 'react-router-dom';
import { alpha, useTheme } from '@mui/material/styles';
import { messageApi, uploadApi, userApi } from '../lib/api';
import { getSocket } from '../lib/socket';
import { useChatStore } from '../stores/chatStore';
import { useAuthStore } from '../stores/authStore';
import { useContactsStore } from '../stores/contactsStore';
import type { Attachment, Message, User } from '../lib/types';
import { useSnackbarStore } from '../stores/snackbarStore';
import { useSettingsStore } from '../stores/settingsStore';

const formatPresence = (status?: User['status'], lastSeen?: string): string => {
  if (status === 'online') return 'в сети';
  if (status === 'away') return 'отошел(ла)';
  if (status === 'hidden') return 'был(а) недавно';
  if (!lastSeen) return 'не в сети';

  const date = new Date(lastSeen);
  if (Number.isNaN(date.getTime())) return 'не в сети';

  return `был(а) ${date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })}`;
};

const formatGroupMembers = (total: number): string => {
  const value = Math.max(0, Math.trunc(total));
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return `${value} участник`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${value} участника`;
  return `${value} участников`;
};

const QUICK_REACTIONS = ['❤️', '👍', '👎', '🔥'] as const;
type QuickReaction = (typeof QUICK_REACTIONS)[number];
const QUICK_EMOJIS = ['😀', '😁', '😂', '😊', '😍', '😘', '🤔', '😎', '🥳', '🙏', '👍', '🔥', '❤️', '👏', '🤝', '😢', '😡'];
const RECENT_EMOJI_STORAGE_KEY = 'vibe:recent-emojis';
const REACTION_VIEWER_LIMIT = 300;
const GALLERY_PAGE_SIZE = 24;
const SAMSUNG_GALLERY_PAGE_SIZE = 12;
const GALLERY_CACHE_TTL_MS = 45000;
const INLINE_GALLERY_LIMIT = 72;
const INLINE_GALLERY_THUMB_SIZE = 180;
const SAMSUNG_INLINE_GALLERY_LIMIT = 16;
const SAMSUNG_INLINE_GALLERY_THUMB_SIZE = 96;
const MESSAGE_RENDER_BATCH = 160;
const MESSAGE_RENDER_STEP = 90;
const COMPOSER_POLL_PAUSE_MS = 1400;
const SOCKET_HEALTH_POLL_MS = 20000;
const MESSAGE_LINK_OR_MENTION_RE = /(https?:\/\/[^\s<]+)|@([A-Za-z0-9_]{3,32})/gi;
const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;

const parseMessageTimestamp = (value: string): number => {
  const normalized = String(value || '').trim();
  if (!normalized) return Number.NaN;
  const direct = Date.parse(normalized);
  if (Number.isFinite(direct)) return direct;
  const withT = Date.parse(normalized.replace(' ', 'T'));
  if (Number.isFinite(withT)) return withT;
  return Number.NaN;
};

const formatAttachmentSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`;
  return `${Math.round(bytes / 104857.6) / 10} MB`;
};

const sanitizeFileName = (value: string): string => {
  const cleaned = value
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'attachment';
};

const guessExtension = (mimeType: string, attachmentType?: Attachment['type']): string => {
  const mime = String(mimeType || '').toLowerCase();
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('heic')) return 'heic';
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('mov')) return 'mov';
  if (mime.includes('webm')) return 'webm';
  if (attachmentType === 'video') return 'mp4';
  if (attachmentType === 'image') return 'jpg';
  return 'bin';
};

const inferFileName = (attachment: Attachment, url: string, mimeType: string): string => {
  const explicitName = sanitizeFileName(String(attachment?.name || ''));
  if (explicitName && explicitName !== 'attachment') {
    if (explicitName.includes('.')) return explicitName;
    return `${explicitName}.${guessExtension(mimeType, attachment.type)}`;
  }

  const fromUrlRaw = decodeURIComponent(String(url.split('?')[0] || '').split('/').pop() || '');
  const fromUrl = sanitizeFileName(fromUrlRaw);
  if (fromUrl && fromUrl !== 'attachment') {
    if (fromUrl.includes('.')) return fromUrl;
    return `${fromUrl}.${guessExtension(mimeType, attachment.type)}`;
  }

  const baseName = attachment.type === 'video' ? 'video' : attachment.type === 'image' ? 'photo' : 'file';
  return `${baseName}.${guessExtension(mimeType, attachment.type)}`;
};

const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read blob'));
    reader.onload = () => {
      const value = String(reader.result || '');
      const [, base64] = value.split(',', 2);
      if (!base64) {
        reject(new Error('Invalid base64 result'));
        return;
      }
      resolve(base64);
    };
    reader.readAsDataURL(blob);
  });

type DeviceGalleryItem = {
  identifier: string;
  previewUrl: string;
  creationDate?: string;
  data?: string;
  path?: string;
};

type ReactionViewerItem = {
  userId: string;
  reaction: string;
  reactedAt?: string;
  user: {
    id: string;
    username?: string;
    fullName?: string;
    avatar?: string;
  };
};

type ChatRow = { type: 'date'; key: string; label: string } | { type: 'message'; key: string; value: Message };

const IMAGE_FILE_RE = /\.(jpe?g|jfif|png|gif|webp|heic|heif|bmp|avif)$/i;

const normalizeNativePath = (value: string): string => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('content://') || raw.startsWith('file://') || raw.startsWith('/')) {
    return raw;
  }
  return `/${raw.replace(/^\/+/, '')}`;
};

const galleryPathPriority = (pathValue: string): number => {
  const value = String(pathValue || '').toLowerCase();
  if (value.includes('/dcim/camera')) return 0;
  if (value.includes('/camera')) return 1;
  if (value.includes('/pictures')) return 2;
  if (value.includes('/screenshots')) return 3;
  if (value.includes('/download')) return 4;
  return 9;
};

const isSamsungLikeDevice = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  const ua = String(navigator.userAgent || '').toLowerCase();
  return ua.includes('samsung') || ua.includes('samsungbrowser') || ua.includes('sm-') || ua.includes('galaxy');
};

const getGalleryPageSize = (): number => (isSamsungLikeDevice() ? SAMSUNG_GALLERY_PAGE_SIZE : GALLERY_PAGE_SIZE);
const getInlineGalleryLimit = (): number => (isSamsungLikeDevice() ? SAMSUNG_INLINE_GALLERY_LIMIT : INLINE_GALLERY_LIMIT);
const getInlineGalleryThumbSize = (): number => (isSamsungLikeDevice() ? SAMSUNG_INLINE_GALLERY_THUMB_SIZE : INLINE_GALLERY_THUMB_SIZE);

export default function ChatPage() {
  const { chatId = '' } = useParams();
  const navigate = useNavigate();

  const {
    chats,
    messages,
    loadMessages,
    sendMessage,
    isLoadingMessages,
    setCurrentChat,
    typingUsers,
    markAsRead,
    clearChat,
    archiveChat,
    unarchiveChat,
    muteChat,
    pinChat,
    deleteChat,
    deleteMessage,
    updateMessage,
  } = useChatStore();

  const me = useAuthStore((s) => s.user);
  const getContactByUserId = useContactsStore((s) => s.getContactByUserId);
  const pushSnackbar = useSnackbarStore((s) => s.push);
  const savedChatHidden = useSettingsStore((s) => s.savedChatHidden);
  const setSavedChatHidden = useSettingsStore((s) => s.setSavedChatHidden);
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [hasDraftText, setHasDraftText] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [msgMenuAnchor, setMsgMenuAnchor] = useState<HTMLElement | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [reactionAnchor, setReactionAnchor] = useState<HTMLElement | null>(null);
  const [reactionMessageId, setReactionMessageId] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [uploaded, setUploaded] = useState<any[]>([]);
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [mediaPickerBusy, setMediaPickerBusy] = useState(false);
  const [mediaPickerThumbs, setMediaPickerThumbs] = useState<string[]>([]);
  const [deviceGalleryItems, setDeviceGalleryItems] = useState<DeviceGalleryItem[]>([]);
  const [deviceGalleryLoading, setDeviceGalleryLoading] = useState(false);
  const [deviceGalleryError, setDeviceGalleryError] = useState('');
  const [deviceGalleryFailureCount, setDeviceGalleryFailureCount] = useState(0);
  const [galleryVisibleCount, setGalleryVisibleCount] = useState(() => getGalleryPageSize());
  const [renderedRowsLimit, setRenderedRowsLimit] = useState(MESSAGE_RENDER_BATCH);
  const [emojiAnchor, setEmojiAnchor] = useState<HTMLElement | null>(null);
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);
  const [reactionViewerOpen, setReactionViewerOpen] = useState(false);
  const [reactionViewerLoading, setReactionViewerLoading] = useState(false);
  const [reactionViewerMessageId, setReactionViewerMessageId] = useState<string | null>(null);
  const [reactionViewerItems, setReactionViewerItems] = useState<ReactionViewerItem[]>([]);
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const messageInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryListRef = useRef<HTMLDivElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const lastRenderedMessageIdRef = useRef<string>('');
  const galleryLastLoadedAtRef = useRef<number>(0);
  const galleryLoadInFlightRef = useRef<boolean>(false);
  const reactionHoldTimerRef = useRef<number | null>(null);
  const mentionCacheRef = useRef<Record<string, string>>({});
  const textDraftRef = useRef('');
  const composerPauseUntilRef = useRef(0);
  const lastFallbackPollAtRef = useRef(0);
  const edgeSwipeRef = useRef<{ active: boolean; startX: number; startY: number; swiped: boolean }>({
    active: false,
    startX: 0,
    startY: 0,
    swiped: false,
  });
  const messageGestureRef = useRef<{ messageId: string; startX: number; startY: number; swipeDone: boolean } | null>(null);
  const reactionTimerRef = useRef<number | null>(null);

  const syncDraftState = useCallback((value: string) => {
    const nextHasDraft = String(value || '').trim().length > 0;
    setHasDraftText((prev) => (prev === nextHasDraft ? prev : nextHasDraft));
  }, []);

  const noteComposerActivity = useCallback(() => {
    composerPauseUntilRef.current = Date.now() + COMPOSER_POLL_PAUSE_MS;
  }, []);

  const setDraftText = useCallback(
    (
      value: string,
      options?: {
        syncInput?: boolean;
        focus?: boolean;
        cursor?: number;
      },
    ) => {
      const nextValue = String(value ?? '');
      textDraftRef.current = nextValue;
      syncDraftState(nextValue);

      if (options?.syncInput === false) return;
      const input = messageInputRef.current;
      if (!input) return;
      if (input.value !== nextValue) {
        input.value = nextValue;
      }
      if (typeof options?.cursor === 'number') {
        const position = Math.max(0, Math.min(nextValue.length, options.cursor));
        input.setSelectionRange?.(position, position);
      }
      if (options?.focus) {
        input.focus();
      }
    },
    [syncDraftState],
  );

  const handleDraftChange = useCallback(
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const nextValue = String(event.target.value || '');
      textDraftRef.current = nextValue;
      syncDraftState(nextValue);
      noteComposerActivity();
    },
    [noteComposerActivity, syncDraftState],
  );

  const chat = chats.find((c) => c.id === chatId);
  const loadPinnedMessages = async (targetChatId = chatId) => {
    const normalizedChatId = String(targetChatId || '').trim();
    if (!normalizedChatId) {
      setPinnedMessages([]);
      return;
    }
    try {
      const response = await messageApi.getPinnedByChatId(normalizedChatId);
      const items = Array.isArray(response?.items)
        ? (response.items as Message[])
        : (Array.isArray(response) ? (response as Message[]) : []);
      setPinnedMessages(items.slice(0, 3));
    } catch {
      setPinnedMessages([]);
    }
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_EMOJI_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const normalized = parsed
        .map((item) => String(item || '').trim())
        .filter((item, index, arr) => item !== '' && arr.indexOf(item) === index)
        .slice(0, 18);
      setRecentEmojis(normalized);
    } catch {
      // ignore invalid local data
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(RECENT_EMOJI_STORAGE_KEY, JSON.stringify(recentEmojis.slice(0, 18)));
    } catch {
      // local storage can be unavailable
    }
  }, [recentEmojis]);

  useEffect(() => {
    setCurrentChat(chatId);
    loadMessages(chatId);
    loadPinnedMessages(chatId).catch(() => null);
    markAsRead(chatId).catch(() => null);
    return () => setCurrentChat(null);
  }, [chatId, loadMessages, markAsRead, setCurrentChat]);

  useEffect(() => {
    if (!chatId) return;
    const timerId = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (composerPauseUntilRef.current > now) return;

      const socketConnected = Boolean(getSocket()?.connected);
      if (socketConnected && now - lastFallbackPollAtRef.current < SOCKET_HEALTH_POLL_MS) {
        return;
      }

      lastFallbackPollAtRef.current = now;
      loadMessages(chatId).catch(() => null);
    }, 5000);
    return () => window.clearInterval(timerId);
  }, [chatId, loadMessages]);

  useEffect(() => {
    lastRenderedMessageIdRef.current = '';
    composerPauseUntilRef.current = 0;
    lastFallbackPollAtRef.current = 0;
    setSelectedMessage(null);
    setEditingMessage(null);
    setDraftText('');
    setRenderedRowsLimit(MESSAGE_RENDER_BATCH);
    setPinnedMessages([]);
    setReactionViewerOpen(false);
    setReactionViewerLoading(false);
    setReactionViewerMessageId(null);
    setReactionViewerItems([]);
    setEmojiAnchor(null);
  }, [chatId, setDraftText]);

  const chatMessages = useMemo(() => messages[chatId] || [], [messages, chatId]);
  const pinnedMessageIds = useMemo(() => {
    const ids = new Set<string>();
    pinnedMessages.forEach((item) => {
      const messageId = String(item?.id || '').trim();
      if (messageId) ids.add(messageId);
    });
    return ids;
  }, [pinnedMessages]);
  const selectedMessagePinned = Boolean(selectedMessage && pinnedMessageIds.has(String(selectedMessage.id || '')));

  useEffect(() => {
    if (!chatId || isLoadingMessages || !chatMessages.length) return;
    const lastMessageId = String(chatMessages[chatMessages.length - 1]?.id || '').trim();
    if (!lastMessageId) return;
    if (lastRenderedMessageIdRef.current === lastMessageId) return;

    lastRenderedMessageIdRef.current = lastMessageId;
    const scrollToBottom = () => {
      const list = messageListRef.current;
      if (!list) return;
      list.scrollTop = list.scrollHeight;
    };

    scrollToBottom();
    const frameId = window.requestAnimationFrame(scrollToBottom);
    const timerId = window.setTimeout(scrollToBottom, 120);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timerId);
    };
  }, [chatId, chatMessages, isLoadingMessages]);

  useEffect(() => {
    if (!chatId || !me?.id || !chatMessages.length) return;
    const last = chatMessages[chatMessages.length - 1];
    if (!last || String(last.userId) === String(me.id)) return;
    markAsRead(chatId).catch(() => null);
  }, [chatId, chatMessages, me?.id, markAsRead]);

  useEffect(() => {
    if (!chatId) return;
    loadPinnedMessages(chatId).catch(() => null);
  }, [chatId, chatMessages.length]);

  const emojiPalette = useMemo(() => {
    const merged = [...recentEmojis, ...QUICK_EMOJIS];
    return merged
      .map((item) => String(item || '').trim())
      .filter((item, index, arr) => item !== '' && arr.indexOf(item) === index)
      .slice(0, 24);
  }, [recentEmojis]);

  const visibleDeviceGalleryItems = useMemo(
    () => deviceGalleryItems.slice(0, galleryVisibleCount),
    [deviceGalleryItems, galleryVisibleCount],
  );

  const rows = useMemo<ChatRow[]>(() => {
    const result: ChatRow[] = [];
    let prevDate = '';

    for (const m of chatMessages) {
      const d = new Date(m.createdAt);
      const dateKey = Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
      if (dateKey !== prevDate) {
        const label = Number.isNaN(d.getTime())
          ? 'Сегодня'
          : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
        result.push({ type: 'date', key: `date-${dateKey || m.id}`, label });
        prevDate = dateKey;
      }
      result.push({ type: 'message', key: m.id, value: m });
    }

    return result;
  }, [chatMessages]);

  const visibleRows = useMemo<ChatRow[]>(() => {
    if (rows.length <= renderedRowsLimit) return rows;

    const start = Math.max(0, rows.length - renderedRowsLimit);
    const sliced = rows.slice(start);
    if (!sliced.length || sliced[0].type === 'date') return sliced;

    const firstMessage = sliced[0].value;
    const date = new Date(firstMessage.createdAt);
    const dateKey = Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
    const label = Number.isNaN(date.getTime())
      ? 'Сегодня'
      : date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

    return [{ type: 'date', key: `window-date-${dateKey || firstMessage.id}`, label }, ...sliced];
  }, [rows, renderedRowsLimit]);

  const visibleMessageIds = useMemo(() => {
    const ids = new Set<string>();
    visibleRows.forEach((row) => {
      if (row.type === 'message') ids.add(String(row.value.id || ''));
    });
    return ids;
  }, [visibleRows]);

  const reactions = useMemo(() => {
    const map: Record<string, { mine?: string; total: number; entries: Array<{ value: string; total: number }> }> = {};
    for (const item of chatMessages) {
      const itemId = String(item.id || '');
      if (!visibleMessageIds.has(itemId)) continue;

      const raw = (item as any)?.reactions;
      const mine = typeof raw?.mine === 'string' ? raw.mine : undefined;
      const counts = raw?.counts && typeof raw.counts === 'object' ? (raw.counts as Record<string, number>) : {};
      const entries = Object.entries(counts || {})
        .map(([value, total]) => ({
          value: String(value || '').trim(),
          total: Number(total || 0),
        }))
        .filter((entry) => entry.value !== '' && Number.isFinite(entry.total) && entry.total > 0)
        .sort((a, b) => b.total - a.total || a.value.localeCompare(b.value))
        .slice(0, 8);
      const total = entries.reduce((sum, entry) => sum + entry.total, 0);
      map[item.id] = { mine, total, entries };
    }
    return map;
  }, [chatMessages, visibleMessageIds]);

  const peerUser = useMemo(() => {
    if (!chat || chat.type === 'saved' || chat.type === 'ai') return null;
    return chat.participants?.find((p) => p.id !== me?.id) || chat.participants?.[0] || null;
  }, [chat, me?.id]);

  const groupMembersCount = useMemo(() => {
    if (!chat || chat.type !== 'group') return 0;
    return (Array.isArray(chat.participants) ? chat.participants.length : 0) + 1;
  }, [chat]);

  const title = useMemo(() => {
    if (!chat) return 'Чат';
    if (chat.type === 'saved') return 'Избранное';
    if (chat.type === 'group') return chat.name?.trim() || 'Группа';
    if (chat.name?.trim()) return chat.name.trim();
    const localDisplayName = peerUser ? getContactByUserId(peerUser.id)?.displayName : '';
    if (localDisplayName) return localDisplayName;
    return peerUser?.fullName || (peerUser?.username ? `@${peerUser.username}` : 'Чат');
  }, [chat, getContactByUserId, peerUser]);

  const avatarSrc = useMemo(() => {
    if (!chat) return peerUser?.avatar;
    if (chat.type === 'group') return chat.avatar;
    return chat.avatar || peerUser?.avatar;
  }, [chat, peerUser]);

  const subtitle = useMemo(() => {
    if (typingUsers[chatId]?.length) return 'печатает...';
    if (chat?.type === 'saved') return 'сообщения самому себе';
    if (chat?.type === 'ai') return 'AI-помощник';
    if (chat?.type === 'group') return formatGroupMembers(groupMembersCount);
    return formatPresence(peerUser?.status, peerUser?.lastSeen);
  }, [typingUsers, chatId, chat?.type, peerUser?.status, peerUser?.lastSeen, groupMembersCount]);

  const participantsById = useMemo(() => {
    const map = new Map<string, User>();
    (chat?.participants || []).forEach((participant) => {
      if (!participant?.id) return;
      map.set(participant.id, participant);
    });
    if (me?.id) {
      map.set(me.id, {
        ...me,
        isAdmin: Boolean(chat?.isAdmin),
      });
    }
    return map;
  }, [chat?.participants, chat?.isAdmin, me]);

  const handleMessageListScroll = useCallback(() => {
    const list = messageListRef.current;
    if (!list) return;
    if (rows.length <= renderedRowsLimit) return;
    if (list.scrollTop > 120) return;

    const prevHeight = list.scrollHeight;
    setRenderedRowsLimit((prev) => Math.min(rows.length, prev + MESSAGE_RENDER_STEP));
    window.requestAnimationFrame(() => {
      const updated = messageListRef.current;
      if (!updated) return;
      const delta = updated.scrollHeight - prevHeight;
      if (delta > 0) {
        updated.scrollTop += delta;
      }
    });
  }, [rows.length, renderedRowsLimit]);

  const onPickFilesLegacy = async (list: FileList | null) => {
    if (!list?.length) return;
    const arr = Array.from(list);
    setFiles((prev) => [...prev, ...arr]);
    try {
      const uploadedFiles = await uploadApi.uploadFiles(arr);
      setUploaded((prev) => [...prev, ...(Array.isArray(uploadedFiles) ? uploadedFiles : [])]);
    } catch {
      setFiles((prev) => prev.slice(0, Math.max(0, prev.length - arr.length)));
      pushSnackbar({ message: 'Не удалось загрузить фото', timeout: 2200, tone: 'error' });
    } finally {
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    }
  };

  const appendAndUploadFiles = async (arr: File[]) => {
    if (!arr.length) return;
    setFiles((prev) => [...prev, ...arr]);
    try {
      const uploadedFiles = await uploadApi.uploadFiles(arr);
      setUploaded((prev) => [...prev, ...(Array.isArray(uploadedFiles) ? uploadedFiles : [])]);
      setMediaPickerOpen(false);
    } catch {
      setFiles((prev) => prev.slice(0, Math.max(0, prev.length - arr.length)));
      pushSnackbar({ message: 'Не удалось загрузить вложение', timeout: 2200, tone: 'error' });
    }
  };

  const onPickFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    const arr = Array.from(list);
    await appendAndUploadFiles(arr);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
    if (galleryInputRef.current) {
      galleryInputRef.current.value = '';
    }
    if (cameraInputRef.current) {
      cameraInputRef.current.value = '';
    }
  };

  const fileFromWebPath = async (webPath: string, fallbackName: string): Promise<File> => {
    const response = await fetch(webPath);
    if (!response.ok) {
      throw new Error(`FETCH_${response.status}`);
    }
    const blob = await response.blob();
    const mime = String(blob.type || '');
    const extension = guessExtension(mime, mime.startsWith('video/') ? 'video' : 'image');
    const fileName = fallbackName.includes('.') ? fallbackName : `${fallbackName}.${extension}`;
    return new File([blob], fileName, { type: mime || (extension === 'mp4' ? 'video/mp4' : 'image/jpeg') });
  };

  const toDataUrl = (value: string): string => {
    const normalized = String(value || '').trim();
    if (!normalized) return '';
    if (normalized.startsWith('data:')) return normalized;
    return `data:image/jpeg;base64,${normalized}`;
  };

  const loadDeviceGallery = async () => {
    if (galleryLoadInFlightRef.current) return;
    const hadCachedItems = deviceGalleryItems.length > 0;
    if (hadCachedItems && Date.now() - galleryLastLoadedAtRef.current < GALLERY_CACHE_TTL_MS) return;

    galleryLoadInFlightRef.current = true;
    setDeviceGalleryLoading(true);
    try {
      const { Capacitor } = await import('@capacitor/core');
      const platform = Capacitor.getPlatform();
      const isSamsung = platform === 'android' && isSamsungLikeDevice();
      const inlineGalleryLimit = getInlineGalleryLimit();
      const inlineThumbSize = getInlineGalleryThumbSize();
      if (platform === 'web' || platform === 'ios') {
        setDeviceGalleryItems([]);
        return;
      }

      const mediaModule = await import('@capacitor-community/media');
      const { Media } = mediaModule;
      const normalizeFromMediaResult = (items: any[]): DeviceGalleryItem[] => {
        const next: DeviceGalleryItem[] = [];
        const seen = new Set<string>();
        for (const media of items) {
          const identifier = String(media?.identifier || '').trim();
          const data = String(media?.data || '').trim();
          const pathValue = normalizeNativePath(String(media?.path || identifier || ''));
          const previewUrl = data
            ? toDataUrl(data)
            : pathValue
              ? (
                pathValue.startsWith('http://') ||
                pathValue.startsWith('https://') ||
                pathValue.startsWith('data:')
                  ? pathValue
                  : Capacitor.convertFileSrc(pathValue)
              )
              : '';
          const key = identifier || pathValue || previewUrl;
          if (!key || !previewUrl || seen.has(key)) continue;
          seen.add(key);
          next.push({
            identifier: identifier || key,
            path: pathValue || undefined,
            data: data || undefined,
            previewUrl,
            creationDate: String(media?.creationDate || '').trim() || undefined,
          });
        }
        return next
          .sort((a, b) => new Date(b.creationDate || 0).getTime() - new Date(a.creationDate || 0).getTime())
          .slice(0, inlineGalleryLimit);
      };
      if (platform === 'android') {
        const attempts = isSamsung
          ? [
              { quantity: inlineGalleryLimit, thumbSize: inlineThumbSize, quality: 24 },
              { quantity: Math.min(12, inlineGalleryLimit), thumbSize: 84, quality: 18 },
            ]
          : [{ quantity: inlineGalleryLimit, thumbSize: inlineThumbSize, quality: 46 }];
        let fromMedia: DeviceGalleryItem[] = [];
        let lastError: unknown = null;

        for (const attempt of attempts) {
          try {
            const mediaResult = await Media.getMedias({
              quantity: attempt.quantity,
              thumbnailWidth: attempt.thumbSize,
              thumbnailHeight: attempt.thumbSize,
              thumbnailQuality: attempt.quality,
              types: 'photos',
              sort: [{ key: 'creationDate', ascending: false }],
            });
            fromMedia = normalizeFromMediaResult(Array.isArray(mediaResult?.medias) ? mediaResult.medias : []);
            if (fromMedia.length > 0) break;
            lastError = new Error('EMPTY_GALLERY_RESULT');
          } catch (error) {
            lastError = error;
          }
        }

        if (!fromMedia.length) {
          throw lastError ?? new Error('EMPTY_GALLERY_RESULT');
        }

        setDeviceGalleryError('');
        setDeviceGalleryFailureCount(0);
        setDeviceGalleryItems(fromMedia);
        setGalleryVisibleCount(getGalleryPageSize());
        galleryLastLoadedAtRef.current = Date.now();
        return;
      }

      const response = await Media.getMedias({
        quantity: inlineGalleryLimit,
        thumbnailWidth: 260,
        thumbnailHeight: 260,
        thumbnailQuality: 58,
        types: 'photos',
        sort: [{ key: 'creationDate', ascending: false }],
      });

      const normalized = normalizeFromMediaResult(Array.isArray(response?.medias) ? response.medias : []);
      setDeviceGalleryError('');
      setDeviceGalleryFailureCount(0);
      setDeviceGalleryItems(normalized);
      setGalleryVisibleCount(getGalleryPageSize());
      galleryLastLoadedAtRef.current = Date.now();
    } catch {
      if (!hadCachedItems) {
        setDeviceGalleryItems([]);
      }
      setDeviceGalleryFailureCount((prev) => prev + 1);
      setDeviceGalleryError(
        isSamsungLikeDevice()
          ? 'Встроенная галерея не ответила с первого раза. Я оставил её включённой и можно сразу повторить попытку.'
          : 'Не удалось загрузить встроенную галерею. Можно повторить попытку или открыть системную.'
      );
      if (!hadCachedItems) pushSnackbar({ message: 'Не удалось загрузить фото устройства', timeout: 2200, tone: 'error' });
    } finally {
      galleryLoadInFlightRef.current = false;
      setDeviceGalleryLoading(false);
    }
  };

  const fileFromDeviceGalleryItem = async (item: DeviceGalleryItem): Promise<File> => {
    const [{ Capacitor }, mediaModule] = await Promise.all([
      import('@capacitor/core'),
      import('@capacitor-community/media'),
    ]);
    const platform = Capacitor.getPlatform();

    let assetPath = normalizeNativePath(item.path || '');
    if (platform === 'ios' && !assetPath) {
      try {
        const { Media } = mediaModule;
        const resolved = await Media.getMediaByIdentifier({ identifier: item.identifier });
        assetPath = normalizeNativePath(String(resolved?.path || ''));
      } catch {
        // fallback to thumbnail data below
      }
    }
    if (!assetPath && platform !== 'ios') {
      assetPath = normalizeNativePath(item.identifier);
    }

    if (assetPath) {
      try {
        const localUrl =
          assetPath.startsWith('http://') ||
          assetPath.startsWith('https://') ||
          assetPath.startsWith('data:')
            ? assetPath
            : Capacitor.convertFileSrc(assetPath);
        const response = await fetch(localUrl);
        if (response.ok) {
          const blob = await response.blob();
          const mime = String(blob.type || 'image/jpeg');
          const ext = guessExtension(mime, 'image');
          return new File([blob], `gallery-${Date.now()}.${ext}`, { type: mime || 'image/jpeg' });
        }
      } catch {
        // fallback to thumbnail data below
      }
    }

    const fallbackSource = item.data ? toDataUrl(item.data) : item.previewUrl;
    if (!fallbackSource) {
      throw new Error('NO_GALLERY_SOURCE');
    }
    const response = await fetch(fallbackSource);
    const blob = await response.blob();
    const mime = String(blob.type || 'image/jpeg');
    const ext = guessExtension(mime, 'image');
    return new File([blob], `gallery-${Date.now()}.${ext}`, { type: mime || 'image/jpeg' });
  };

  const handlePickFromGalleryLegacy = async () => {
    setMediaPickerBusy(true);
    try {
      const [{ Capacitor }, cameraModule] = await Promise.all([
        import('@capacitor/core'),
        import('@capacitor/camera'),
      ]);
      const { Camera } = cameraModule;

      if (Capacitor.getPlatform() === 'web') {
        galleryInputRef.current?.click();
        return;
      }

      const picked = await Camera.pickImages({ quality: 90, limit: 20 });
      const photos = Array.isArray(picked?.photos) ? picked.photos : [];
      const filesFromGallery: File[] = [];
      const thumbs: string[] = [];

      for (let index = 0; index < photos.length; index += 1) {
        const photo = photos[index];
        const webPath = String(photo?.webPath || '').trim();
        if (!webPath) continue;
        thumbs.push(webPath);
        try {
          const file = await fileFromWebPath(webPath, `gallery-${Date.now()}-${index}`);
          filesFromGallery.push(file);
        } catch {
          // keep best-effort conversion for each selected file
        }
      }

      if (!filesFromGallery.length) {
        pushSnackbar({ message: 'Не удалось получить фото из галереи', timeout: 2200, tone: 'error' });
        return;
      }

      setMediaPickerThumbs((prev) => [...thumbs, ...prev].slice(0, 24));
      await appendAndUploadFiles(filesFromGallery);
    } catch {
      pushSnackbar({ message: 'Не удалось открыть галерею', timeout: 2200, tone: 'error' });
    } finally {
      setMediaPickerBusy(false);
    }
  };

  const handlePickFromGallery = async () => {
    setMediaPickerBusy(true);
    try {
      const [{ Capacitor }, cameraModule] = await Promise.all([
        import('@capacitor/core'),
        import('@capacitor/camera'),
      ]);
      const platform = Capacitor.getPlatform();
      if (platform === 'web') {
        galleryInputRef.current?.click();
        return;
      }
      if (platform === 'android') {
        const photos: any[] = [];
        const filesFromGallery: File[] = [];
        const thumbs: string[] = [];
        await loadDeviceGallery();
        return;

        for (let index = 0; index < photos.length; index += 1) {
          const photo = photos[index];
          const webPath = String(photo?.webPath || '').trim();
          if (!webPath) continue;
          thumbs.push(webPath);
          try {
            const file = await fileFromWebPath(webPath, `gallery-${Date.now()}-${index}`);
            filesFromGallery.push(file);
          } catch {
            // keep successfully converted files
          }
        }

        if (!filesFromGallery.length) {
          pushSnackbar({ message: 'Не удалось получить фото из галереи', timeout: 2200, tone: 'error' });
          return;
        }

        setMediaPickerThumbs((prev) => [...thumbs, ...prev].slice(0, 24));
        setMediaPickerOpen(false);
        await appendAndUploadFiles(filesFromGallery);
        return;
      }
      if (platform === 'ios') {
        const { Camera } = cameraModule;
        const picked = await Camera.pickImages({ quality: 88, limit: 20 });
        const photos = Array.isArray(picked?.photos) ? picked.photos : [];
        const filesFromGallery: File[] = [];
        const thumbs: string[] = [];

        for (let index = 0; index < photos.length; index += 1) {
          const photo = photos[index];
          const webPath = String(photo?.webPath || '').trim();
          if (!webPath) continue;
          thumbs.push(webPath);
          try {
            const file = await fileFromWebPath(webPath, `gallery-${Date.now()}-${index}`);
            filesFromGallery.push(file);
          } catch {
            // keep successfully converted files
          }
        }

        if (!filesFromGallery.length) {
          pushSnackbar({ message: 'Не удалось получить фото из галереи', timeout: 2200, tone: 'error' });
          return;
        }

        setMediaPickerThumbs((prev) => [...thumbs, ...prev].slice(0, 24));
        setMediaPickerOpen(false);
        await appendAndUploadFiles(filesFromGallery);
        return;
      }
      await loadDeviceGallery();
    } catch {
      pushSnackbar({ message: 'Не удалось открыть галерею', timeout: 2200, tone: 'error' });
    } finally {
      setMediaPickerBusy(false);
    }
  };

  const handleTakePhotoNow = async () => {
    setMediaPickerBusy(true);
    try {
      const [{ Capacitor }, cameraModule] = await Promise.all([
        import('@capacitor/core'),
        import('@capacitor/camera'),
      ]);
      const { Camera, CameraResultType, CameraSource } = cameraModule;

      if (Capacitor.getPlatform() === 'web') {
        cameraInputRef.current?.click();
        return;
      }

      setMediaPickerOpen(false);
      const photo = await Camera.getPhoto({
        source: CameraSource.Camera,
        resultType: CameraResultType.Uri,
        quality: 82,
        width: 1600,
        height: 1600,
      });
      const webPath = String(photo?.webPath || '').trim();
      let sourcePath = webPath;
      if (!sourcePath) {
        const nativePath = String((photo as any)?.path || '').trim();
        if (nativePath) {
          sourcePath = Capacitor.convertFileSrc(nativePath);
        }
      }
      if (!sourcePath) {
        pushSnackbar({ message: 'Не удалось получить снимок', timeout: 2200, tone: 'error' });
        return;
      }
      const file = await fileFromWebPath(sourcePath, `camera-${Date.now()}`);
      setMediaPickerThumbs((prev) => [sourcePath, ...prev].slice(0, 24));
      await appendAndUploadFiles([file]);
    } catch {
      pushSnackbar({ message: 'Не удалось сделать снимок', timeout: 2200, tone: 'error' });
    } finally {
      setMediaPickerBusy(false);
    }
  };

  const handlePickFromInlineGallery = async (item: DeviceGalleryItem) => {
    setMediaPickerBusy(true);
    try {
      const file = await fileFromDeviceGalleryItem(item);
      if (item.previewUrl) {
        setMediaPickerThumbs((prev) => [item.previewUrl, ...prev].slice(0, 24));
      }
      await appendAndUploadFiles([file]);
    } catch {
      pushSnackbar({ message: 'Не удалось добавить фото', timeout: 2200, tone: 'error' });
    } finally {
      setMediaPickerBusy(false);
    }
  };

  const handleGalleryScroll = () => {
    const node = galleryListRef.current;
    if (!node || deviceGalleryLoading) return;
    if (galleryVisibleCount >= deviceGalleryItems.length) return;
    const nearBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - 120;
    if (!nearBottom) return;
    setGalleryVisibleCount((prev) => Math.min(deviceGalleryItems.length, prev + getGalleryPageSize()));
  };

  const submit = async () => {
    const draftText = String(textDraftRef.current || '');
    if (editingMessage) {
      if (!canEditMessage(editingMessage)) {
        setEditingMessage(null);
        setSelectedMessage(null);
        setDraftText('');
        return;
      }
      const result = await updateMessage(chatId, editingMessage.id, draftText);
      if (!result.ok) {
        if (result.code === 'expired') {
          setEditingMessage(null);
          setSelectedMessage(null);
          setDraftText('');
          return;
        }
        pushSnackbar({ message: 'Не удалось изменить сообщение', timeout: 2200, tone: 'error' });
        return;
      }
      setDraftText('');
      setEditingMessage(null);
      setSelectedMessage(null);
      return;
    }

    if (!draftText.trim() && !uploaded.length) return;
    await sendMessage(chatId, draftText, uploaded, replyToMessage?.id);
    setDraftText('');
    setFiles([]);
    setUploaded([]);
    setReplyToMessage(null);
  };

  const removePendingAttachment = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setUploaded((prev) => prev.filter((_, i) => i !== index));
  };

  const filePreviewUrls = useMemo(
    () =>
      files.map((file) => (file.type.startsWith('image/') ? URL.createObjectURL(file) : '')),
    [files],
  );

  const mediaPickerGalleryThumbs = useMemo(() => {
    const fromPending = filePreviewUrls.filter((url) => !!url);
    const merged = [...fromPending, ...mediaPickerThumbs];
    return merged.filter((url, index, arr) => !!url && arr.indexOf(url) === index).slice(0, 24);
  }, [filePreviewUrls, mediaPickerThumbs]);

  useEffect(() => {
    if (!mediaPickerOpen) return;
    import('@capacitor/core')
      .then(({ Capacitor }) => {
        if (Capacitor.getPlatform() === 'android') {
          setDeviceGalleryError('');
          setGalleryVisibleCount(getGalleryPageSize());
          loadDeviceGallery().catch(() => null);
        }
      })
      .catch(() => null);
  }, [mediaPickerOpen]);

  useEffect(() => {
    return () => {
      filePreviewUrls.forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, [filePreviewUrls]);

  const clearReactionTimer = () => {
    if (reactionTimerRef.current !== null) {
      window.clearTimeout(reactionTimerRef.current);
      reactionTimerRef.current = null;
    }
  };

  const clearMessageGesture = () => {
    messageGestureRef.current = null;
    clearReactionTimer();
  };

  const getReplyPreviewText = (message: Pick<Message, 'text' | 'attachments'>): string => {
    const rawText = String(message.text ?? '').trim();
    if (rawText !== '') return rawText;
    if (Array.isArray(message.attachments) && message.attachments.length > 0) {
      const hasImage = message.attachments.some((item) => item?.type === 'image');
      const hasVideo = message.attachments.some((item) => item?.type === 'video');
      if (!hasImage && hasVideo) return 'Видео';
      return hasImage ? 'Фото' : 'Вложение';
    }
    return 'Сообщение';
  };

  const markMessageForReply = (message: Message) => {
    setReplyToMessage(message);
    setMsgMenuAnchor(null);
    setSelectedMessage(null);
    setEditingMessage(null);
  };

  const copySelectedMessage = async () => {
    if (!selectedMessage) return;
    const textValue = String(selectedMessage.text || '').trim();
    const fallback = (selectedMessage.attachments || []).map((item) => item.url).filter(Boolean).join('\n');
    const payload = textValue || fallback;
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(payload);
      pushSnackbar({ message: 'Скопировано', timeout: 1800 });
    } catch {
      pushSnackbar({ message: 'Не удалось скопировать', timeout: 2200, tone: 'error' });
    } finally {
      setSelectedMessage(null);
    }
  };

  const canEditMessage = (message: Message | null): boolean => {
    if (!message || message.userId !== me?.id) return false;
    const createdAtTs = parseMessageTimestamp(String(message.createdAt ?? ''));
    if (!Number.isFinite(createdAtTs)) return false;
    return Date.now() - createdAtTs <= MESSAGE_EDIT_WINDOW_MS;
  };

  const startEditSelectedMessage = () => {
    if (!selectedMessage || !canEditMessage(selectedMessage)) return;
    setEditingMessage(selectedMessage);
    setReplyToMessage(null);
    setDraftText(selectedMessage.text || '', { focus: true, cursor: String(selectedMessage.text || '').length });
    setSelectedMessage(null);
  };

  const downloadAttachmentLegacyA = async (attachment: Attachment) => {
    const url = String(attachment?.url || '').trim();
    if (!url) return;

    const fallbackFileName = sanitizeFileName(String(attachment.name || 'photo'));
    const triggerDownload = (href: string, fileName: string) => {
      const a = document.createElement('a');
      a.href = href;
      a.download = fileName;
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      a.remove();
    };

    try {
      const [{ Capacitor }, { Directory, Filesystem }] = await Promise.all([
        import('@capacitor/core'),
        import('@capacitor/filesystem'),
      ]);
      const isNative = Capacitor.getPlatform() !== 'web';
      const nativeFileName = inferFileName(attachment, url, '');
      let savedToNativeStorage = false;

      if (isNative) {
          const mediaFolder = attachment.type === 'video' ? 'Movies' : 'Pictures';
      const path = `${mediaFolder}/Vibe/${nativeFileName}`;
          const dirs = [Directory.Documents, Directory.External, Directory.Data] as const;
          try {
            await Filesystem.requestPermissions();
          } catch {
            // runtime permissions may be unavailable depending on platform
          }
          for (const directory of dirs) {
            try {
              await Filesystem.downloadFile({
                url,
                path,
                directory,
                recursive: true,
              });
              savedToNativeStorage = true;
              break;
            } catch {
              // try next directory
            }
          }

          if (!savedToNativeStorage) {
            throw new Error('NATIVE_SAVE_FAILED');
          }
        }
      if (!savedToNativeStorage) {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP_${response.status}`);
        }
        const blob = await response.blob();
        const mimeType = String(blob.type || '');
        const fileName = inferFileName(attachment, url, mimeType);
        const objectUrl = URL.createObjectURL(blob);
        triggerDownload(objectUrl, fileName);
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1200);
      }

      pushSnackbar({
        message: attachment.type === 'video' ? 'Видео сохранено' : 'Фото сохранено',
        timeout: 2200,
        tone: 'success',
      });
    } catch {
      let fallbackTriggered = false;
      let canUseBrowserFallback = true;
      try {
        const { Capacitor } = await import('@capacitor/core');
        canUseBrowserFallback = Capacitor.getPlatform() === 'web';
      } catch {
        // keep web fallback if capacitor runtime is unavailable
      }
      if (canUseBrowserFallback) {
        try {
          triggerDownload(url, fallbackFileName);
          fallbackTriggered = true;
        } catch {
          // ignore fallback errors
        }
      }
      pushSnackbar({
        message: fallbackTriggered
          ? (attachment.type === 'video' ? 'Видео сохранено' : 'Фото сохранено')
          : (attachment.type === 'video' ? 'Не удалось сохранить видео' : 'Не удалось сохранить фото'),
        timeout: fallbackTriggered ? 2200 : 2600,
        tone: fallbackTriggered ? 'success' : 'error',
      });
    }
  };

  const downloadAttachmentLegacyB = async (attachment: Attachment) => {
    const url = String(attachment?.url || '').trim();
    if (!url) return;

    const fallbackFileName = sanitizeFileName(String(attachment.name || 'attachment'));
    const triggerDownload = (href: string, fileName: string) => {
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = fileName;
      anchor.rel = 'noopener noreferrer';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    };

    const saveOnNative = async (): Promise<boolean> => {
      const [{ Capacitor }, { Directory, Filesystem }] = await Promise.all([
        import('@capacitor/core'),
        import('@capacitor/filesystem'),
      ]);
      if (Capacitor.getPlatform() === 'web') {
        return false;
      }

      try {
        await Filesystem.requestPermissions();
      } catch {
        // permissions can be unavailable on some devices
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP_${response.status}`);
      }
      const blob = await response.blob();
      const mimeType = String(blob.type || '');
      const fileName = inferFileName(attachment, url, mimeType);
      const base64 = await blobToBase64(blob);

      const folder = attachment.type === 'video' ? 'Vibe/Videos' : 'Vibe/Photos';
      const path = `${folder}/${fileName}`;
      const directories = [Directory.Documents, Directory.External, Directory.Data] as const;

      for (const directory of directories) {
        try {
          await Filesystem.writeFile({
            path,
            data: base64,
            directory,
            recursive: true,
          });
          return true;
        } catch {
          // try next location
        }
      }

      return false;
    };

    try {
      const nativeSaved = await saveOnNative();
      if (nativeSaved) {
        pushSnackbar({
          message: attachment.type === 'video' ? 'Видео сохранено' : 'Фото сохранено',
          timeout: 2200,
          tone: 'success',
        });
        return;
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP_${response.status}`);
      }
      const blob = await response.blob();
      const fileName = inferFileName(attachment, url, String(blob.type || ''));
      const objectUrl = URL.createObjectURL(blob);
      triggerDownload(objectUrl, fileName);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1200);
      pushSnackbar({
        message: attachment.type === 'video' ? 'Видео сохранено' : 'Фото сохранено',
        timeout: 2200,
        tone: 'success',
      });
    } catch {
      pushSnackbar({
        message: attachment.type === 'video' ? 'Не удалось сохранить видео' : 'Не удалось сохранить фото',
        timeout: 2600,
        tone: 'error',
      });
    }
  };

  const downloadAttachment = async (attachment: Attachment) => {
    const url = String(attachment?.url || '').trim();
    if (!url) return;
    {
      const notifySaved = () =>
        pushSnackbar({
          message: attachment.type === 'video' ? 'Видео сохранено' : 'Фото сохранено',
          timeout: 2200,
          tone: 'success',
        });

      const notifyError = () =>
        pushSnackbar({
          message: attachment.type === 'video' ? 'Не удалось сохранить видео' : 'Не удалось сохранить фото',
          timeout: 2600,
          tone: 'error',
        });

      const resolveAndroidAlbumIdentifier = async (Media: any): Promise<string | undefined> => {
      const targetName = 'Vibe';
        const findExisting = async (): Promise<string | undefined> => {
          try {
            const albums = await Media.getAlbums();
            const list = Array.isArray(albums?.albums) ? albums.albums : [];
            const found = list.find(
              (album: any) =>
                String(album?.name || '').trim().toLowerCase() === targetName.toLowerCase() &&
                String(album?.identifier || '').trim() !== '',
            );
            return found ? String(found.identifier) : undefined;
          } catch {
            return undefined;
          }
        };

        const existing = await findExisting();
        if (existing) return existing;

        try {
          await Media.createAlbum({ name: targetName });
        } catch {
          // album may already exist
        }

        const created = await findExisting();
        if (created) return created;

        try {
          const pathResult = await Media.getAlbumsPath();
          const basePath = String(pathResult?.path || '').replace(/[\\/]+$/, '');
          if (!basePath) return undefined;
          return `${basePath}/${targetName}`;
        } catch {
          return undefined;
        }
      };

      const saveInNativeGallery = async (): Promise<boolean> => {
        const [{ Capacitor }, mediaModule, filesystemModule] = await Promise.all([
          import('@capacitor/core'),
          import('@capacitor-community/media'),
          import('@capacitor/filesystem'),
        ]);
        const platform = Capacitor.getPlatform();
        if (platform === 'web') {
          return false;
        }

        const { Media } = mediaModule;
        const { Filesystem, Directory } = filesystemModule;
        const albumIdentifier = platform === 'android' ? await resolveAndroidAlbumIdentifier(Media) : undefined;
        try {
          const maybeRequest = (Media as any).requestPermissions;
          if (typeof maybeRequest === 'function') {
            await maybeRequest.call(Media);
          }
        } catch {
          // permission request is best effort
        }
        try {
          if (attachment.type === 'video') {
            await Media.saveVideo(albumIdentifier ? { path: url, albumIdentifier } : { path: url });
          } else {
            await Media.savePhoto(albumIdentifier ? { path: url, albumIdentifier } : { path: url });
          }
          return true;
        } catch {
          // fallback to cached local save below
        }
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP_${response.status}`);
        }
        const blob = await response.blob();
        const mime = String(blob.type || (attachment.type === 'video' ? 'video/mp4' : 'image/jpeg'));
        const fileName = inferFileName(attachment, url, mime);
      const localPath = `vibe-downloads/${Date.now()}-${sanitizeFileName(fileName)}`;
        const base64 = await blobToBase64(blob);
        await Filesystem.writeFile({
          path: localPath,
          data: base64,
          directory: Directory.Cache,
          recursive: true,
        });
        const uriResult = await Filesystem.getUri({ path: localPath, directory: Directory.Cache });
        const uri = String(uriResult?.uri || '').trim();
        if (!uri) {
          throw new Error('LOCAL_PATH_EMPTY');
        }
        if (attachment.type === 'video') {
          await Media.saveVideo(albumIdentifier ? { path: uri, albumIdentifier } : { path: uri });
        } else {
          await Media.savePhoto(albumIdentifier ? { path: uri, albumIdentifier } : { path: uri });
        }
        return true;
      };

      try {
        const nativeSaved = await saveInNativeGallery();
        if (nativeSaved) {
          notifySaved();
          return;
        }
      } catch {
        // continue to blob download fallback
      }

      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP_${response.status}`);
        }
        const blob = await response.blob();
        const fileName = inferFileName(attachment, url, String(blob.type || ''));
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = fileName;
        anchor.rel = 'noopener noreferrer';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1200);
        notifySaved();
      } catch {
        notifyError();
      }
      return;
    }

    const showSaved = () =>
      pushSnackbar({
        message: attachment.type === 'video' ? 'Видео сохранено' : 'Фото сохранено',
        timeout: 2200,
        tone: 'success',
      });

    const showError = () =>
      pushSnackbar({
        message: attachment.type === 'video' ? 'Не удалось сохранить видео' : 'Не удалось сохранить фото',
        timeout: 2600,
        tone: 'error',
      });

    try {
      const [{ Capacitor }, mediaModule] = await Promise.all([
        import('@capacitor/core'),
        import('@capacitor-community/media'),
      ]);
      const platform = Capacitor.getPlatform();
      if (platform !== 'web') {
        const { Media } = mediaModule;
        if (attachment.type === 'video') {
          await Media.saveVideo({ path: url });
        } else {
          await Media.savePhoto({ path: url });
        }
        showSaved();
        return;
      }
    } catch {
      // fallback below
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP_${response.status}`);
      }
      const blob = await response.blob();
      const fileName = inferFileName(attachment, url, String(blob.type || ''));
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = fileName;
      anchor.rel = 'noopener noreferrer';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1200);
      showSaved();
    } catch {
      showError();
    }
  };

  const downloadAttachmentStable = async (attachment: Attachment) => {
    const url = String(attachment?.url || '').trim();
    if (!url) return;

    const notifySaved = () =>
      pushSnackbar({
        message: attachment.type === 'video' ? 'Видео сохранено' : 'Фото сохранено',
        timeout: 2200,
        tone: 'success',
      });

    const notifyError = () =>
      pushSnackbar({
        message: attachment.type === 'video' ? 'Не удалось сохранить видео' : 'Не удалось сохранить фото',
        timeout: 2600,
        tone: 'error',
      });

    const downloadInBrowser = async () => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP_${response.status}`);
      }
      const blob = await response.blob();
      const fileName = inferFileName(attachment, url, String(blob.type || ''));
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = fileName;
      anchor.rel = 'noopener noreferrer';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1200);
    };

    const saveInNativeGallery = async (): Promise<boolean> => {
      const [{ Capacitor }, mediaModule, filesystemModule, fileTransferModule] = await Promise.all([
        import('@capacitor/core'),
        import('@capacitor-community/media'),
        import('@capacitor/filesystem'),
        import('@capacitor/file-transfer'),
      ]);
      const platform = Capacitor.getPlatform();
      if (platform === 'web') return false;

      const { Media } = mediaModule;
      const { Filesystem, Directory } = filesystemModule;
      const { FileTransfer } = fileTransferModule;

      try {
        const maybeRequest = (Media as any).requestPermissions;
        if (typeof maybeRequest === 'function') {
          await maybeRequest.call(Media);
        }
      } catch {
        // best effort permission request
      }

      const mimeHint = attachment.type === 'video' ? 'video/mp4' : 'image/jpeg';
      const fileName = sanitizeFileName(inferFileName(attachment, url, mimeHint));
      const filePath = `vibe-downloads/${Date.now()}-${fileName}`;
      const directories = [Directory.Documents, Directory.Data, Directory.Cache] as Array<unknown>;
      const externalDir = (Directory as any).ExternalStorage ?? (Directory as any).External;
      if (externalDir) directories.unshift(externalDir);

      const saveToGallery = async (path: string) => {
        if (attachment.type === 'video') {
          await Media.saveVideo({ path });
          return;
        }
        await Media.savePhoto({ path });
      };

      for (const directory of directories) {
        try {
          await Filesystem.mkdir({
          path: 'vibe-downloads',
            directory: directory as any,
            recursive: true,
          });
        } catch {
          // ignore mkdir failure, next step may still work
        }

        try {
          const uriInfo = await Filesystem.getUri({
            path: filePath,
            directory: directory as any,
          });
          const destinationUri = String(uriInfo?.uri || '').trim();
          if (!destinationUri) continue;
          await (FileTransfer as any).downloadFile({
            url,
            path: destinationUri,
            progress: false,
          });
          await saveToGallery(destinationUri);
          return true;
        } catch {
          // try next directory
        }
      }

      for (const directory of directories) {
        try {
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`HTTP_${response.status}`);
          }
          const blob = await response.blob();
          const base64 = await blobToBase64(blob);
          await Filesystem.writeFile({
            path: filePath,
            data: base64,
            directory: directory as any,
            recursive: true,
          });
          const uriInfo = await Filesystem.getUri({
            path: filePath,
            directory: directory as any,
          });
          const localUri = String(uriInfo?.uri || '').trim();
          if (!localUri) continue;
          await saveToGallery(localUri);
          return true;
        } catch {
          // try next directory
        }
      }

      return false;
    };

    try {
      const { Capacitor } = await import('@capacitor/core');
      const platform = Capacitor.getPlatform();

      if (platform !== 'web') {
        const nativeSaved = await saveInNativeGallery();
        if (!nativeSaved) {
          notifyError();
          return;
        }
        notifySaved();
        return;
      }

      await downloadInBrowser();
      notifySaved();
    } catch {
      notifyError();
    }
  };

  const handleRootPointerDown = (event: any) => {
    if (event.pointerType === 'mouse') {
      edgeSwipeRef.current.active = false;
      return;
    }
    if (event.clientX <= 24) {
      edgeSwipeRef.current = {
        active: true,
        startX: event.clientX,
        startY: event.clientY,
        swiped: false,
      };
      return;
    }
    edgeSwipeRef.current.active = false;
  };

  const handleRootPointerMove = (event: any) => {
    const state = edgeSwipeRef.current;
    if (!state.active || state.swiped) return;

    const dx = event.clientX - state.startX;
    const dy = Math.abs(event.clientY - state.startY);
    if (dy > 52 || dx < -8) {
      state.active = false;
      return;
    }

    if (dx > 88 && dy < 42) {
      state.swiped = true;
      state.active = false;
      navigate('/chats');
    }
  };

  const resetRootSwipe = () => {
    edgeSwipeRef.current.active = false;
    edgeSwipeRef.current.swiped = false;
  };

  const handleMessagePointerDown = (event: any, message: Message) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.pointerType !== 'mouse') event.preventDefault();

    const target = event.currentTarget as HTMLElement;
    messageGestureRef.current = {
      messageId: message.id,
      startX: event.clientX,
      startY: event.clientY,
      swipeDone: false,
    };

    clearReactionTimer();
    reactionTimerRef.current = window.setTimeout(() => {
      const gesture = messageGestureRef.current;
      if (!gesture || gesture.messageId !== message.id || gesture.swipeDone) return;
      openReactionPicker(message, target);
    }, 450);
  };

  const handleMessagePointerMove = (event: any, message: Message) => {
    const state = messageGestureRef.current;
    if (!state || state.messageId !== message.id || state.swipeDone) return;
    if (state.startX <= 26) return;

    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;

    if (Math.abs(dx) > 12 || Math.abs(dy) > 10) {
      clearReactionTimer();
    }

    if (dx > 72 && Math.abs(dy) < 34) {
      state.swipeDone = true;
      clearReactionTimer();
      setReplyToMessage(message);
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(10);
      }
    }
  };

  useEffect(() => () => clearMessageGesture(), []);
  useEffect(() => () => clearReactionHoldTimer(), []);

  const openProfileFromHeader = () => {
    if (chat?.type === 'group') {
      navigate(`/group/${chatId}`);
      return;
    }
    if (!peerUser) return;
    navigate(`/user/${peerUser.id}?chatId=${encodeURIComponent(chatId)}`);
  };

  const openReactionPicker = (message: Message, anchor: HTMLElement) => {
    setSelectedMessage(message);
    setReactionMessageId(message.id);
    setReactionAnchor(anchor);
  };

  const closeReactionPicker = (options?: { keepSelected?: boolean }) => {
    setReactionAnchor(null);
    setReactionMessageId(null);
    if (!options?.keepSelected) {
      setSelectedMessage(null);
    }
  };

  const applyReaction = async (value: QuickReaction) => {
    if (!reactionMessageId) return;
    const currentMine = reactions[reactionMessageId]?.mine;
    try {
      if (currentMine === value) {
        await messageApi.removeReaction(reactionMessageId);
      } else {
        await messageApi.setReaction(reactionMessageId, value);
      }
      await loadMessages(chatId);
    } catch {
      pushSnackbar({ message: 'Не удалось обновить реакцию', timeout: 2200 });
    } finally {
      closeReactionPicker();
    }
  };

  const openMessageActionsFromReactions = () => {
    if (!selectedMessage || !reactionAnchor) return;
    setMsgMenuAnchor(reactionAnchor);
    closeReactionPicker({ keepSelected: true });
  };

  function clearReactionHoldTimer() {
    if (reactionHoldTimerRef.current !== null) {
      window.clearTimeout(reactionHoldTimerRef.current);
      reactionHoldTimerRef.current = null;
    }
  }

  const openReactionViewer = async (messageId: string) => {
    setReactionViewerOpen(true);
    setReactionViewerLoading(true);
    setReactionViewerMessageId(messageId);
    try {
      const response = await messageApi.getReactions(messageId, REACTION_VIEWER_LIMIT);
      const list = Array.isArray(response?.items) ? response.items : [];
      const normalized: ReactionViewerItem[] = list
        .map((item: any) => ({
          userId: String(item?.userId || item?.user_id || item?.user?.id || '').trim(),
          reaction: String(item?.reaction || '').trim(),
          reactedAt: item?.reactedAt || item?.reacted_at || undefined,
          user: {
            id: String(item?.user?.id || item?.userId || item?.user_id || '').trim(),
            username: String(item?.user?.username || '').trim() || undefined,
            fullName: String(item?.user?.fullName || item?.user?.full_name || '').trim() || undefined,
            avatar: String(item?.user?.avatar || '').trim() || undefined,
          },
        }))
        .filter((item: ReactionViewerItem) => item.userId !== '' && item.reaction !== '')
        .slice(0, REACTION_VIEWER_LIMIT);
      setReactionViewerItems(normalized);
    } catch {
      setReactionViewerItems([]);
      pushSnackbar({ message: 'Не удалось загрузить реакции', timeout: 2200, tone: 'error' });
    } finally {
      setReactionViewerLoading(false);
    }
  };

  const closeReactionViewer = () => {
    setReactionViewerOpen(false);
    setReactionViewerLoading(false);
    setReactionViewerMessageId(null);
    setReactionViewerItems([]);
  };

  const startReactionViewerHold = (messageId: string) => {
    clearReactionHoldTimer();
    reactionHoldTimerRef.current = window.setTimeout(() => {
      void openReactionViewer(messageId);
    }, 280);
  };

  const insertEmoji = (value: string) => {
    const emoji = String(value || '').trim();
    if (!emoji) return;

    const input = messageInputRef.current;
    const previous = String(textDraftRef.current || '');
    if (!input) {
      setDraftText(`${previous}${emoji}`);
    } else {
      const start = Number.isFinite(input.selectionStart ?? NaN) ? (input.selectionStart as number) : previous.length;
      const end = Number.isFinite(input.selectionEnd ?? NaN) ? (input.selectionEnd as number) : start;
      const next = `${previous.slice(0, start)}${emoji}${previous.slice(end)}`;
      setDraftText(next, { syncInput: true, cursor: start + emoji.length, focus: true });
    }

    setRecentEmojis((prev) => [emoji, ...prev.filter((item) => item !== emoji)].slice(0, 18));
    window.requestAnimationFrame(() => {
      const input = messageInputRef.current;
      if (!input) return;
      input.focus();
    });
  };

  const handleClearChatAction = async () => {
    const isAiChat = chat?.type === 'ai';
    const confirmed = window.confirm(
      isAiChat ? 'Очистить AI-чат у всех пользователей?' : 'Очистить историю этого чата?',
    );
    if (!confirmed) return;
    try {
      await clearChat(chatId);
      pushSnackbar({
        message: isAiChat ? 'AI-чат очищен у всех' : 'Чат очищен',
        timeout: 2200,
        tone: 'success',
      });
    } catch {
      pushSnackbar({
        message: isAiChat ? 'Не удалось очистить AI-чат' : 'Не удалось очистить чат',
        timeout: 2400,
        tone: 'error',
      });
    } finally {
      setMenuAnchor(null);
    }
  };

  const openMentionProfile = async (username: string) => {
    const normalized = username.replace(/^@/, '').trim().toLowerCase();
    if (!normalized) return;

    const cachedId = mentionCacheRef.current[normalized];
    if (cachedId) {
      navigate(`/user/${cachedId}?chatId=${encodeURIComponent(chatId)}`);
      return;
    }

    try {
      const profile = await userApi.getByUsername(normalized);
      const targetId = String(profile?.id ?? '').trim();
      if (!targetId) {
        throw new Error('User not found');
      }
      mentionCacheRef.current[normalized] = targetId;
      navigate(`/user/${targetId}?chatId=${encodeURIComponent(chatId)}`);
    } catch {
      pushSnackbar({ message: `Пользователь @${normalized} не найден`, timeout: 2200 });
    }
  };

  const splitUrlTail = (rawUrl: string): { url: string; tail: string } => {
    let url = String(rawUrl || '').trim();
    let tail = '';

    while (url.length > 0) {
      const lastChar = url[url.length - 1];
      if (!/[),.!?;:]/.test(lastChar)) break;

      if (lastChar === ')') {
        const openCount = (url.match(/\(/g) || []).length;
        const closeCount = (url.match(/\)/g) || []).length;
        if (closeCount <= openCount) break;
      }

      tail = `${lastChar}${tail}`;
      url = url.slice(0, -1);
    }

    return { url, tail };
  };

  const openExternalUrl = (rawUrl: string) => {
    const url = String(rawUrl || '').trim();
    if (!/^https?:\/\//i.test(url)) return;
    try {
      const popup = window.open(url, '_blank', 'noopener,noreferrer');
      if (!popup) {
        window.location.href = url;
      }
    } catch {
      window.location.href = url;
    }
  };

  const getMessagePreviewText = (message: Pick<Message, 'text' | 'attachments'>): string => {
    const rawText = String(message.text ?? '').trim();
    if (rawText !== '') return rawText;
    if (Array.isArray(message.attachments) && message.attachments.length > 0) {
      const hasImage = message.attachments.some((item) => item?.type === 'image');
      const hasVideo = message.attachments.some((item) => item?.type === 'video');
      if (!hasImage && hasVideo) return 'Видео';
      return hasImage ? 'Фото' : 'Вложение';
    }
    return 'Сообщение';
  };

  const scrollToMessageById = (messageId: string) => {
    const normalizedId = String(messageId || '').trim();
    if (!normalizedId) return;
    const tryScroll = (): boolean => {
      const root = messageListRef.current;
      if (!root) return false;
      const target = root.querySelector(`[data-message-id="${normalizedId}"]`) as HTMLElement | null;
      if (!target) return false;
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return true;
    };

    if (tryScroll()) return;
    const rowIndex = rows.findIndex((row) => row.type === 'message' && String(row.value.id || '') === normalizedId);
    if (rowIndex < 0) return;
    const needed = Math.max(MESSAGE_RENDER_BATCH, rows.length - rowIndex + 8);
    setRenderedRowsLimit((prev) => Math.max(prev, Math.min(rows.length, needed)));
    window.requestAnimationFrame(() => {
      if (tryScroll()) return;
      window.setTimeout(() => {
        void tryScroll();
      }, 90);
    });
  };

  const togglePinForSelectedMessage = async () => {
    if (!selectedMessage) return;
    const messageId = String(selectedMessage.id || '').trim();
    if (!messageId) return;

    try {
      if (pinnedMessageIds.has(messageId)) {
        await messageApi.unpinInChat(chatId, messageId);
        pushSnackbar({ message: 'Сообщение откреплено', timeout: 1800, tone: 'success' });
      } else {
        await messageApi.pinInChat(chatId, messageId);
        pushSnackbar({ message: 'Сообщение закреплено', timeout: 1800, tone: 'success' });
      }
      await loadPinnedMessages(chatId);
    } catch (error: any) {
      const status = Number(error?.response?.status || 0);
      pushSnackbar({
        message: status === 409 ? 'Можно закрепить только 3 сообщения' : 'Не удалось изменить закреп',
        timeout: 2400,
        tone: 'error',
      });
    } finally {
      setMsgMenuAnchor(null);
      setSelectedMessage(null);
    }
  };

  const renderMessageText = (value: string) => {
    MESSAGE_LINK_OR_MENTION_RE.lastIndex = 0;
    const chunks: any[] = [];
    let cursor = 0;
    let match: RegExpExecArray | null = null;

    while ((match = MESSAGE_LINK_OR_MENTION_RE.exec(value)) !== null) {
      const fullMatch = String(match[0] || '');
      const urlToken = String(match[1] || '').trim();
      const username = String(match[2] || '').trim();
      const start = match.index;
      const end = start + fullMatch.length;

      if (start > cursor) {
        chunks.push(value.slice(cursor, start));
      }

      if (urlToken) {
        const { url, tail } = splitUrlTail(urlToken);
        if (/^https?:\/\//i.test(url)) {
          chunks.push(
            <Box
              component="a"
              href={url}
              key={`link-${start}-${url}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                openExternalUrl(url);
              }}
              sx={{
                color: isDark ? '#8CC5FF' : '#0A8D4F',
                fontWeight: 700,
                textDecoration: 'underline',
                textDecorationThickness: '0.08em',
                textUnderlineOffset: '0.12em',
                overflowWrap: 'anywhere',
                wordBreak: 'break-word',
              }}
            >
              {url}
            </Box>,
          );
          if (tail) chunks.push(tail);
        } else {
          chunks.push(fullMatch);
        }
      } else if (username) {
        chunks.push(
          <Box
            component="span"
            key={`mention-${start}-${username}`}
            onClick={(event) => {
              event.stopPropagation();
              void openMentionProfile(username);
            }}
            sx={{
              color: isDark ? '#88C0FF' : '#0A8D4F',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {`@${username}`}
          </Box>,
        );
      } else {
        chunks.push(fullMatch);
      }

      cursor = end;
    }

    if (cursor < value.length) {
      chunks.push(value.slice(cursor));
    }

    return chunks;
  };

  if (!chat) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography>Чат не найден</Typography>
        <Button variant="outlined" sx={{ mt: 2 }} onClick={() => navigate('/chats')}>Назад</Button>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        position: 'relative',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        bgcolor: 'transparent',
        color: isDark ? '#EAF1FF' : 'text.primary',
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: isDark
            ? 'radial-gradient(circle at 16% 8%, rgba(100,180,255,0.14), transparent 30%), radial-gradient(circle at 88% 22%, rgba(123,226,196,0.12), transparent 24%)'
            : 'radial-gradient(circle at 16% 8%, rgba(34,154,104,0.12), transparent 30%), radial-gradient(circle at 88% 22%, rgba(77,124,254,0.10), transparent 24%)',
        },
        '&::after': {
          content: '""',
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: isDark
            ? 'linear-gradient(180deg, rgba(8,17,29,0.22) 0%, rgba(8,17,29,0.04) 28%, rgba(8,17,29,0.26) 100%)'
            : 'linear-gradient(180deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.06) 28%, rgba(240,246,242,0.3) 100%)',
        },
      }}
      onPointerDown={handleRootPointerDown}
      onPointerMove={handleRootPointerMove}
      onPointerUp={resetRootSwipe}
      onPointerCancel={resetRootSwipe}
      onPointerLeave={resetRootSwipe}
    >
      <Box sx={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 1, pl: 'max(env(safe-area-inset-left), 8px)', pr: 'max(env(safe-area-inset-right), 8px)', pt: 'max(env(safe-area-inset-top), 12px)', pb: 1, borderBottom: '1px solid', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(21,53,40,0.08)', bgcolor: isDark ? 'rgba(20,33,52,0.72)' : 'rgba(255,255,255,0.7)', backdropFilter: 'blur(16px)' }}>
        <IconButton onClick={() => navigate('/chats')} sx={{ color: isDark ? '#AFC1D9' : '#6F7D8A' }}><ArrowBackIcon /></IconButton>

        <ButtonBase
          onClick={openProfileFromHeader}
          disabled={chat.type === 'saved' || chat.type === 'ai'}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            borderRadius: 2,
            px: 0.5,
            py: 0.25,
            flex: 1,
            justifyContent: 'flex-start',
            textAlign: 'left',
          }}
        >
          <Avatar src={avatarSrc} sx={{ width: 46, height: 46, bgcolor: chat.type === 'saved' ? '#D6A21B' : '#5E5BF0' }}>
            {chat.type === 'saved' ? <BookmarkRoundedIcon sx={{ fontSize: 27 }} /> : title.slice(0, 1).toUpperCase()}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700, fontSize: 18 }} noWrap>{title}</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              {chat.type === 'private' && peerUser?.status === 'online' && !typingUsers[chatId]?.length && (
                <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: '#32C26A', flexShrink: 0 }} />
              )}
              <Typography variant="caption" color={isDark ? '#B7C8DD' : 'text.secondary'} noWrap>
                {subtitle}
              </Typography>
            </Box>
          </Box>
        </ButtonBase>

        <IconButton onClick={(e) => setMenuAnchor(e.currentTarget)} sx={{ color: isDark ? '#AFC1D9' : '#6F7D8A' }}><MoreVertIcon /></IconButton>
      </Box>

      <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
        <MenuItem onClick={() => { pinChat(chatId); setMenuAnchor(null); }}>{chat.pinned ? 'Открепить' : 'Закрепить'}</MenuItem>
        <MenuItem onClick={() => { muteChat(chatId); setMenuAnchor(null); }}>{chat.muted ? 'Включить звук' : 'Выключить звук'}</MenuItem>
        {chat.type === 'saved' && (
          <MenuItem
            onClick={() => {
              const willHide = !savedChatHidden;
              setSavedChatHidden(willHide);
              pushSnackbar({
                message: willHide ? 'Избранное скрыто из списка чатов' : 'Избранное возвращено в список чатов',
                timeout: 1800,
              });
              setMenuAnchor(null);
            }}
          >
            {savedChatHidden ? 'Вернуть в список чатов' : 'Скрыть из списка чатов'}
          </MenuItem>
        )}
        <MenuItem onClick={() => { chat.archived ? unarchiveChat(chatId) : archiveChat(chatId); setMenuAnchor(null); }}>{chat.archived ? 'Вернуть из архива' : 'В архив'}</MenuItem>
        <MenuItem
          sx={chat.type === 'ai' ? { color: 'warning.main' } : undefined}
          onClick={() => { void handleClearChatAction(); }}
        >
          {chat.type === 'ai' ? 'Очистить AI-чат (у всех)' : 'Очистить чат'}
        </MenuItem>
        <MenuItem onClick={() => { deleteChat(chatId); setMenuAnchor(null); navigate('/chats'); }} sx={{ color: 'error.main' }}>Удалить чат</MenuItem>
      </Menu>

      <Menu anchorEl={msgMenuAnchor} open={!!msgMenuAnchor} onClose={() => { setMsgMenuAnchor(null); setSelectedMessage(null); }}>
        <MenuItem
          onClick={() => {
            if (selectedMessage) {
              markMessageForReply(selectedMessage);
            } else {
              setMsgMenuAnchor(null);
              setSelectedMessage(null);
            }
          }}
        >
          Отметить для ответа
        </MenuItem>
        <MenuItem
          onClick={() => {
            void copySelectedMessage();
            setMsgMenuAnchor(null);
          }}
        >
          Копировать
        </MenuItem>
        <MenuItem
          disabled={!canEditMessage(selectedMessage)}
          onClick={() => {
            startEditSelectedMessage();
            setMsgMenuAnchor(null);
          }}
        >
          Изменить
        </MenuItem>
        <MenuItem
          disabled={!selectedMessage || (!selectedMessagePinned && pinnedMessages.length >= 3)}
          onClick={() => {
            void togglePinForSelectedMessage();
          }}
        >
          {selectedMessagePinned ? 'Открепить сообщение' : 'Закрепить сообщение'}
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (selectedMessage) deleteMessage(chatId, selectedMessage.id, false);
            setMsgMenuAnchor(null);
            setSelectedMessage(null);
          }}
        >
          Удалить у себя
        </MenuItem>
        <MenuItem
          disabled={!selectedMessage || selectedMessage.userId !== me?.id}
          onClick={() => {
            if (selectedMessage) deleteMessage(chatId, selectedMessage.id, true);
            setMsgMenuAnchor(null);
            setSelectedMessage(null);
          }}
        >
          Удалить у всех
        </MenuItem>
      </Menu>

      <Popover
        open={!!reactionAnchor}
        anchorEl={reactionAnchor}
        onClose={closeReactionPicker}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        slotProps={{
          paper: {
            sx: {
              borderRadius: 99,
              px: 0.6,
              py: 0.4,
              bgcolor: isDark ? 'rgba(19,33,52,0.96)' : 'rgba(255,255,255,0.96)',
              border: '1px solid',
              borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)',
            },
          },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, justifyContent: 'center' }}>
          {QUICK_REACTIONS.map((item) => (
            <ButtonBase
              key={item}
              onClick={() => { void applyReaction(item); }}
              sx={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                fontSize: 20,
                '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)' },
              }}
            >
              {item}
            </ButtonBase>
          ))}
          <IconButton
            size="small"
            onClick={openMessageActionsFromReactions}
            aria-label="Действия"
            sx={{
              width: 32,
              height: 32,
              color: isDark ? '#D6E4F4' : '#4B5D70',
              '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)' },
            }}
          >
            <MoreVertIcon sx={{ fontSize: 20 }} />
          </IconButton>
        </Box>
      </Popover>

      <Dialog
        open={!!previewAttachment}
        onClose={() => setPreviewAttachment(null)}
        fullWidth
        maxWidth="md"
      >
        <Box
          sx={{
            bgcolor: '#000',
            minHeight: 240,
            maxHeight: '85dvh',
            display: 'grid',
            placeItems: 'center',
            position: 'relative',
          }}
        >
          {previewAttachment?.type === 'video' ? (
            <Box
              component="video"
              src={String(previewAttachment?.url || '')}
              controls
              autoPlay
              playsInline
              sx={{ width: '100%', maxHeight: '85dvh', bgcolor: '#000' }}
            />
          ) : (
            <Box
              component="img"
              src={String(previewAttachment?.url || '')}
              alt={previewAttachment?.name || 'photo'}
              sx={{ width: '100%', maxHeight: '85dvh', objectFit: 'contain' }}
            />
          )}
          <IconButton
            onClick={() => setPreviewAttachment(null)}
            sx={{
              position: 'absolute',
              top: 8,
              right: 8,
              color: '#fff',
              bgcolor: 'rgba(0,0,0,0.45)',
              '&:hover': { bgcolor: 'rgba(0,0,0,0.62)' },
            }}
          >
            <CloseRoundedIcon />
          </IconButton>
        </Box>
      </Dialog>

      <Drawer
        anchor="bottom"
        open={reactionViewerOpen}
        onClose={closeReactionViewer}
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
          <Typography sx={{ fontWeight: 700, mb: 1 }}>Реакции</Typography>
          {reactionViewerLoading ? (
            <Box sx={{ py: 3, display: 'grid', placeItems: 'center' }}>
              <CircularProgress size={22} />
            </Box>
          ) : reactionViewerItems.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 1.5 }}>
              Пока нет реакций для этого сообщения.
            </Typography>
          ) : (
            <Box sx={{ maxHeight: '55dvh', overflowY: 'auto', display: 'grid', gap: 0.75 }}>
              {reactionViewerItems.map((item, index) => (
                <Box
                  key={`${item.userId}-${item.reaction}-${index}`}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    p: 0.8,
                    borderRadius: 2,
                    bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                  }}
                >
                  <Avatar src={item.user.avatar} sx={{ width: 34, height: 34 }}>
                    {(item.user.fullName || item.user.username || 'U').slice(0, 1).toUpperCase()}
                  </Avatar>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Typography noWrap sx={{ fontWeight: 700, fontSize: 14 }}>
                      {item.user.fullName || (item.user.username ? `@${item.user.username}` : 'Пользователь')}
                    </Typography>
                    <Typography variant="caption" sx={{ opacity: 0.76 }}>
                      {item.reactedAt
                        ? new Date(item.reactedAt).toLocaleString('ru-RU', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'Недавно'}
                    </Typography>
                  </Box>
                  <Typography sx={{ fontSize: 22, lineHeight: 1 }}>{item.reaction}</Typography>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Drawer>

      {!!pinnedMessages.length && (
        <Box
          sx={{
            px: 1.1,
            py: 0.65,
            borderBottom: '1px solid',
            borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
            bgcolor: isDark ? 'rgba(20,33,52,0.92)' : 'rgba(248,251,255,0.96)',
            display: 'grid',
            gap: 0.45,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.55 }}>
            <PushPinRoundedIcon sx={{ fontSize: 15, color: isDark ? '#8FC7FF' : '#0A8D4F' }} />
            <Typography variant="caption" sx={{ fontWeight: 700 }}>
              Закрепы
            </Typography>
          </Box>
          {pinnedMessages.map((item) => {
            const itemId = String(item?.id || '').trim();
            if (!itemId) return null;
            const preview = getMessagePreviewText(item);
            return (
              <Box key={`pinned-${itemId}`} sx={{ display: 'flex', alignItems: 'center', gap: 0.45 }}>
                <ButtonBase
                  onClick={() => scrollToMessageById(itemId)}
                  sx={{
                    flex: 1,
                    textAlign: 'left',
                    justifyContent: 'flex-start',
                    px: 0.75,
                    py: 0.42,
                    borderRadius: 1.5,
                    border: '1px solid',
                    borderColor: isDark ? 'rgba(143,199,255,0.28)' : 'rgba(10,141,79,0.2)',
                    bgcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.86)',
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      display: '-webkit-box',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      WebkitLineClamp: 1,
                      WebkitBoxOrient: 'vertical',
                      lineHeight: 1.2,
                      overflowWrap: 'anywhere',
                    }}
                  >
                    {preview}
                  </Typography>
                </ButtonBase>
                <IconButton
                  size="small"
                  onClick={(event) => {
                    event.stopPropagation();
                    void messageApi
                      .unpinInChat(chatId, itemId)
                      .then(() => {
                        pushSnackbar({ message: 'Сообщение откреплено', timeout: 1800, tone: 'success' });
                        return loadPinnedMessages(chatId);
                      })
                      .catch((error: any) => {
                        const status = Number(error?.response?.status || 0);
                        pushSnackbar({
                          message: status === 404 ? 'Сообщение не найдено' : 'Не удалось открепить сообщение',
                          timeout: 2200,
                          tone: 'error',
                        });
                      });
                  }}
                  sx={{ color: isDark ? '#AFC1D9' : '#6F7D8A' }}
                >
                  <CloseRoundedIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Box>
            );
          })}
        </Box>
      )}

      <Box
        ref={messageListRef}
        onScroll={handleMessageListScroll}
        sx={{
          position: 'relative',
          zIndex: 1,
          flex: 1,
          overflow: 'auto',
          p: 1.2,
          bgcolor: 'transparent',
          backgroundImage: isDark
            ? 'radial-gradient(circle at 18% 0%, rgba(100,180,255,0.06), transparent 24%), radial-gradient(circle at 82% 12%, rgba(123,226,196,0.05), transparent 18%)'
            : 'radial-gradient(circle at 18% 0%, rgba(34,154,104,0.06), transparent 24%), radial-gradient(circle at 82% 12%, rgba(77,124,254,0.04), transparent 18%)',
        }}
      >
        {isLoadingMessages && chatMessages.length === 0 ? (
          <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}><CircularProgress /></Box>
        ) : (
          visibleRows.map((row) => {
            if (row.type === 'date') {
              return (
                <Box key={row.key} sx={{ display: 'flex', justifyContent: 'center', my: 1.2 }}>
                  <Box sx={{ px: 1.2, py: 0.4, borderRadius: 99, bgcolor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(232,237,242,0.8)', backdropFilter: 'blur(8px)' }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: isDark ? '#D0DCEE' : '#6A7785' }}>{row.label}</Typography>
                  </Box>
                </Box>
              );
            }

            const m = row.value;
            const reaction = reactions[m.id];
            const reactionEntries = reaction?.entries || [];
            const messageAttachments = Array.isArray((m as any).attachments)
              ? ((m as any).attachments as Attachment[])
              : [];
            const hasText = String(m.text ?? '').trim() !== '';
            const isMine = String(m.userId) === String(me?.id || '');
            const isGroupMessage = chat?.type === 'group';
            const fallbackSender = participantsById.get(m.userId);
            const apiSender = (m as any)?.sender as Partial<User> | undefined;
            const sender = apiSender?.id
              ? ({
                  ...fallbackSender,
                  ...apiSender,
                } as User)
              : fallbackSender;
            const senderName = String(
              sender?.fullName ||
                (sender?.username ? `@${sender.username}` : ''),
            ).trim();
            const showGroupSenderMeta = isGroupMessage && !isMine;
            const showSenderAdmin = Boolean(sender?.isAdmin);
            const senderAvatar = sender?.avatar;
            return (
              <Box key={row.key} sx={{ mb: 1, display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.65, maxWidth: '86%' }}>
                  {showGroupSenderMeta && (
                    <Avatar
                      src={senderAvatar}
                      sx={{
                        width: 30,
                        height: 30,
                        mb: 0.25,
                        bgcolor: isDark ? '#32557D' : '#DFE8F2',
                        color: isDark ? '#EAF1FF' : '#1C2A38',
                        fontSize: 13,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {(senderName || 'U').slice(0, 1).toUpperCase()}
                    </Avatar>
                  )}

                  <Box sx={{ minWidth: 0 }}>
                    {showGroupSenderMeta && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, mb: 0.22, ml: 0.15 }}>
                        <Typography
                          variant="caption"
                          sx={{
                            color: isDark ? '#AFC1D9' : '#5E6E7F',
                            fontWeight: 700,
                            lineHeight: 1.1,
                          }}
                        >
                          {senderName || 'Участник'}
                        </Typography>
                        {showSenderAdmin && (
                          <Typography
                            variant="caption"
                            sx={{
                              px: 0.55,
                              py: 0.08,
                              borderRadius: 0.85,
                              fontSize: 10,
                              fontWeight: 700,
                              bgcolor: isDark ? 'rgba(250,187,58,0.2)' : 'rgba(250,187,58,0.24)',
                              color: isDark ? '#FFD574' : '#8C5B00',
                            }}
                          >
                            Админ
                          </Typography>
                        )}
                      </Box>
                    )}

                    <Box
                      data-message-id={m.id}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setSelectedMessage(m);
                        setMsgMenuAnchor(e.currentTarget);
                      }}
                      onPointerDown={(event) => handleMessagePointerDown(event, m)}
                      onPointerMove={(event) => handleMessagePointerMove(event, m)}
                      onPointerUp={clearMessageGesture}
                      onPointerLeave={clearMessageGesture}
                      onPointerCancel={clearMessageGesture}
                      sx={{
                        px: 1.5,
                        py: 0.95,
                        borderRadius: 2.2,
                        maxWidth: '100%',
                        border: '1px solid',
                        borderColor: isMine
                          ? alpha(isDark ? '#8FC7FF' : '#1FA35B', isDark ? 0.18 : 0.16)
                          : alpha(isDark ? '#D8E7FF' : '#153528', isDark ? 0.1 : 0.08),
                        bgcolor: isMine
                          ? (isDark ? 'rgba(47,88,136,0.74)' : 'rgba(216,242,228,0.78)')
                          : (isDark ? 'rgba(21,39,65,0.68)' : 'rgba(242,245,248,0.74)'),
                        boxShadow: isMine
                          ? (isDark ? '0 10px 24px rgba(10,22,39,0.18)' : '0 10px 20px rgba(31,163,91,0.08)')
                          : 'none',
                        backdropFilter: 'blur(12px)',
                        WebkitTouchCallout: 'none',
                        WebkitUserSelect: 'none',
                        userSelect: 'none',
                        touchAction: 'manipulation',
                      }}
                    >
                  {!!m.replyTo && (
                    <Box
                      sx={{
                        mb: 0.55,
                        px: 0.8,
                        py: 0.55,
                        minWidth: 0,
                        maxWidth: '100%',
                        borderRadius: 1.4,
                        borderLeft: '3px solid',
                        borderLeftColor: isDark ? '#79B8FF' : '#1FA35B',
                        bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                      }}
                    >
                      <Typography variant="caption" sx={{ display: 'block', fontWeight: 700, lineHeight: 1.1 }}>
                        {m.replyTo.fullName || 'Ответ'}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          opacity: 0.82,
                          display: '-webkit-box',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflowWrap: 'anywhere',
                          wordBreak: 'break-word',
                          maxWidth: '100%',
                        }}
                      >
                        {String(m.replyTo.text || 'Сообщение')}
                      </Typography>
                    </Box>
                  )}
                  {!!messageAttachments.length && (
                    <Box sx={{ display: 'grid', gap: 0.55, mb: hasText ? 0.75 : 0.25 }}>
                      {messageAttachments.map((attachment, index) => {
                        const url = String(attachment?.url ?? '').trim();
                        if (!url) return null;
                        if (attachment.type === 'image') {
                          return (
                            <Box
                              key={`${m.id}-att-${index}`}
                              sx={{
                                width: 'min(240px, 64vw)',
                                maxWidth: '100%',
                                position: 'relative',
                              }}
                            >
                              <Box
                                component="img"
                                src={url}
                                alt={attachment.name || 'photo'}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setPreviewAttachment(attachment);
                                }}
                                sx={{
                                  width: '100%',
                                  borderRadius: 2,
                                  display: 'block',
                                  objectFit: 'cover',
                                  cursor: 'pointer',
                                  border: '1px solid',
                                  borderColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.08)',
                                }}
                              />
                              <IconButton
                                size="small"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  downloadAttachmentStable(attachment);
                                }}
                                sx={{
                                  position: 'absolute',
                                  right: 6,
                                  top: 6,
                                  width: 24,
                                  height: 24,
                                  color: '#fff',
                                  bgcolor: 'rgba(0,0,0,0.45)',
                                  '&:hover': { bgcolor: 'rgba(0,0,0,0.62)' },
                                }}
                              >
                                <DownloadRoundedIcon sx={{ fontSize: 15 }} />
                              </IconButton>
                            </Box>
                          );
                        }

                        if (attachment.type === 'video') {
                          return (
                            <Box
                              key={`${m.id}-att-${index}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                setPreviewAttachment(attachment);
                              }}
                              sx={{
                                width: 'min(240px, 64vw)',
                                maxWidth: '100%',
                                borderRadius: 2,
                                overflow: 'hidden',
                                position: 'relative',
                                cursor: 'pointer',
                                border: '1px solid',
                                borderColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.08)',
                                bgcolor: '#000',
                              }}
                            >
                              <Box
                                component="video"
                                src={url}
                                muted
                                playsInline
                                preload="metadata"
                                sx={{
                                  width: '100%',
                                  maxHeight: 220,
                                  display: 'block',
                                  objectFit: 'cover',
                                }}
                              />
                              <Box
                                sx={{
                                  position: 'absolute',
                                  right: 8,
                                  bottom: 8,
                                  width: 28,
                                  height: 28,
                                  borderRadius: '50%',
                                  display: 'grid',
                                  placeItems: 'center',
                                  fontSize: 16,
                                  color: '#fff',
                                  bgcolor: 'rgba(0,0,0,0.5)',
                                }}
                              >
                                ▶
                              </Box>
                            </Box>
                          );
                        }

                        return (
                          <ButtonBase
                            key={`${m.id}-att-${index}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              window.open(url, '_blank', 'noopener,noreferrer');
                            }}
                            sx={{
                              width: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 0.85,
                              borderRadius: 2,
                              px: 1,
                              py: 0.75,
                              justifyContent: 'flex-start',
                              bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                            }}
                          >
                            <InsertDriveFileRoundedIcon sx={{ fontSize: 18, color: isDark ? '#B7C8DD' : '#5E6E7F' }} />
                            <Box sx={{ minWidth: 0, textAlign: 'left' }}>
                              <Typography sx={{ fontSize: 13, lineHeight: 1.2 }} noWrap>
                                {attachment.name || 'Файл'}
                              </Typography>
                              {!!attachment.size && (
                                <Typography variant="caption" sx={{ opacity: 0.72 }}>
                                  {formatAttachmentSize(Number(attachment.size || 0))}
                                </Typography>
                              )}
                            </Box>
                          </ButtonBase>
                        );
                      })}
                    </Box>
                  )}
                  {hasText && (
                    <Typography sx={{ fontSize: 16, color: isDark ? '#EAF1FF' : '#1D2A22', whiteSpace: 'pre-wrap', wordBreak: 'break-word', userSelect: 'none', WebkitUserSelect: 'none' }}>
                      {renderMessageText(m.text)}
                    </Typography>
                  )}
                  <Box sx={{ mt: 0.2, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.35 }}>
                    {pinnedMessageIds.has(String(m.id || '')) && (
                      <PushPinRoundedIcon sx={{ fontSize: 13, color: isDark ? '#8FC7FF' : '#0A8D4F' }} />
                    )}
                    <Typography variant="caption" sx={{ opacity: 0.72, display: 'block', textAlign: 'right' }}>
                      {new Date(m.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                      {m.edited ? ' · изм.' : ''}
                    </Typography>
                    {m.userId === me?.id && (
                      m.status === 'read' ? (
                        <DoneAllIcon sx={{ fontSize: 14, color: isDark ? '#79B8FF' : '#12864A' }} />
                      ) : m.status === 'error' || m.status === 'sending' ? null : (
                        <DoneRoundedIcon sx={{ fontSize: 14, color: isDark ? '#AFC1D9' : '#6F7D8A' }} />
                      )
                    )}
                  </Box>
                  {!!reactionEntries.length && (
                    <Box
                      sx={{
                        mt: 0.45,
                        ml: 'auto',
                        maxWidth: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        flexWrap: 'wrap',
                        gap: 0.35,
                      }}
                    >
                      {reactionEntries.map((entry) => {
                        const mine = reaction?.mine === entry.value;
                        return (
                          <ButtonBase
                            key={`${m.id}-reaction-${entry.value}`}
                            onPointerDown={() => startReactionViewerHold(m.id)}
                            onPointerUp={clearReactionHoldTimer}
                            onPointerLeave={clearReactionHoldTimer}
                            onPointerCancel={clearReactionHoldTimer}
                            onClick={(event) => {
                              event.stopPropagation();
                              clearReactionHoldTimer();
                              void openReactionViewer(m.id);
                            }}
                            sx={{
                              minHeight: 22,
                              px: 0.6,
                              borderRadius: 11,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 0.3,
                              border: '1px solid',
                              borderColor: mine
                                ? (isDark ? 'rgba(121,184,255,0.75)' : 'rgba(31,163,91,0.65)')
                                : (isDark ? 'rgba(255,255,255,0.17)' : 'rgba(0,0,0,0.08)'),
                              bgcolor: mine
                                ? (isDark ? 'rgba(121,184,255,0.2)' : 'rgba(31,163,91,0.14)')
                                : (isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.05)'),
                            }}
                          >
                            <Typography sx={{ fontSize: 14, lineHeight: 1 }}>{entry.value}</Typography>
                            {entry.total > 1 && (
                              <Typography sx={{ fontSize: 11, lineHeight: 1, fontWeight: 700 }}>{entry.total}</Typography>
                            )}
                          </ButtonBase>
                        );
                      })}
                    </Box>
                  )}
                    </Box>
                  </Box>
                </Box>
              </Box>
            );
          })
        )}
      </Box>

      {!!files.length && (
        <Box
          sx={{
            px: 1.2,
            py: 0.7,
            borderTop: '1px solid',
            borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'divider',
            display: 'flex',
            gap: 1,
            overflowX: 'auto',
          }}
        >
          {files.map((file, index) => {
            const previewUrl = filePreviewUrls[index];
            const isImage = !!previewUrl;
            return (
              <Box
                key={`${file.name}-${index}`}
                sx={{
                  position: 'relative',
                  minWidth: isImage ? 70 : 120,
                  maxWidth: isImage ? 70 : 180,
                  borderRadius: 1.8,
                  border: '1px solid',
                  borderColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.1)',
                  overflow: 'hidden',
                  bgcolor: isDark ? 'rgba(255,255,255,0.06)' : '#F2F5F8',
                }}
              >
                {isImage ? (
                  <Box
                    component="img"
                    src={previewUrl}
                    alt={file.name}
                    sx={{
                      width: 70,
                      height: 70,
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                ) : (
                  <Box sx={{ px: 1, py: 0.75, display: 'flex', alignItems: 'center', gap: 0.7 }}>
                    <InsertDriveFileRoundedIcon sx={{ fontSize: 16, color: isDark ? '#B7C8DD' : '#637687' }} />
                    <Typography variant="caption" noWrap sx={{ maxWidth: 126 }}>
                      {file.name}
                    </Typography>
                  </Box>
                )}
                <IconButton
                  size="small"
                  onClick={() => removePendingAttachment(index)}
                  sx={{
                    position: 'absolute',
                    top: 2,
                    right: 2,
                    width: 20,
                    height: 20,
                    bgcolor: 'rgba(0,0,0,0.58)',
                    color: '#fff',
                    '&:hover': { bgcolor: 'rgba(0,0,0,0.68)' },
                  }}
                >
                  <CloseRoundedIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Box>
            );
          })}
        </Box>
      )}

      {!!replyToMessage && (
        <Box
          sx={{
            px: 1.1,
            py: 0.55,
            borderTop: '1px solid',
            borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'divider',
            display: 'flex',
            alignItems: 'center',
            gap: 0.8,
            bgcolor: isDark ? 'rgba(16,29,46,0.82)' : 'rgba(250,251,252,0.78)',
            backdropFilter: 'blur(14px)',
          }}
        >
          <Box
            sx={{
              flex: 1,
              minWidth: 0,
              borderLeft: '3px solid',
              borderLeftColor: isDark ? '#79B8FF' : '#1FA35B',
              pl: 0.9,
            }}
          >
            <Typography variant="caption" sx={{ fontWeight: 700, lineHeight: 1.15, display: 'block' }}>
              Ответ на сообщение
            </Typography>
            <Typography
              variant="caption"
              sx={{
                opacity: 0.82,
                display: '-webkit-box',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflowWrap: 'anywhere',
                wordBreak: 'break-word',
              }}
            >
              {getReplyPreviewText(replyToMessage)}
            </Typography>
          </Box>
          <IconButton size="small" onClick={() => setReplyToMessage(null)} sx={{ color: isDark ? '#AFC1D9' : '#708090' }}>
            <CloseRoundedIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>
      )}

      {!!editingMessage && (
        <Box
          sx={{
            px: 1.1,
            py: 0.55,
            borderTop: '1px solid',
            borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'divider',
            display: 'flex',
            alignItems: 'center',
            gap: 0.8,
            bgcolor: isDark ? 'rgba(16,29,46,0.82)' : 'rgba(250,251,252,0.78)',
            backdropFilter: 'blur(14px)',
          }}
        >
          <Typography variant="caption" sx={{ fontWeight: 700, flex: 1 }}>
            Редактирование сообщения (до 15 минут)
          </Typography>
          <IconButton size="small" onClick={() => { setEditingMessage(null); setDraftText(''); }} sx={{ color: isDark ? '#AFC1D9' : '#708090' }}>
            <CloseRoundedIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>
      )}

      <Drawer
        anchor="bottom"
        open={mediaPickerOpen}
        onClose={() => setMediaPickerOpen(false)}
        PaperProps={{
          sx: {
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            bgcolor: isDark ? 'rgba(14,28,46,0.84)' : 'rgba(255,255,255,0.84)',
            backdropFilter: 'blur(18px)',
            pb: 'max(env(safe-area-inset-bottom), 10px)',
          },
        }}
      >
        <Box sx={{ p: 1.25, '& > .MuiTypography-root:first-of-type': { display: 'none' } }}>
          <Typography sx={{ fontWeight: 700, mb: 1 }}>Выбор медиа</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1 }}>
            <ButtonBase
              disabled={mediaPickerBusy}
              onClick={() => void handleTakePhotoNow()}
              sx={{
                minHeight: 62,
                borderRadius: 2,
                border: '1px solid',
                borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.14)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Box sx={{ textAlign: 'center', '& .MuiTypography-root': { display: 'none' } }}>
                <PhotoCameraRoundedIcon sx={{ fontSize: 28, mb: 0.35, color: isDark ? '#8FC7FF' : '#1FA35B' }} />
                <Typography variant="caption">Снимок</Typography>
              </Box>
            </ButtonBase>
            <ButtonBase
              disabled={mediaPickerBusy}
              onClick={() => void handlePickFromGallery()}
              sx={{
                minHeight: 62,
                borderRadius: 2,
                border: '1px solid',
                borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.14)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Box sx={{ textAlign: 'center', '& .MuiTypography-root': { display: 'none' } }}>
                <CollectionsRoundedIcon sx={{ fontSize: 28, mb: 0.35, color: isDark ? '#8FC7FF' : '#1FA35B' }} />
                <Typography variant="caption">Галерея</Typography>
              </Box>
            </ButtonBase>
            <ButtonBase
              disabled={mediaPickerBusy}
              onClick={() => inputRef.current?.click()}
              sx={{
                minHeight: 62,
                borderRadius: 2,
                border: '1px solid',
                borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.14)',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Box sx={{ textAlign: 'center', '& .MuiTypography-root': { display: 'none' } }}>
                <AttachFileIcon sx={{ fontSize: 28, mb: 0.35, color: isDark ? '#8FC7FF' : '#1FA35B' }} />
                <Typography variant="caption">Файл</Typography>
              </Box>
            </ButtonBase>
          </Box>
          <Box
            ref={galleryListRef}
            onScroll={handleGalleryScroll}
            sx={{
              mt: 1.1,
              maxHeight: 240,
              overflowY: 'auto',
              overscrollBehavior: 'contain',
              borderRadius: 1.8,
              border: '1px solid',
              borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)',
              p: 0.65,
              bgcolor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.46)',
            }}
          >
            {deviceGalleryLoading ? (
              <Box sx={{ py: 3, display: 'grid', placeItems: 'center' }}>
                <CircularProgress size={20} />
              </Box>
            ) : deviceGalleryItems.length > 0 ? (
              <Stack spacing={0.85}>
                {isSamsungLikeDevice() ? (
                  <Typography variant="caption" color="text.secondary" sx={{ px: 0.25 }}>
                    На Samsung галерея открыта во встроенном облегчённом режиме, чтобы не зависала при прокрутке.
                  </Typography>
                ) : null}
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 0.55 }}>
                  {visibleDeviceGalleryItems.map((item) => (
                    <ButtonBase
                      key={item.identifier}
                      disabled={mediaPickerBusy}
                      onClick={() => void handlePickFromInlineGallery(item)}
                      sx={{
                        borderRadius: 1.2,
                        overflow: 'hidden',
                        width: '100%',
                        aspectRatio: '1 / 1',
                      }}
                    >
                      <Box
                        component="img"
                        src={item.previewUrl}
                        alt="gallery"
                        loading="lazy"
                        decoding="async"
                        sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                    </ButtonBase>
                  ))}
                </Box>
              </Stack>
            ) : deviceGalleryError ? (
              <Stack spacing={1} sx={{ py: 1.2, alignItems: 'center', textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 320 }}>
                  Встроенная галерея сейчас не ответила, поэтому можно открыть системную галерею как запасной вариант.
                </Typography>
                <Button
                  size="small"
                  variant="contained"
                  disabled={mediaPickerBusy || deviceGalleryLoading}
                  onClick={() => void loadDeviceGallery()}
                >
                  Повторить встроенную
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={mediaPickerBusy}
                  onClick={() => void handlePickFromGalleryLegacy()}
                >
                  Открыть системную галерею
                </Button>
              </Stack>
            ) : mediaPickerGalleryThumbs.length > 0 ? (
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 0.55 }}>
                {mediaPickerGalleryThumbs.map((thumb, index) => (
                  <Box
                    key={`${thumb}-${index}`}
                    component="img"
                    src={thumb}
                    alt={`media-${index}`}
                    sx={{
                      width: '100%',
                      aspectRatio: '1 / 1',
                      borderRadius: 1.2,
                      objectFit: 'cover',
                    }}
                  />
                ))}
              </Box>
            ) : (
              <Stack spacing={1} sx={{ py: 1.2, alignItems: 'center', textAlign: 'center' }}>
                <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 320 }}>
                  Галерея пока недоступна. Можно открыть системную галерею или выбрать фото через кнопку выше.
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={mediaPickerBusy}
                  onClick={() => void handlePickFromGalleryLegacy()}
                >
                  Открыть системную галерею
                </Button>
              </Stack>
            )}
          </Box>
        </Box>
      </Drawer>

      <Popover
        open={!!emojiAnchor}
        anchorEl={emojiAnchor}
        onClose={() => setEmojiAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              borderRadius: 2.5,
              p: 0.8,
              maxWidth: 270,
              bgcolor: isDark ? 'rgba(16,32,51,0.84)' : 'rgba(255,255,255,0.84)',
              backdropFilter: 'blur(16px)',
              border: '1px solid',
              borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.1)',
            },
          },
        }}
      >
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 0.4 }}>
          {emojiPalette.map((emoji) => (
            <ButtonBase
              key={`emoji-${emoji}`}
              onMouseDown={(event) => event.preventDefault()}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => insertEmoji(emoji)}
              sx={{
                width: 34,
                height: 34,
                borderRadius: 1.5,
                fontSize: 21,
                '&:hover': {
                  bgcolor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)',
                },
              }}
            >
              {emoji}
            </ButtonBase>
          ))}
        </Box>
      </Popover>

      <Box sx={{ position: 'relative', zIndex: 1, px: 1, pt: 1, pb: 'max(env(safe-area-inset-bottom), 8px)', display: 'flex', gap: 1, alignItems: 'center', bgcolor: isDark ? 'rgba(14,29,47,0.78)' : 'rgba(255,255,255,0.74)', borderTop: '1px solid', borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(21,53,40,0.08)', backdropFilter: 'blur(16px)' }}>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,video/*,audio/*,.pdf,.txt,.zip,.rar,.7z,.doc,.docx"
          style={{ display: 'none' }}
          onChange={(e) => onPickFiles(e.target.files)}
        />
        <input
          ref={galleryInputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          style={{ display: 'none' }}
          onChange={(e) => onPickFiles(e.target.files)}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={(e) => onPickFiles(e.target.files)}
        />
        <IconButton onClick={() => setMediaPickerOpen(true)} sx={{ color: isDark ? '#8EA3BB' : '#6F7D8A' }}><AttachFileIcon /></IconButton>
        <IconButton
          onMouseDown={(event) => event.preventDefault()}
          onPointerDown={(event) => event.preventDefault()}
          onClick={(event) => {
            setEmojiAnchor(event.currentTarget);
            window.requestAnimationFrame(() => {
              const input = messageInputRef.current;
              if (!input) return;
              input.focus();
            });
          }}
          sx={{ color: isDark ? '#8EA3BB' : '#6F7D8A' }}
        >
          <InsertEmoticonRoundedIcon />
        </IconButton>
        <TextField
          fullWidth
          size="small"
          multiline
          minRows={1}
          maxRows={4}
          defaultValue=""
          onChange={handleDraftChange}
          onFocus={noteComposerActivity}
          inputRef={messageInputRef}
          placeholder={editingMessage ? 'Изменить сообщение...' : 'Сообщение...'}
          sx={{
            '& .MuiOutlinedInput-root': {
              borderRadius: 3.2,
              bgcolor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(243,245,247,0.82)',
              color: isDark ? '#fff' : '#1D2A22',
            },
            '& .MuiInputBase-inputMultiline': {
              whiteSpace: 'pre-wrap',
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
              overflowX: 'hidden',
              lineHeight: 1.35,
            },
          }}
        />
        <IconButton
          onClick={submit}
          disabled={
            editingMessage
              ? !canEditMessage(editingMessage) || !hasDraftText
              : (!hasDraftText && !uploaded.length)
          }
          sx={{ color: isDark ? '#8EA3BB' : '#6F7D8A' }}
        >
          <SendRoundedIcon />
        </IconButton>
      </Box>
    </Box>
  );
}
