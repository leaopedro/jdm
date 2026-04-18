import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { resendVerifyRequest } from '~/api/auth';
import { useAuth } from '~/auth/context';
import { Button } from '~/components/Button';
import { authCopy } from '~/copy/auth';
import { theme } from '~/theme';

export default function VerifyEmailPendingScreen() {
  const { user, logout, refreshUser } = useAuth();
  const [pending, setPending] = useState(false);

  const onResend = async () => {
    if (!user) return;
    setPending(true);
    try {
      await resendVerifyRequest({ email: user.email });
      Alert.alert(authCopy.verifyPending.resent);
    } finally {
      setPending(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{authCopy.verifyPending.title}</Text>
      <Text style={styles.body}>{user ? authCopy.verifyPending.body(user.email) : ''}</Text>
      <Button
        label={pending ? authCopy.common.loading : authCopy.verifyPending.resend}
        onPress={() => void onResend()}
      />
      <Button label={authCopy.common.cancel} onPress={() => void logout()} />
      <Button label={authCopy.common.continue} onPress={() => void refreshUser()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
    justifyContent: 'center',
  },
  title: { color: theme.colors.fg, fontSize: theme.font.size.xxl, fontWeight: '700' },
  body: { color: theme.colors.muted, fontSize: theme.font.size.md },
});
