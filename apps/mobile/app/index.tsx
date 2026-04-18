import { Redirect } from 'expo-router';

import { useAuth } from '~/auth/context';

export default function Index() {
  const auth = useAuth();
  if (auth.status === 'loading') return null;
  if (auth.status === 'authenticated') return <Redirect href="/welcome" />;
  return <Redirect href="/login" />;
}
