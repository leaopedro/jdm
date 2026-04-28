import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { ensurePushPermission } from './permission';
import { registerExpoPushToken } from './register';

import { registerDeviceToken } from '~/api/device-tokens';

export type UsePushRegistrationDeps = { isAuthenticated: boolean };

export const usePushRegistration = ({ isAuthenticated }: UsePushRegistrationDeps): void => {
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      lastSent.current = null;
      return undefined;
    }

    const send = async (token: string, platform: 'ios' | 'android') => {
      if (lastSent.current === token) return;
      try {
        await registerDeviceToken({ expoPushToken: token, platform });
        lastSent.current = token;
      } catch {
        // Server-side dedupe + lastSeenAt bump handle retry on next boot.
      }
    };

    const boot = async () => {
      const perm = await ensurePushPermission();
      if (perm !== 'granted') return;
      const result = await registerExpoPushToken();
      if (!result.ok) return;
      await send(result.token, result.platform);
    };
    void boot();

    const sub = Notifications.addPushTokenListener((event) => {
      const platform: 'ios' | 'android' = Platform.OS === 'ios' ? 'ios' : 'android';
      void send(event.data as string, platform);
    });

    return () => {
      sub.remove();
    };
  }, [isAuthenticated]);
};
