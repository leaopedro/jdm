import type { EventDetail } from '@jdm/shared/events';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { getEvent } from '~/api/events';
import { Button } from '~/components/Button';
import { eventsCopy } from '~/copy/events';
import { formatBRL, formatEventDateRange } from '~/lib/format';
import { theme } from '~/theme';

export default function EventDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug || typeof slug !== 'string') return;
    void (async () => {
      try {
        setEvent(await getEvent(slug));
      } catch {
        setError(eventsCopy.errors.notFound);
      }
    })();
  }, [slug]);

  const openMap = (e: EventDetail) => {
    const q = encodeURIComponent(`${e.venueName}, ${e.venueAddress}`);
    const url = `https://www.google.com/maps/search/?api=1&query=${q}&ll=${e.lat},${e.lng}`;
    void Linking.openURL(url);
  };

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }
  if (!event) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {event.coverUrl ? (
        <Image source={{ uri: event.coverUrl }} style={styles.cover} />
      ) : (
        <View style={[styles.cover, styles.coverPlaceholder]} />
      )}
      <View style={styles.section}>
        <Text style={styles.title}>{event.title}</Text>
        <Text style={styles.sub}>{formatEventDateRange(event.startsAt, event.endsAt)}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.h2}>{eventsCopy.detail.venue}</Text>
        <Text style={styles.body}>{event.venueName}</Text>
        <Text style={styles.sub}>
          {event.venueAddress} - {event.city}/{event.stateCode}
        </Text>
        <Pressable onPress={() => openMap(event)} style={styles.mapButton}>
          <Text style={styles.mapLabel}>{eventsCopy.detail.openMaps}</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.body}>{event.description}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.h2}>{eventsCopy.detail.tiers}</Text>
        {event.tiers.map((t) => {
          const soldOut = t.remainingCapacity === 0;
          return (
            <View key={t.id} style={styles.tier}>
              <View style={styles.tierTop}>
                <Text style={styles.tierName}>{t.name}</Text>
                <Text style={styles.tierPrice}>{formatBRL(t.priceCents)}</Text>
              </View>
              <Text style={styles.sub}>
                {soldOut
                  ? eventsCopy.detail.soldOut
                  : `${t.remainingCapacity} ${eventsCopy.detail.remaining}`}
              </Text>
            </View>
          );
        })}
      </View>

      <View style={styles.section}>
        <Button label={eventsCopy.detail.buyDisabled} onPress={() => undefined} disabled />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingBottom: theme.spacing.xl, backgroundColor: theme.colors.bg },
  center: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cover: { width: '100%', height: 220 },
  coverPlaceholder: { backgroundColor: theme.colors.border },
  section: { padding: theme.spacing.lg, gap: theme.spacing.xs },
  title: { color: theme.colors.fg, fontSize: theme.font.size.lg, fontWeight: '700' },
  h2: { color: theme.colors.fg, fontSize: theme.font.size.md, fontWeight: '600' },
  body: { color: theme.colors.fg, fontSize: theme.font.size.md },
  sub: { color: theme.colors.muted },
  error: { color: theme.colors.muted },
  mapButton: {
    marginTop: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.border,
    alignSelf: 'flex-start',
  },
  mapLabel: { color: theme.colors.fg },
  tier: {
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    gap: theme.spacing.xs,
  },
  tierTop: { flexDirection: 'row', justifyContent: 'space-between' },
  tierName: { color: theme.colors.fg, fontWeight: '600' },
  tierPrice: { color: theme.colors.fg },
});
