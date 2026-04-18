import { Redirect } from 'expo-router';

export default function Index() {
  // Gate in _layout.tsx redirects loading/unauthenticated/verify-pending cases
  // before this ever mounts. Reaching here means the user is authenticated
  // and email-verified, so send them to /welcome.
  return <Redirect href="/welcome" />;
}
