import type { MyTicket } from '@jdm/shared/tickets';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { listMyTickets } from '~/api/tickets';
import { ticketsCopy } from '~/copy/tickets';
import { formatEventDateRange } from '~/lib/format';
import { theme } from '~/theme';

const statusLabel = (status: MyTicket['status']): string => {
  if (status === 'valid') return ticketsCopy.detail.valid;
  if (status === 'used') return ticketsCopy.detail.used;
  return ticketsCopy.detail.revoked;
};

export default function TicketsIndex() {
  const router = useRouter();
  const [items, setItems] = useState<MyTicket[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const res = await listMyTickets();
    setItems(res.items);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  if (items === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>{ticketsCopy.list.empty}</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(t) => t.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
      renderItem={({ item }) => (
        <Pressable style={styles.card} onPress={() => router.push(`/tickets/${item.id}` as never)}>
          <Text style={styles.title}>{item.event.title}</Text>
          <Text style={styles.sub}>
            {formatEventDateRange(item.event.startsAt, item.event.endsAt)}
          </Text>
          <Text style={styles.sub}>{item.tierName}</Text>
          <Text style={[styles.status, item.status !== 'valid' && styles.statusMuted]}>
            {statusLabel(item.status)}
          </Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bg,
  },
  empty: { color: theme.colors.muted },
  list: { gap: theme.spacing.md, padding: theme.spacing.md, backgroundColor: theme.colors.bg },
  card: {
    backgroundColor: theme.colors.border,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  title: { color: theme.colors.fg, fontSize: theme.font.size.md, fontWeight: '600' },
  sub: { color: theme.colors.muted },
  status: { color: theme.colors.fg, fontWeight: '600', marginTop: theme.spacing.xs },
  statusMuted: { color: theme.colors.muted },
});
