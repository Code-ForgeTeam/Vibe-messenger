const env = import.meta.env;
const isDev = !!env.DEV;
const forceHttps = env.VITE_FORCE_HTTPS === '1' && !isDev;

const maybeUpgradeToHttps = (url: string): string => {
  if (!forceHttps || !url || !url.startsWith('http://')) return url;
  return url.replace(/^http:\/\//, 'https://');
};

const rawApiBaseUrl = env.VITE_API_BASE_URL || (isDev ? 'http://localhost:3001/api' : '');
const rawSocketUrl = env.VITE_SOCKET_URL || (isDev ? 'http://localhost:3001' : '');
const rawUpdateRepo = env.VITE_UPDATE_REPO || 'Code-ForgeTeam/Vibe-messenger';
const rawUpdateFile = env.VITE_UPDATE_FILE || 'update/Vibe.apk';
const rawCreatorUserId = String(env.VITE_CREATOR_USER_ID || '').trim();

export const API_BASE_URL = maybeUpgradeToHttps(rawApiBaseUrl);
export const SOCKET_URL = maybeUpgradeToHttps(rawSocketUrl);
export const APP_HOST = env.VITE_APP_HOST || SOCKET_URL;
export const APP_VERSION_NAME = env.VITE_APP_VERSION_NAME || '1.0.0';
export const APP_VERSION_CODE = Number(env.VITE_APP_VERSION_CODE || 1);
export const UPDATE_REPO = rawUpdateRepo;
export const UPDATE_FILE_PATH = rawUpdateFile;
export const CREATOR_USER_ID = rawCreatorUserId;

if (!API_BASE_URL) {
  console.warn('[config] VITE_API_BASE_URL is empty. For APK/production, set it in .env.production before build.');
}
