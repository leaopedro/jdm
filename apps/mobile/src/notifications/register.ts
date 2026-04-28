import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const projectId = (): string | undefined => {
  const extra = (Constants.expoConfig?.extra ?? {}) as { eas?: { projectId?: string } };
  return extra.eas?.projectId && extra.eas.projectId.length > 0 ? extra.eas.projectId : undefined;
};

export type RegisterResult =
  | { ok: true; token: string; platform: 'ios' | 'android' }
  | { ok: false; reason: 'simulator' | 'no-project-id' | 'sdk-error' };

export const registerExpoPushToken = async (): Promise<RegisterResult> => {
  if (!Device.isDevice) return { ok: false, reason: 'simulator' };
  const id = projectId();
  if (!id) return { ok: false, reason: 'no-project-id' };
  try {
    const result = await Notifications.getExpoPushTokenAsync({ projectId: id });
    const platform: 'ios' | 'android' = Platform.OS === 'ios' ? 'ios' : 'android';
    return { ok: true, token: result.data, platform };
  } catch {
    return { ok: false, reason: 'sdk-error' };
  }
};
