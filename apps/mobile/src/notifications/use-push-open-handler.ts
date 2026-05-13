import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

export const usePushOpenHandler = (): void => {
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown>;
      if (data?.route === 'notifications') {
        router.push('/notifications' as never);
      }
    });

    return () => sub.remove();
  }, []);
};
