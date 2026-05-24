import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AuthPage } from './components/AuthPage';
import { AppSnackbar } from './components/AppSnackbar';
import { BottomNav } from './components/BottomNav';
import { NotificationBanners } from './components/NotificationBanners';
import { APP_VERSION_CODE } from './lib/config';
import { APP_NAME } from './lib/appMeta';
import { pushApi } from './lib/api';
import {
  checkGithubApkUpdate,
  markUpdatePromptDismissed,
  shouldShowUpdatePrompt,
  type ApkUpdateInfo,
} from './lib/updateChecker';
import { useAuthStore } from './stores/authStore';
import { useAdminStore } from './stores/adminStore';
import { useAppConfigStore } from './stores/appConfigStore';
import { useChatStore } from './stores/chatStore';
import { useNotificationStore } from './stores/notificationStore';
import { useSettingsStore } from './stores/settingsStore';

const ChatsPage = lazy(() => import('./pages/ChatsPage'));
const ChatPage = lazy(() => import('./pages/ChatPage'));
const ContactsPage = lazy(() => import('./pages/ContactsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const NotificationsSettingsPage = lazy(() => import('./pages/NotificationsSettingsPage'));
const ChatSettingsPage = lazy(() => import('./pages/ChatSettingsPage'));
const EditProfilePage = lazy(() => import('./pages/EditProfilePage'));
const UserProfilePage = lazy(() => import('./pages/UserProfilePage'));
const GroupProfilePage = lazy(() => import('./pages/GroupProfilePage'));
const GlobalSearchPage = lazy(() => import('./pages/GlobalSearchPage'));
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'));
const PrivacySettingPage = lazy(() => import('./pages/PrivacySettingPage'));
const UserPickerPage = lazy(() => import('./pages/UserPickerPage'));
const DataStoragePage = lazy(() => import('./pages/DataStoragePage'));
const DevicesPage = lazy(() => import('./pages/DevicesPage'));
const SpecialFeaturesPage = lazy(() => import('./pages/SpecialFeaturesPage'));
const ArchivePage = lazy(() => import('./pages/ArchivePage'));
const AddContactPage = lazy(() => import('./pages/AddContactPage'));
const FavoritesPage = lazy(() => import('./pages/FavoritesPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const SupportPage = lazy(() => import('./pages/SupportPage'));
const SupportAgentPage = lazy(() => import('./pages/SupportAgentPage'));
const AuthorSupportPage = lazy(() => import('./pages/AuthorSupportPage'));
const GamePage = lazy(() => import('./pages/GamePage'));
const ENABLE_NATIVE_PUSH = String(import.meta.env.VITE_ENABLE_NATIVE_PUSH ?? 'true').toLowerCase() !== 'false';

function BackgroundEffects({
  effect,
  intensity = 100,
}: {
  effect: 'none' | 'snow' | 'leaves' | 'flowers' | 'rain';
  intensity?: number;
}) {
  if (effect === 'none') return null;

  const config =
    effect === 'snow'
      ? { symbols: ['\u2744'], count: 28, color: 'primary.main', sizeBase: 10, drift: 8, durationBase: 6 }
      : effect === 'leaves'
        ? { symbols: ['\ud83c\udf43', '\ud83c\udf42', '\ud83c\udf41'], count: 18, color: '#5FA35C', sizeBase: 15, drift: 20, durationBase: 7 }
        : effect === 'flowers'
          ? { symbols: ['\u273f', '\u2740', '\u2741'], count: 18, color: '#D66CA2', sizeBase: 14, drift: 13, durationBase: 6.2 }
          : { symbols: ['\u2022'], count: 34, color: '#7EB6E8', sizeBase: 12, drift: 6, durationBase: 5.4 };

  const count = Math.max(8, Math.round((config.count * intensity) / 100));
  const finalRotate = effect === 'leaves' ? 26 : effect === 'flowers' ? -12 : 0;

  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        overflow: 'hidden',
        '@keyframes fall': {
          '0%': { transform: 'translateY(-12vh) translateX(0)', opacity: 0 },
          '20%': { opacity: 0.65 },
          '100%': {
            transform: `translateY(110vh) translateX(${config.drift}px) rotate(${finalRotate}deg)`,
            opacity: 0,
          },
        },
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <Box
          key={`${effect}-${i}`}
          sx={{
            position: 'absolute',
            top: '-12vh',
            left: `${(i * 11) % 100}%`,
            fontSize: `${config.sizeBase + (i % 4) * 4}px`,
            color: config.color,
            opacity: 0.55,
            animation: `fall ${config.durationBase + (i % 7)}s linear infinite`,
            animationDelay: `${(i % 10) * 0.5}s`,
            filter: effect === 'rain' ? 'blur(0.2px)' : 'none',
          }}
        >
          {config.symbols[i % config.symbols.length]}
        </Box>
      ))}
    </Box>
  );
}

