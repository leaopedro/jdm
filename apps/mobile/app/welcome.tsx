import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '~/auth/context';
import { Button } from '~/components/Button';
import { authCopy } from '~/copy/auth';
import { theme } from '~/theme';

export default function WelcomeScreen() {
  const { user, logout } = useAuth();
  const name = user?.name ?? authCopy.welcome.fallbackName;
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{authCopy.welcome.greeting(name)}</Text>
      <Text style={styles.body}>{authCopy.welcome.body}</Text>
      <Button label={authCopy.common.logout} onPress={() => void logout()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
    backgroundColor: theme.colors.bg,
    justifyContent: 'center',
  },
  title: { color: theme.colors.fg, fontSize: theme.font.size.xxl, fontWeight: '700' },
  body: { color: theme.colors.muted, fontSize: theme.font.size.md },
});
