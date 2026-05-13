import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

const handleNotificationData = (data: Record<string, unknown> | null | undefined): void => {
  if (data?.route === 'notifications') {
    router.push('/notifications' as never);
  }
};

export const usePushOpenHandler = (): void => {
  useEffect(() => {
    if (Platform.OS === 'web') return;

    // Cold-start: app launched by tapping a notification while terminated.
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        handleNotificationData(
          response.notification.request.content.data as Record<string, unknown>,
        );
      }
    });

    // Foreground/background: app already running when user taps notification.
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      handleNotificationData(response.notification.request.content.data as Record<string, unknown>);
    });

    return () => sub.remove();
  }, []);
};
