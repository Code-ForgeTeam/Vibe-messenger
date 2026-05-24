import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { adminApi, appConfigApi } from '../lib/api';

const APP_CONFIG_STORAGE_KEY = 'vibe:app-config:v1';

const readGameEnabled = (payload: any, fallback = true): boolean => {
  if (!payload || typeof payload !== 'object') return fallback;
  if (typeof payload.gameEnabled === 'boolean') return payload.gameEnabled;
  if (typeof payload.game_enabled === 'boolean') return payload.game_enabled;
  return fallback;
};

interface AppConfigState {
  gameEnabled: boolean;
  hasLoaded: boolean;
  isLoading: boolean;
  hydrateConfig: (payload: unknown) => void;
  loadConfig: () => Promise<void>;
  updateGameEnabled: (value: boolean) => Promise<void>;
}

export const useAppConfigStore = create<AppConfigState>()(
  persist(
    (set, get) => ({
      gameEnabled: true,
      hasLoaded: false,
      isLoading: false,

      hydrateConfig: (payload) => {
        set((state) => ({
          gameEnabled: readGameEnabled(payload, state.gameEnabled),
          hasLoaded: true,
        }));
      },

      loadConfig: async () => {
        if (get().isLoading) return;

        set({ isLoading: true });
        try {
          const payload = await appConfigApi.get();
          set({
            gameEnabled: readGameEnabled(payload, get().gameEnabled),
            hasLoaded: true,
            isLoading: false,
          });
        } catch {
          set((state) => ({
            hasLoaded: state.hasLoaded,
            isLoading: false,
          }));
        }
      },

      updateGameEnabled: async (value: boolean) => {
        const payload = await adminApi.updateAppConfig({ gameEnabled: value });
        set({
          gameEnabled: readGameEnabled(payload, value),
          hasLoaded: true,
          isLoading: false,
        });
      },
    }),
    {
      name: APP_CONFIG_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        gameEnabled: state.gameEnabled,
        hasLoaded: state.hasLoaded,
      }),
    },
  ),
);
