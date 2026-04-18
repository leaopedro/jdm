import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '~/auth/context';
import { Button } from '~/components/Button';
import { theme } from '~/theme';

export default function WelcomeScreen() {
  const { user, logout } = useAuth();
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Olá, {user?.name ?? 'piloto'}</Text>
      <Text style={styles.body}>Você está dentro. Em breve, eventos e ingressos.</Text>
      <Button label="Sair" onPress={() => void logout()} />
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
