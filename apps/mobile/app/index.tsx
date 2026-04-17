import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { api, ApiError } from '~/api/client';
import { Button } from '~/components/Button';
import { theme } from '~/theme';

type HealthState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; sha: string; uptime: number }
  | { kind: 'error'; message: string };

export default function HomeScreen() {
  const [state, setState] = useState<HealthState>({ kind: 'idle' });

  const check = async () => {
    setState({ kind: 'loading' });
    try {
      const result = await api.health();
      setState({ kind: 'ok', sha: result.sha, uptime: result.uptimeSeconds });
    } catch (err) {
      const message = err instanceof ApiError ? `HTTP ${err.status}` : 'Network error';
      setState({ kind: 'error', message });
    }
  };

  useEffect(() => {
    void check();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>JDM Experience</Text>
      <Text style={styles.subtitle}>API health</Text>
      {state.kind === 'loading' && <Text style={styles.body}>Checking…</Text>}
      {state.kind === 'ok' && (
        <Text style={styles.body}>
          OK · sha {state.sha} · up {state.uptime}s
        </Text>
      )}
      {state.kind === 'error' && <Text style={styles.error}>Error: {state.message}</Text>}
      <Button label="Re-check" onPress={() => void check()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: theme.spacing.xl,
    justifyContent: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.bg,
  },
  title: { color: theme.colors.fg, fontSize: theme.font.size.xxl, fontWeight: '700' },
  subtitle: { color: theme.colors.muted, fontSize: theme.font.size.md },
  body: { color: theme.colors.fg, fontSize: theme.font.size.lg },
  error: { color: theme.colors.accent, fontSize: theme.font.size.lg },
});
