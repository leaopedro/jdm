import type { Env } from '../../env.js';

import { DevPushSender } from './dev.js';
import { ExpoPushSender } from './expo.js';
import type { PushSender } from './types.js';

export type { PushSender, PushMessage, PushSendResult, PushSendOutcome } from './types.js';
export { DevPushSender } from './dev.js';

export const buildPushSender = (env: Env): PushSender => {
  if (env.NODE_ENV === 'production') {
    return new ExpoPushSender(env.EXPO_ACCESS_TOKEN);
  }
  return new DevPushSender();
};
