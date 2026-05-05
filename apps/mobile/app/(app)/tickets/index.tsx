import type { MyTicket } from '@jdm/shared/tickets';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { listMyTickets } from '~/api/tickets';
import { ticketsCopy } from '~/copy/tickets';
import { formatEventDateRange } from '~/lib/format';
import { theme } from '~/theme';

type TicketFilter = 'all' | 'valid' | 'used' | 'expired';

const FILTERS: TicketFilter[] = ['all', 'valid', 'used', 'expired'];

const statusLabel = (status: MyTicket['status']): string => {
  if (status === 'valid') return ticketsCopy.detail.valid;
  if (status === 'used') return ticketsCopy.detail.used;
  return ticketsCopy.detail.revoked;
};

function isExpired(ticket: MyTicket): boolean {
  return (
    ticket.status === 'revoked' ||
    (ticket.status === 'valid' && new Date(ticket.event.endsAt) < new Date())
  );
}

function applyFilter(items: MyTicket[], filter: TicketFilter): MyTicket[] {
  switch (filter) {
    case 'valid':
      return items.filter((t) => t.status === 'valid' && !isExpired(t));
    case 'used':
      return items.filter((t) => t.status === 'used');
    case 'expired':
      return items.filter(isExpired);
    default:
      return items;
  }
}

export default function TicketsIndex() {
  const router = useRouter();
  const [items, setItems] = useState<MyTicket[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<TicketFilter>('valid');

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

  const filtered = useMemo(() => (items ? applyFilter(items, filter) : null), [items, filter]);

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
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {FILTERS.map((f) => {
          const active = filter === f;
          return (
            <Pressable
              key={f}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setFilter(f)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={ticketsCopy.filters[f]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {ticketsCopy.filters[f]}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {filtered!.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.empty}>{ticketsCopy.list.emptyFilter}</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() =>
                router.push({
                  pathname: '/tickets/[ticketId]',
                  params: { ticketId: item.id, ticket: JSON.stringify(item) },
                } as never)
              }
              accessibilityRole="button"
              accessibilityLabel={`${item.event.title}, ${item.tierName}, ${statusLabel(item.status)}`}
              accessibilityHint="Opens ticket QR code"
            >
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
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.bg,
  },
  empty: { color: theme.colors.muted },
  filterRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  chip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'transparent',
  },
  chipActive: {
    backgroundColor: theme.colors.fg,
    borderColor: theme.colors.fg,
  },
  chipText: {
    color: theme.colors.muted,
    fontSize: theme.font.size.sm,
    fontWeight: '500',
  },
  chipTextActive: {
    color: theme.colors.bg,
    fontWeight: '600',
  },
  list: { gap: theme.spacing.md, padding: theme.spacing.md },
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
