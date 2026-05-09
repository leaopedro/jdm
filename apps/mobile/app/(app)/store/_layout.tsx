import { Redirect, Stack } from 'expo-router';

import { useAuth } from '~/auth/context';
import { useStoreAvailability } from '~/store/runtime-context';

export default function StoreLayout() {
  const auth = useAuth();
  const storeAvailable = useStoreAvailability();

  if (!storeAvailable) {
    return <Redirect href={(auth.status === 'authenticated' ? '/tickets' : '/events') as never} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