type IntroTarget = {
  left: number;
  top: number;
  width: number;
  height: number;
  fontSize: number;
  lineHeight: number;
};

const DEFAULT_INTRO_TARGET: IntroTarget = {
  left: 96,
  top: 54,
  width: 68,
  height: 26,
  fontSize: 20,
  lineHeight: 24,
};

const AUTH_BOOT_MIN_MS = 360;
const INTRO_HOLD_MS = 900;
const INTRO_FLY_MS = 760;
const INTRO_FADE_MS = 200;
const INTRO_TOTAL_MS = INTRO_HOLD_MS + INTRO_FLY_MS + INTRO_FADE_MS;
const PENDING_PUSH_TARGET_KEY = 'vibe:pending-push-target';
const HOME_BRAND_ANCHOR_ID = 'vibe-home-anchor';
const INTRO_FINISHED_EVENT = 'vibe:intro-finished';

function LaunchIntro({
  active,
  target,
}: {
  active: boolean;
  target: IntroTarget;
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  if (!active) return null;

  const startScale = 1.8;
  const finalOffsetX = -6;
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 390;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 844;
  const finalCenterX = Math.round(target.left + target.width / 2 + finalOffsetX);
  const finalCenterY = Math.round(target.top + target.height / 2);
  const deltaX = Math.round(viewportWidth / 2 - finalCenterX);
  const deltaY = Math.round(viewportHeight / 2 - finalCenterY);
  const bveOffsetY = Math.max(36, target.height * 1.65);
  const algaStartTransform = `translate3d(calc(-50% + ${deltaX}px), calc(-50% + ${deltaY}px), 0) scale(${startScale})`;
  const algaEndTransform = 'translate3d(-50%, -50%, 0) scale(1)';

  return (
    <Box
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 4000,
        overflow: 'hidden',
        bgcolor: isDark ? '#061124' : '#F4FBF6',
        '@keyframes introFadeOut': {
          '0%, 92%': { opacity: 1 },
          '100%': { opacity: 0 },
        },
        '@keyframes algaHold': {
          '0%, 100%': {
            transform: algaStartTransform,
            opacity: 1,
          },
        },
        '@keyframes algaFly': {
          '0%': {
            transform: algaStartTransform,
            opacity: 1,
          },
          '100%': {
            transform: algaEndTransform,
            opacity: 1,
          },
        },
        '@keyframes bveHold': {
          '0%, 100%': {
            opacity: 0.98,
            transform: `translate3d(-50%, calc(-50% + ${bveOffsetY}px), 0) scale(1)`,
          },
        },
        '@keyframes bveFadeCenter': {
          '0%': {
            opacity: 0.98,
            transform: `translate3d(-50%, calc(-50% + ${bveOffsetY}px), 0) scale(1)`,
          },
          '100%': {
            opacity: 0,
            transform: `translate3d(-50%, calc(-50% + ${bveOffsetY}px), 0) scale(1)`,
          },
        },
        animation: `introFadeOut ${INTRO_TOTAL_MS}ms linear forwards`,
      }}
    >
      <Typography
        sx={{
          position: 'absolute',
          top: finalCenterY,
          left: finalCenterX,
          transform: algaEndTransform,
          animation: `algaHold ${INTRO_HOLD_MS}ms linear 0ms 1 forwards, algaFly ${INTRO_FLY_MS}ms cubic-bezier(0.26, 0.92, 0.3, 1) ${INTRO_HOLD_MS}ms 1 forwards`,
          willChange: 'transform, opacity',
          fontSize: `${target.fontSize}px`,
          lineHeight: `${target.lineHeight}px`,
          fontWeight: 800,
          letterSpacing: 0,
          color: theme.palette.text.primary,
          textShadow: 'none',
          backfaceVisibility: 'hidden',
          WebkitFontSmoothing: 'subpixel-antialiased',
          textRendering: 'geometricPrecision',
        }}
        >
        {APP_NAME}
      </Typography>

      <Typography
        sx={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: `translate3d(-50%, calc(-50% + ${bveOffsetY}px), 0)`,
          fontSize: 16,
          fontWeight: 700,
          letterSpacing: 1.6,
          color: isDark ? 'rgba(214,231,255,0.92)' : 'rgba(23,103,63,0.86)',
          animation: `bveHold ${INTRO_HOLD_MS}ms linear 0ms 1 forwards, bveFadeCenter 220ms linear ${INTRO_HOLD_MS}ms 1 forwards`,
          willChange: 'opacity, transform',
        }}
      >
        BVE
      </Typography>
    </Box>
  );
}

