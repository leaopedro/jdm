import { prisma } from '@jdm/db';
import { STORE_SETTINGS_SINGLETON_ID } from '@jdm/shared/store';

export const ensureStoreSettings = async () => {
  return prisma.storeSettings.upsert({
    where: { id: STORE_SETTINGS_SINGLETON_ID },
    update: {},
    create: { id: STORE_SETTINGS_SINGLETON_ID },
  });
};
