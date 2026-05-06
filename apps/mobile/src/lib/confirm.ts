import { Alert, Platform } from 'react-native';

const isWeb = Platform.OS === 'web';

export function showMessage(message: string) {
  if (isWeb && typeof window !== 'undefined') {
    window.alert(message);
    return;
  }

  Alert.alert(message);
}

export function confirmDestructive(
  title: string,
  message: string,
  confirmLabel: string,
  cancelLabel: string,
): Promise<boolean> {
  if (isWeb) {
    if (typeof window === 'undefined') return Promise.resolve(false);
    return Promise.resolve(window.confirm(`${title}\n\n${message}`.trim()));
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      {
        text: confirmLabel,
        style: 'destructive',
        onPress: () => resolve(true),
      },
    ]);
  });
}