function QuietBootLoader() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      sx={{
        position: 'relative',
        zIndex: 2,
        height: '100%',
        display: 'grid',
        placeItems: 'center',
        '@keyframes bootBreath': {
          '0%, 100%': { opacity: 0.9, transform: 'translateY(0) scale(1)' },
          '50%': { opacity: 1, transform: 'translateY(-2px) scale(1.015)' },
        },
      }}
    >
      <Box sx={{ textAlign: 'center', animation: 'bootBreath 1.8s ease-in-out infinite' }}>
        <Typography
          sx={{
            fontWeight: 800,
            fontSize: 34,
            lineHeight: 1,
            color: isDark ? '#EAF1FF' : '#1A3A2A',
          }}
        >
          {APP_NAME}
        </Typography>
        <Typography
          sx={{
            mt: 0.65,
            fontWeight: 700,
            fontSize: 14,
            letterSpacing: 1.6,
            color: isDark ? 'rgba(214,231,255,0.82)' : 'rgba(23,103,63,0.78)',
          }}
        >
          BVE
        </Typography>
        <Box sx={{ mt: 1.8, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress size={18} thickness={4.6} />
        </Box>
      </Box>
    </Box>
  );
}

function Guard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <>{children}</> : <Navigate to="/auth" replace />;
}

