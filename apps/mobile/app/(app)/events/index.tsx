import type { EventSummary, EventWindow } from '@jdm/shared/events';
import type { PublicProfile } from '@jdm/shared/profile';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { listEvents } from '~/api/events';
import { getProfile } from '~/api/profile';
import { eventsCopy } from '~/copy/events';
import { formatEventDateRange } from '~/lib/format';
import { theme } from '~/theme';

type TabKey = 'upcoming' | 'past' | 'nearby';
type StateCode = NonNullable<PublicProfile['stateCode']>;

const windowFor = (tab: TabKey): EventWindow => (tab === 'past' ? 'past' : 'upcoming');

export default function EventsIndex() {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>('upcoming');
  const [items, setItems] = useState<EventSummary[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myState, setMyState] = useState<StateCode | null | undefined>(undefined);

  const load = useCallback(
    async (nextTab: TabKey) => {
      if (nextTab === 'nearby' && myState === null) {
        setItems([]);
        setError(null);
        return;
      }
      try {
        const stateCode = nextTab === 'nearby' ? (myState ?? undefined) : undefined;
        const res = await listEvents({
          window: windowFor(nextTab),
          stateCode,
        });
        setItems(res.items);
        setError(null);
      } catch {
        setItems([]);
        setError(eventsCopy.errors.load);
      }
    },
    [myState],
  );

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        if (myState === undefined) {
          try {
            const me = await getProfile();
            setMyState(me.stateCode);
          } catch {
            setMyState(null);
          }
        }
        await load(tab);
      })();
    }, [tab, load, myState]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load(tab);
    } finally {
      setRefreshing(false);
    }
  }, [load, tab]);

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        {(['upcoming', 'past', 'nearby'] as TabKey[]).map((t) => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            style={[styles.tab, tab === t && styles.tabActive]}
            accessibilityRole="tab"
            accessibilityLabel={eventsCopy.tabs[t]}
            accessibilityState={{ selected: tab === t }}
          >
            <Text style={[styles.tabLabel, tab === t && styles.tabLabelActive]}>
              {eventsCopy.tabs[t]}
            </Text>
          </Pressable>
        ))}
      </View>

      {items === null ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.empty}>{error}</Text>
          <Pressable
            onPress={() => void load(tab)}
            style={styles.retry}
            accessibilityRole="button"
            accessibilityLabel={eventsCopy.list.retry}
          >
            <Text style={styles.retryLabel}>{eventsCopy.list.retry}</Text>
          </Pressable>
        </View>
      ) : tab === 'nearby' && myState === null ? (
        <View style={styles.center}>
          <Text style={styles.empty}>{eventsCopy.list.noLocation}</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.empty}>{eventsCopy.list.empty}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(e) => e.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                void onRefresh();
              }}
            />
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() => router.push(`/events/${item.slug}` as never)}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}, ${formatEventDateRange(item.startsAt, item.endsAt)}`}
              accessibilityHint="Opens event details"
            >
              {item.coverUrl ? (
                <Image source={{ uri: item.coverUrl }} style={styles.cover} accessible={false} />
              ) : (
                <View style={[styles.cover, styles.coverPlaceholder]} />
              )}
              <View style={styles.cardText}>
                <Text style={styles.title}>{item.title}</Text>
                <Text style={styles.sub}>{formatEventDateRange(item.startsAt, item.endsAt)}</Text>
                {(() => {
                  const line = [
                    item.venueName,
                    [item.city, item.stateCode].filter(Boolean).join('/'),
                  ]
                    .filter(Boolean)
                    .join(', ');
                  return line ? <Text style={styles.sub}>{line}</Text> : null;
                })()}
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  tabs: {
    flexDirection: 'row',
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  tab: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.border,
  },
  tabActive: { backgroundColor: theme.colors.fg },
  tabLabel: { color: theme.colors.fg },
  tabLabelActive: { color: theme.colors.bg, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { color: theme.colors.muted },
  list: { gap: theme.spacing.md, padding: theme.spacing.md },
  card: {
    backgroundColor: theme.colors.border,
    borderRadius: theme.radii.md,
    overflow: 'hidden',
  },
  cover: { width: '100%', height: 160 },
  coverPlaceholder: { backgroundColor: theme.colors.muted },
  cardText: { padding: theme.spacing.md, gap: theme.spacing.xs },
  title: { color: theme.colors.fg, fontSize: theme.font.size.md, fontWeight: '600' },
  sub: { color: theme.colors.muted },
  retry: {
    marginTop: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.border,
  },
  retryLabel: { color: theme.colors.fg, fontWeight: '600' },
});
