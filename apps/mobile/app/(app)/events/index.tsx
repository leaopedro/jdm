import type { EventSummary, EventWindow } from '@jdm/shared/events';
import type { PublicProfile } from '@jdm/shared/profile';
import { Badge, Button, Text } from '@jdm/ui';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, FlatList, Image, Pressable, RefreshControl, View } from 'react-native';

import { listEvents } from '~/api/events';
import { getProfile } from '~/api/profile';
import { eventsCopy } from '~/copy/events';
import { formatEventDateRange } from '~/lib/format';

type TabKey = 'upcoming' | 'past' | 'nearby';
type StateCode = NonNullable<PublicProfile['stateCode']>;

const TABS: TabKey[] = ['upcoming', 'past', 'nearby'];

const BRAND_RED = '#E10600';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const windowFor = (tab: TabKey): EventWindow => (tab === 'past' ? 'past' : 'upcoming');

const isSoon = (startsAtIso: string): boolean => {
  const start = new Date(startsAtIso).getTime();
  const now = Date.now();
  const delta = start - now;
  return delta > 0 && delta < SEVEN_DAYS_MS;
};

const buildLocationLine = (item: EventSummary): string => {
  const place = [item.city, item.stateCode].filter(Boolean).join('/');
  return [item.venueName, place].filter(Boolean).join(' · ');
};

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

  const onSelectTab = (next: TabKey) => {
    if (next === tab) return;
    setTab(next);
    setItems(null);
    setError(null);
  };

  const showLoading = items === null;
  const showError = !showLoading && error !== null;
  const showNoLocation = !showLoading && !showError && tab === 'nearby' && myState === null;
  const showEmpty = !showLoading && !showError && !showNoLocation && (items?.length ?? 0) === 0;
  const showList = !showLoading && !showError && !showNoLocation && !showEmpty;

  return (
    <View className="flex-1 bg-bg">
      <Header />
      <Tabs active={tab} onSelect={onSelectTab} />

      {showLoading ? (
        <LoadingSkeleton />
      ) : showError ? (
        <ErrorState onRetry={() => void load(tab)} />
      ) : showNoLocation ? (
        <NoLocationState onEditProfile={() => router.push('/profile' as never)} />
      ) : showEmpty ? (
        <EmptyState />
      ) : showList && items ? (
        <FlatList
          data={items}
          keyExtractor={(e) => e.id}
          contentContainerClassName="px-5 pt-2 pb-8 gap-6"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                void onRefresh();
              }}
              tintColor={BRAND_RED}
              colors={[BRAND_RED]}
            />
          }
          renderItem={({ item }) => (
            <EventCard item={item} onPress={() => router.push(`/events/${item.slug}` as never)} />
          )}
        />
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

function Header() {
  return (
    <View className="px-5 pt-2 pb-4">
      <Text variant="eyebrow" tone="brand">
        {eventsCopy.header.eyebrow}
      </Text>
      <Text variant="h1" accessibilityRole="header" className="mt-1">
        {eventsCopy.header.title}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */

function Tabs({ active, onSelect }: { active: TabKey; onSelect: (t: TabKey) => void }) {
  return (
    <View className="flex-row px-5 gap-6 border-b border-border">
      {TABS.map((t) => {
        const isActive = active === t;
        return (
          <Pressable
            key={t}
            onPress={() => onSelect(t)}
            className="h-12 justify-center active:opacity-70"
            accessibilityRole="tab"
            accessibilityLabel={eventsCopy.tabs[t]}
            accessibilityState={{ selected: isActive }}
            hitSlop={8}
          >
            <Text
              variant="bodySm"
              weight={isActive ? 'bold' : 'medium'}
              tone={isActive ? 'brand' : 'muted'}
              className="uppercase tracking-widest"
            >
              {eventsCopy.tabs[t]}
            </Text>
            {isActive ? (
              <View className="absolute left-0 right-0 bottom-[-1px] h-[2px] bg-brand" />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Event card                                                          */
/* ------------------------------------------------------------------ */

function EventCard({ item, onPress }: { item: EventSummary; onPress: () => void }) {
  const soon = isSoon(item.startsAt);
  const dateLine = formatEventDateRange(item.startsAt, item.endsAt);
  const locationLine = buildLocationLine(item);

  return (
    <Pressable
      onPress={onPress}
      className="rounded-xl overflow-hidden bg-surface active:opacity-80"
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${dateLine}${locationLine ? `, ${locationLine}` : ''}`}
      accessibilityHint="Abre os detalhes do evento"
    >
      <View style={{ width: '100%', aspectRatio: 16 / 9 }} className="bg-surface-alt">
        {item.coverUrl ? (
          <Image
            source={{ uri: item.coverUrl }}
            style={{ width: '100%', height: '100%' }}
            accessible={false}
          />
        ) : null}

        <LinearGradient
          colors={['rgba(10,10,10,0)', 'rgba(10,10,10,0.85)']}
          locations={[0.45, 1]}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
          pointerEvents="none"
        />

        {soon ? (
          <View className="absolute top-3 left-3">
            <Badge label={eventsCopy.badges.soon} tone="brand" size="sm" />
          </View>
        ) : null}

        <View className="absolute left-4 right-4 bottom-3">
          <Text
            variant="h2"
            weight="bold"
            numberOfLines={2}
            className="font-display tracking-tight"
          >
            {item.title}
          </Text>
        </View>
      </View>

      <View className="px-4 py-3 gap-1">
        <Text variant="bodySm" tone="secondary">
          {dateLine}
        </Text>
        {locationLine ? (
          <Text variant="caption" tone="muted">
            {locationLine}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* States                                                              */
/* ------------------------------------------------------------------ */

function LoadingSkeleton() {
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <View
      className="px-5 pt-2 pb-8 gap-6"
      accessibilityLabel={eventsCopy.list.loading}
      accessibilityLiveRegion="polite"
    >
      {[0, 1, 2].map((i) => (
        <Animated.View key={i} style={{ opacity }} className="gap-3">
          <View className="w-full rounded-xl bg-surface-alt" style={{ aspectRatio: 16 / 9 }} />
          <View className="h-4 w-1/2 rounded-md bg-surface-alt" />
          <View className="h-3 w-1/3 rounded-md bg-surface-alt" />
        </Animated.View>
      ))}
    </View>
  );
}

function EmptyState() {
  return (
    <View className="flex-1 items-center justify-center px-8 gap-2">
      <Text variant="h3" className="text-center">
        {eventsCopy.list.empty}
      </Text>
      <Text variant="bodySm" tone="muted" className="text-center">
        {eventsCopy.list.emptyHint}
      </Text>
    </View>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <View className="flex-1 items-center justify-center px-8 gap-4">
      <View className="gap-2">
        <Text variant="h3" className="text-center">
          {eventsCopy.list.errorTitle}
        </Text>
        <Text variant="bodySm" tone="muted" className="text-center">
          {eventsCopy.list.errorHint}
        </Text>
      </View>
      <Button variant="secondary" label={eventsCopy.list.retry} onPress={onRetry} />
    </View>
  );
}

function NoLocationState({ onEditProfile }: { onEditProfile: () => void }) {
  return (
    <View className="flex-1 items-center justify-center px-8 gap-4">
      <Text variant="h3" className="text-center">
        {eventsCopy.list.noLocation}
      </Text>
      <Button variant="ghost" label={eventsCopy.list.noLocationCta} onPress={onEditProfile} />
    </View>
  );
}