export default function App() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const navigate = useNavigate();
  const auth = useAuthStore();
  const checkAdminAccess = useAdminStore((s) => s.checkAdminAccess);
  const setAdminAccess = useAdminStore((s) => s.setAdminAccess);
  const resetAdminAccess = useAdminStore((s) => s.reset);
  const gameEnabled = useAppConfigStore((s) => s.gameEnabled);
  const loadAppConfig = useAppConfigStore((s) => s.loadConfig);
  const initSocketHandlers = useChatStore((s) => s.initSocketHandlers);
  const loadChats = useChatStore((s) => s.loadChats);
  const loadBanners = useNotificationStore((s) => s.loadBanners);
  const dismissAllBanners = useNotificationStore((s) => s.dismissAllBanners);
  const { bgEffect, effectIntensity, launchIntroEnabled } = useSettingsStore();
  const { pathname } = useLocation();
  const isChatRoute = pathname.startsWith('/chat/');
  const isSupportRoute = pathname.startsWith('/support');
  const isGameRoute = pathname.startsWith('/game');

  const [apkUpdate, setApkUpdate] = useState<ApkUpdateInfo | null>(null);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [showLaunchIntro, setShowLaunchIntro] = useState(launchIntroEnabled);
  const [authBootstrapping, setAuthBootstrapping] = useState(true);
  const [introTarget, setIntroTarget] = useState<IntroTarget>(DEFAULT_INTRO_TARGET);
  const edgeSwipeRef = useRef<{ active: boolean; startX: number; startY: number; swiped: boolean }>({
    active: false,
    startX: 0,
    startY: 0,
    swiped: false,
  });
  const launchIntroActive = auth.isAuthenticated && showLaunchIntro && launchIntroEnabled;
  const hideMainUi = authBootstrapping || launchIntroActive;
  const allowGlobalSwipeBack =
    auth.isAuthenticated &&
    pathname !== '/auth' &&
    pathname !== '/chats' &&
    !pathname.startsWith('/chat/');

  useEffect(() => {
    loadAppConfig().catch(() => null);
  }, [loadAppConfig]);

  const resetEdgeSwipe = () => {
    edgeSwipeRef.current.active = false;
    edgeSwipeRef.current.swiped = false;
  };

  const handleGlobalPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!allowGlobalSwipeBack || event.pointerType === 'mouse') {
      resetEdgeSwipe();
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
    resetEdgeSwipe();
  };

  const handleGlobalPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = edgeSwipeRef.current;
    if (!state.active || state.swiped) return;

    const dx = event.clientX - state.startX;
    const dy = Math.abs(event.clientY - state.startY);
    if (dy > 56 || dx < -8) {
      resetEdgeSwipe();
      return;
    }

    if (dx > 92 && dy < 40) {
      state.swiped = true;
      state.active = false;
      navigate('/chats');
    }
  };

  useEffect(() => {
    let disposed = false;
    let timeoutId: number | null = null;
    const startedAt = Date.now();

    void auth.checkAuth().finally(() => {
      const elapsed = Date.now() - startedAt;
      const waitMs = Math.max(0, AUTH_BOOT_MIN_MS - elapsed);
      timeoutId = window.setTimeout(() => {
        if (!disposed) {
          setAuthBootstrapping(false);
        }
      }, waitMs);
    });

    return () => {
      disposed = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  useEffect(() => {
    if (!auth.isAuthenticated || !auth.user?.id) return;
    useChatStore.getState().hydrateFromCache(auth.user.id);
  }, [auth.isAuthenticated, auth.user?.id]);

  useEffect(() => {
    if (!auth.isAuthenticated || !auth.user?.id) return;

    const userId = auth.user.id;
    let timerId: number | null = null;
    const schedulePersist = () => {
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
      timerId = window.setTimeout(() => {
        useChatStore.getState().persistToCache(userId);
      }, 520);
    };

    schedulePersist();
    const unsubscribe = useChatStore.subscribe((state, prevState) => {
      if (
        state.chats === prevState.chats
        && state.messages === prevState.messages
        && state.messagesLoadedAll === prevState.messagesLoadedAll
      ) {
        return;
      }
      schedulePersist();
    });

    return () => {
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
      unsubscribe();
    };
  }, [auth.isAuthenticated, auth.user?.id]);

  useEffect(() => {
    const userId = auth.user?.id;
    if (!auth.isAuthenticated || !userId) {
      resetAdminAccess();
      return;
    }
    if (auth.user?.isCreator) {
      setAdminAccess(true, userId);
      return;
    }

    checkAdminAccess(userId, true).catch(() => null);
  }, [
    auth.isAuthenticated,
    auth.user?.id,
    auth.user?.isCreator,
    checkAdminAccess,
    resetAdminAccess,
    setAdminAccess,
  ]);

  useEffect(() => {
    if (!launchIntroEnabled) {
      setShowLaunchIntro(false);
    }
  }, [launchIntroEnabled]);

  useEffect(() => {
    if (!auth.isAuthenticated) return;
    if (!pathname.startsWith('/game')) return;
    if (gameEnabled) return;
    navigate('/chats', { replace: true });
  }, [auth.isAuthenticated, gameEnabled, navigate, pathname]);

  useEffect(() => {
    if (!launchIntroActive) {
      setIntroTarget(DEFAULT_INTRO_TARGET);
      return;
    }

    if (pathname !== '/chats') {
      setIntroTarget(DEFAULT_INTRO_TARGET);
      return;
    }

    let attempts = 0;

    const tryResolveTarget = (): boolean => {
      const anchor = document.getElementById(HOME_BRAND_ANCHOR_ID);
      attempts += 1;
      if (!anchor) {
        return attempts > 40;
      }

      const rect = anchor.getBoundingClientRect();
      const style = window.getComputedStyle(anchor);
      const fontSize = Number.parseFloat(style.fontSize || '20') || 20;
      const lineHeightValue = Number.parseFloat(style.lineHeight || '');
      const lineHeight = Number.isFinite(lineHeightValue) ? lineHeightValue : fontSize * 1.2;
      setIntroTarget({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        fontSize,
        lineHeight,
      });
      return true;
    };

    if (tryResolveTarget()) {
      return;
    }

    const timer = window.setInterval(() => {
      if (tryResolveTarget()) {
        window.clearInterval(timer);
      }
    }, 45);
    return () => window.clearInterval(timer);
  }, [launchIntroActive, pathname]);

  useEffect(() => {
    if (!launchIntroActive) return;
    const timerId = window.setTimeout(() => {
      setShowLaunchIntro(false);
      window.dispatchEvent(new CustomEvent(INTRO_FINISHED_EVENT));
    }, INTRO_TOTAL_MS + 20);
    return () => window.clearTimeout(timerId);
  }, [launchIntroActive]);

  useEffect(() => {
    let active = true;

    checkGithubApkUpdate().then((info) => {
      if (!active || !info) return;
      if (!shouldShowUpdatePrompt(info)) return;
      setApkUpdate(info);
      setShowUpdateDialog(true);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!auth.isAuthenticated) return;
    initSocketHandlers();
    dismissAllBanners().catch(() => null);
    loadChats();
    useSettingsStore.getState().loadPrivacyFromServer();
    useSettingsStore.getState().loadNotificationSettings();
    loadBanners(APP_VERSION_CODE);

    const pollId = window.setInterval(async () => {
      if (!auth.isAuthenticated) return;
      try {
        await loadChats({ silent: true });
        await loadBanners(APP_VERSION_CODE);
      } catch {
        // ignore polling failures
      }
    }, 120000);

    return () => window.clearInterval(pollId);
  }, [auth.isAuthenticated, initSocketHandlers, loadChats, loadBanners, dismissAllBanners]);

  useEffect(() => {
    if (!auth.isAuthenticated) return;
    if (typeof window === 'undefined') return;
    const capacitorGlobal = (window as typeof window & {
      Capacitor?: { isNativePlatform?: () => boolean };
    }).Capacitor;
    if (capacitorGlobal?.isNativePlatform?.()) return;
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => null);
    }
  }, [auth.isAuthenticated]);

  useEffect(() => {
    if (!auth.isAuthenticated) return;

    let disposed = false;
    let removeBackButton: (() => void) | null = null;

    const initBackButton = async () => {
      try {
        const [{ Capacitor }, { App: CapacitorApp }] = await Promise.all([
          import('@capacitor/core'),
          import('@capacitor/app'),
        ]);
        if (disposed) return;
        if (Capacitor.getPlatform() === 'web') return;

        const handle = await CapacitorApp.addListener('backButton', () => {
          if (pathname === '/chats' || pathname === '/auth') {
            CapacitorApp.exitApp();
            return;
          }
          navigate('/chats', { replace: true });
        });

        removeBackButton = () => {
          try {
            const result = handle.remove();
            if (result && typeof (result as Promise<void>).then === 'function') {
              void (result as Promise<void>).catch(() => null);
            }
          } catch {
            // ignore
          }
        };
      } catch {
        // ignore when capacitor app plugin is unavailable
      }
    };

    void initBackButton();

    return () => {
      disposed = true;
      removeBackButton?.();
    };
  }, [auth.isAuthenticated, navigate, pathname]);

  useEffect(() => {
    if (!ENABLE_NATIVE_PUSH) return;

    let disposed = false;
    let removeRegistration: (() => void) | null = null;
    let removeRegistrationError: (() => void) | null = null;
    let removeReceived: (() => void) | null = null;
    let removeAction: (() => void) | null = null;
    let removeAppState: (() => void) | null = null;
    const normalizePushUrl = (rawUrl: unknown): string | null => {
      const value = String(rawUrl ?? '').trim();
      if (!value) return null;
      try {
        const parsed = new URL(value);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return null;
        }
        return parsed.toString();
      } catch {
        return null;
      }
    };
    const openPushUrl = (rawUrl: unknown): boolean => {
      const normalized = normalizePushUrl(rawUrl);
      if (!normalized) return false;
      try {
        const popup = window.open(normalized, '_blank', 'noopener,noreferrer');
        if (!popup) {
          window.location.href = normalized;
        }
      } catch {
        return false;
      }
      return true;
    };
    const savePendingPushTarget = (target: string) => {
      try {
        localStorage.setItem(PENDING_PUSH_TARGET_KEY, target);
      } catch {
        // ignore storage issues
      }
    };

    const consumePendingPushTarget = (): string => {
      try {
        const value = String(localStorage.getItem(PENDING_PUSH_TARGET_KEY) || '').trim();
        if (!value) return '';
        localStorage.removeItem(PENDING_PUSH_TARGET_KEY);
        return value;
      } catch {
        return '';
      }
    };

    const navigateFromPush = (payload: any, allowPending = true) => {
      const data = payload?.notification?.data ?? payload?.data ?? {};
      const pushType = String(data?.type ?? '').trim().toLowerCase();
      if (pushType === 'admin_event') {
        const downloadUrl = data?.downloadUrl ?? data?.url ?? data?.link;
        const normalized = normalizePushUrl(downloadUrl);
        if (normalized) {
          const opened = openPushUrl(normalized);
          if (!opened && allowPending) {
            savePendingPushTarget(`url:${normalized}`);
          }
          return;
        }
      }
      const targetChatId = String(data?.chatId ?? '').trim();
      if (!targetChatId) return;
      const targetPath = `/chat/${targetChatId}`;
      if (typeof window !== 'undefined' && window.location.pathname === targetPath) return;
      if (!auth.isAuthenticated) {
        if (allowPending) {
          savePendingPushTarget(targetPath);
        }
        return;
      }
      navigate(targetPath);
    };

    const initPush = async () => {
      try {
        const [{ Capacitor }, { PushNotifications }, { App }] = await Promise.all([
          import('@capacitor/core'),
          import('@capacitor/push-notifications'),
          import('@capacitor/app'),
        ]);

        const platform = Capacitor.getPlatform();
        if (platform === 'web') return;

        const actionHandle = await PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
          if (disposed) return;
          PushNotifications.removeAllDeliveredNotifications().catch(() => null);
          dismissAllBanners().catch(() => null);
          loadChats({ silent: true }).catch(() => null);
          navigateFromPush(notification);
        });
        removeAction = () => {
          try {
            const result = actionHandle.remove();
            if (result && typeof (result as Promise<void>).then === 'function') {
              void (result as Promise<void>).catch(() => null);
            }
          } catch {
            // ignore
          }
        };

        if (!auth.isAuthenticated) {
          return;
        }

        const pendingTarget = consumePendingPushTarget();
        if (pendingTarget.startsWith('url:')) {
          openPushUrl(pendingTarget.slice(4));
        } else if (pendingTarget && pendingTarget.startsWith('/chat/')) {
          navigate(pendingTarget);
        }

        const perm = await PushNotifications.checkPermissions();
        const granted = perm.receive === 'granted'
          ? perm
          : await PushNotifications.requestPermissions();
        if (granted.receive !== 'granted' || disposed) return;

        await PushNotifications.removeAllDeliveredNotifications().catch(() => null);
        await pushApi.unregisterToken('').catch(() => null);

        if (platform === 'android') {
          await PushNotifications.createChannel({
            id: 'messages',
            name: 'Messages',
            description: 'Уведомления о новых сообщениях',
            importance: 5,
            visibility: 1,
            sound: 'default',
          }).catch(() => null);
          await PushNotifications.createChannel({
            id: 'events',
            name: 'Events',
            description: 'Service and update notifications',
            importance: 5,
            visibility: 1,
            sound: 'default',
          }).catch(() => null);
        }

        const registrationHandle = await PushNotifications.addListener('registration', async (token) => {
          const value = String(token?.value ?? '').trim();
          if (!value || disposed) return;
          try {
            await pushApi.registerToken(value, platform);
          } catch {
            // ignore registration errors
          }
        });
        removeRegistration = () => {
          try {
            const result = registrationHandle.remove();
            if (result && typeof (result as Promise<void>).then === 'function') {
              void (result as Promise<void>).catch(() => null);
            }
          } catch {
            // ignore
          }
        };

        const registrationErrorHandle = await PushNotifications.addListener('registrationError', (error) => {
          console.warn('Push registration error:', error);
        });
        removeRegistrationError = () => {
          try {
            const result = registrationErrorHandle.remove();
            if (result && typeof (result as Promise<void>).then === 'function') {
              void (result as Promise<void>).catch(() => null);
            }
          } catch {
            // ignore
          }
        };

        const receivedHandle = await PushNotifications.addListener('pushNotificationReceived', () => {
          if (disposed) return;
          dismissAllBanners().catch(() => null);
          loadChats({ silent: true }).catch(() => null);
        });
        removeReceived = () => {
          try {
            const result = receivedHandle.remove();
            if (result && typeof (result as Promise<void>).then === 'function') {
              void (result as Promise<void>).catch(() => null);
            }
          } catch {
            // ignore
          }
        };

        const appStateHandle = await App.addListener('appStateChange', ({ isActive }) => {
          if (disposed || !isActive) return;
          PushNotifications.removeAllDeliveredNotifications().catch(() => null);
          pushApi.unregisterToken('').catch(() => null);
          dismissAllBanners().catch(() => null);
          PushNotifications.register().catch(() => null);
          loadChats({ silent: true }).catch(() => null);
        });
        removeAppState = () => {
          try {
            const result = appStateHandle.remove();
            if (result && typeof (result as Promise<void>).then === 'function') {
              void (result as Promise<void>).catch(() => null);
            }
          } catch {
            // ignore
          }
        };

        await PushNotifications.register();
      } catch {
        // Push plugin can be unavailable in web/preview environments.
      }
    };

    void initPush();

    return () => {
      disposed = true;
      removeRegistration?.();
      removeRegistrationError?.();
      removeReceived?.();
      removeAction?.();
      removeAppState?.();
    };
  }, [auth.isAuthenticated, loadChats, navigate, dismissAllBanners]);

  const dismissUpdateDialog = () => {
    if (apkUpdate) {
      markUpdatePromptDismissed(apkUpdate);
    }
    setShowUpdateDialog(false);
  };

  const downloadUpdate = () => {
    if (apkUpdate) {
      markUpdatePromptDismissed(apkUpdate);
      window.open(apkUpdate.downloadUrl || apkUpdate.htmlUrl, '_blank', 'noopener,noreferrer');
    }
    setShowUpdateDialog(false);
  };

  if (auth.banned) {
    return (
      <Box sx={{ height: '100dvh', display: 'grid', placeItems: 'center', p: 3, textAlign: 'center' }}>
        <Box>
          <Typography variant="h5" sx={{ mb: 1 }}>Аккаунт заблокирован</Typography>
          <Typography color="text.secondary">{auth.banReason || 'Свяжитесь с администратором.'}</Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        position: 'relative',
        isolation: 'isolate',
        height: '100dvh',
        pb: isChatRoute || isSupportRoute || isGameRoute ? 0 : 10,
        overflow: 'hidden',
        backgroundColor: 'background.default',
        backgroundImage: isDark
          ? 'radial-gradient(circle at top left, rgba(100,180,255,0.12), transparent 28%), radial-gradient(circle at top right, rgba(123,226,196,0.09), transparent 22%)'
          : 'radial-gradient(circle at top left, rgba(34,154,104,0.12), transparent 28%), radial-gradient(circle at top right, rgba(77,124,254,0.08), transparent 22%)',
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: isDark
            ? 'linear-gradient(180deg, rgba(8,17,29,0.30), rgba(8,17,29,0.06) 42%, rgba(8,17,29,0.34) 100%)'
            : 'linear-gradient(180deg, rgba(255,255,255,0.42), rgba(255,255,255,0.08) 42%, rgba(233,243,237,0.46) 100%)',
        },
      }}
      onPointerDown={handleGlobalPointerDown}
      onPointerMove={handleGlobalPointerMove}
      onPointerUp={resetEdgeSwipe}
      onPointerCancel={resetEdgeSwipe}
      onPointerLeave={resetEdgeSwipe}
    >
      <BackgroundEffects effect={bgEffect} intensity={effectIntensity} />
      <LaunchIntro active={launchIntroActive} target={introTarget} />

      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          opacity: hideMainUi ? 0 : 1,
          pointerEvents: hideMainUi ? 'none' : 'auto',
          transition: 'opacity 120ms linear',
          height: '100%',
        }}
      >
        <Suspense fallback={<Box sx={{ p: 4, position: 'relative', zIndex: 1 }} />}>
          <Routes>
            <Route path="/auth" element={auth.isAuthenticated ? <Navigate to="/chats" replace /> : <AuthPage />} />

            <Route path="/chats" element={<Guard><ChatsPage /></Guard>} />
            <Route path="/chat/:chatId" element={<Guard><ChatPage /></Guard>} />
            <Route path="/contacts" element={<Guard><ContactsPage /></Guard>} />
            <Route path="/settings" element={<Guard><SettingsPage /></Guard>} />
            <Route path="/notifications-settings" element={<Guard><NotificationsSettingsPage /></Guard>} />
            <Route path="/chat-settings" element={<Guard><ChatSettingsPage /></Guard>} />
            <Route path="/edit-profile" element={<Guard><EditProfilePage /></Guard>} />
            <Route path="/user/:userId" element={<Guard><UserProfilePage /></Guard>} />
            <Route path="/group/:chatId" element={<Guard><GroupProfilePage /></Guard>} />
            <Route path="/search" element={<Guard><GlobalSearchPage /></Guard>} />
            <Route path="/privacy" element={<Guard><PrivacyPage /></Guard>} />
            <Route path="/privacy/:settingKey" element={<Guard><PrivacySettingPage /></Guard>} />
            <Route path="/privacy/:settingKey/:exceptionType" element={<Guard><UserPickerPage /></Guard>} />
            <Route path="/data-storage" element={<Guard><DataStoragePage /></Guard>} />
            <Route path="/devices" element={<Guard><DevicesPage /></Guard>} />
            <Route path="/special-features" element={<Guard><SpecialFeaturesPage /></Guard>} />
            <Route path="/archive" element={<Guard><ArchivePage /></Guard>} />
            <Route path="/add-contact" element={<Guard><AddContactPage /></Guard>} />
            <Route path="/favorites" element={<Guard><FavoritesPage /></Guard>} />
            <Route path="/admin" element={<Guard><AdminPage /></Guard>} />
            <Route path="/support" element={<Guard><SupportPage /></Guard>} />
            <Route path="/support-agent" element={<Guard><SupportAgentPage /></Guard>} />
            <Route path="/author-support" element={<Guard><AuthorSupportPage /></Guard>} />
            <Route
              path="/game"
              element={
                <Guard>
                  {gameEnabled ? <GamePage /> : <Navigate to="/chats" replace />}
                </Guard>
              }
            />

            <Route path="*" element={<Navigate to="/chats" replace />} />
          </Routes>
        </Suspense>

        {auth.isAuthenticated && !isGameRoute && !isSupportRoute && <BottomNav />}
        {auth.isAuthenticated && !isGameRoute && <NotificationBanners />}
        <AppSnackbar />
      </Box>

      <Dialog open={showUpdateDialog} onClose={dismissUpdateDialog} fullWidth maxWidth="xs">
        <DialogTitle>Доступно обновление</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            В репозитории найден файл APK ({apkUpdate?.name || 'Vibe.apk'}). Обновить приложение сейчас?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={dismissUpdateDialog}>Позже</Button>
          <Button onClick={downloadUpdate} variant="contained">Скачать</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
