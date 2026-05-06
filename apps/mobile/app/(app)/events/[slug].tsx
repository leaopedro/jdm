import type { EventDetailCommerce, EventDetailPublic, TicketTier } from '@jdm/shared/events';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, ShoppingCart, Ticket as TicketIcon } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { getEvent, getEventCommerce } from '~/api/events';
import { getMyTicketForEvent } from '~/api/tickets';
import { useAuth } from '~/auth/context';
import { buildLoginHref } from '~/auth/redirect-intent';
import { useCart } from '~/cart/context';
import { Button } from '~/components/Button';
import { cartCopy } from '~/copy/cart';
import { eventsCopy } from '~/copy/events';
import { ticketsCopy } from '~/copy/tickets';
import { formatBRL, formatEventDateRange } from '~/lib/format';
import { theme } from '~/theme';

export default function EventDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const [publicEvent, setPublicEvent] = useState<EventDetailPublic | null>(null);
  const [commerceEvent, setCommerceEvent] = useState<EventDetailCommerce | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const [hasTicket, setHasTicket] = useState(false);
  const { addItem, adding } = useCart();
  const { status: authStatus } = useAuth();
  const isAnon = authStatus === 'unauthenticated';
  const isAuthed = authStatus === 'authenticated';

  const requireLogin = (next: string) => {
    router.push(buildLoginHref(next) as never);
  };

  useEffect(() => {
    if (!slug || typeof slug !== 'string') return;
    void (async () => {
      try {
        setPublicEvent(await getEvent(slug));
      } catch {
        setError(eventsCopy.errors.notFound);
      }
    })();
  }, [slug]);

  useEffect(() => {
    if (!slug || typeof slug !== 'string') return;
    if (!isAuthed) {
      setCommerceEvent(null);
      return;
    }
    void (async () => {
      try {
        setCommerceEvent(await getEventCommerce(slug));
      } catch {
        setCommerceEvent(null);
      }
    })();
  }, [slug, isAuthed]);

  const event: EventDetailPublic | EventDetailCommerce | null = commerceEvent ?? publicEvent;

  useEffect(() => {
    if (!event || isAnon || authStatus === 'loading') {
      setHasTicket(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const ticket = await getMyTicketForEvent(event.id);
        if (!cancelled) setHasTicket(ticket !== null);
      } catch {
        if (!cancelled) setHasTicket(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [event, isAnon, authStatus]);

  const openMap = (e: EventDetailPublic) => {
    const parts = [e.venueName, e.venueAddress, e.city, e.stateCode].filter(Boolean);
    if (parts.length === 0) return;
    const q = encodeURIComponent(parts.join(', '));
    void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`);
  };

  const addToCart = async (tier: TicketTier) => {
    if (!commerceEvent) return;
    if (tier.requiresCar) {
      router.push({
        pathname: '/cart/car-plate',
        params: { eventId: commerceEvent.id, tierId: tier.id },
      } as never);
      return;
    }
    const ok = await addItem({
      eventId: commerceEvent.id,
      tierId: tier.id,
      source: 'purchase',
      kind: 'ticket',
      quantity: 1,
      tickets: [{ extras: [] }],
      metadata: { source: 'mobile' },
    });
    if (ok) {
      router.push('/cart' as never);
    } else {
      Alert.alert(cartCopy.errors.add);
    }
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

  const selectedTier = commerceEvent?.tiers.find((t) => t.id === selectedTierId) ?? null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View>
        {event.coverUrl ? (
          <Image source={{ uri: event.coverUrl }} style={styles.cover} accessible={false} />
        ) : (
          <View style={[styles.cover, styles.coverPlaceholder]} />
        )}
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/events'))}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          hitSlop={8}
          style={styles.backButton}
        >
          <ArrowLeft color="#F5F5F5" size={22} strokeWidth={2} />
        </Pressable>
      </View>
      <View style={styles.section}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={3}>
            {event.title}
          </Text>
          {hasTicket ? (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/tickets',
                  params: { eventId: event.id },
                } as never)
              }
              accessibilityRole="button"
              accessibilityLabel={eventsCopy.detail.viewMyTickets}
              style={styles.viewTicketsBtn}
              hitSlop={8}
            >
              <TicketIcon color={theme.colors.bg} size={14} strokeWidth={2} />
              <Text style={styles.viewTicketsText}>{eventsCopy.detail.viewMyTickets}</Text>
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.sub}>{formatEventDateRange(event.startsAt, event.endsAt)}</Text>
      </View>

      {(() => {
        const locationLine = [event.venueAddress, event.city, event.stateCode]
          .filter(Boolean)
          .join(', ');
        const hasAny = event.venueName || locationLine;
        if (!hasAny) return null;
        return (
          <View style={styles.section}>
            <Text style={styles.h2}>{eventsCopy.detail.venue}</Text>
            {event.venueName ? <Text style={styles.body}>{event.venueName}</Text> : null}
            {locationLine ? <Text style={styles.sub}>{locationLine}</Text> : null}
            <Pressable
              onPress={() => openMap(event)}
              style={styles.mapButton}
              accessibilityRole="button"
              accessibilityLabel={eventsCopy.detail.openMaps}
              accessibilityHint="Opens location in Maps"
            >
              <Text style={styles.mapLabel}>{eventsCopy.detail.openMaps}</Text>
            </Pressable>
          </View>
        );
      })()}

      <View style={styles.section}>
        <Text style={styles.body}>{event.description}</Text>
      </View>

      {commerceEvent ? (
        <View style={styles.section}>
          <Text style={styles.h2}>{ticketsCopy.purchase.pickTier}</Text>
          {commerceEvent.tiers.map((t) => {
            const soldOut = t.remainingCapacity === 0;
            const isSelected = selectedTierId === t.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => !soldOut && setSelectedTierId(t.id)}
                disabled={soldOut}
                style={[
                  styles.tier,
                  isSelected && styles.tierSelected,
                  soldOut && styles.tierDisabled,
                ]}
                accessibilityRole="radio"
                accessibilityLabel={`${t.name}, ${formatBRL(t.priceCents)}`}
                accessibilityState={{ selected: isSelected, disabled: soldOut }}
                accessibilityHint={soldOut ? undefined : 'Select this ticket tier'}
              >
                <View style={styles.tierTop}>
                  <Text style={styles.tierName}>{t.name}</Text>
                  <Text style={styles.tierPrice}>{formatBRL(t.priceCents)}</Text>
                </View>
                <Text style={styles.sub}>
                  {soldOut
                    ? ticketsCopy.purchase.soldOut
                    : `${t.remainingCapacity} ${eventsCopy.detail.remaining}`}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={styles.section}>
        <Button
          label={ticketsCopy.purchase.confirm}
          onPress={() => {
            if (isAnon) {
              requireLogin(`/events/buy/${event.slug}`);
              return;
            }
            if (!selectedTier) return;
            router.push(`/events/buy/${event.slug}?tierId=${selectedTier.id}` as never);
          }}
          disabled={isAuthed && !selectedTier}
        />
      </View>

      {commerceEvent && selectedTier && (
        <View style={styles.section}>
          <Pressable
            onPress={() => void addToCart(selectedTier)}
            disabled={adding}
            style={[styles.addToCartBtn, adding && styles.addToCartDisabled]}
            accessibilityRole="button"
            accessibilityLabel={cartCopy.actions.addToCart}
          >
            <ShoppingCart color={theme.colors.fg} size={18} strokeWidth={1.75} />
            <Text style={styles.addToCartText}>
              {adding ? cartCopy.actions.adding : cartCopy.actions.addToCart}
            </Text>
          </Pressable>
        </View>
      )}
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
  backButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(10, 10, 10, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: { padding: theme.spacing.lg, gap: theme.spacing.xs },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  title: {
    color: theme.colors.fg,
    fontSize: theme.font.size.lg,
    fontWeight: '700',
    flex: 1,
    flexShrink: 1,
  },
  viewTicketsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: 999,
    backgroundColor: theme.colors.fg,
  },
  viewTicketsText: {
    color: theme.colors.bg,
    fontSize: theme.font.size.sm,
    fontWeight: '600',
  },
  h2: {
    color: theme.colors.fg,
    fontSize: theme.font.size.md,
    fontWeight: '600',
    marginBottom: theme.spacing.md,
  },
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
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
  },
  tierSelected: { borderColor: theme.colors.fg, borderWidth: 2 },
  tierDisabled: { opacity: 0.5 },
  tierTop: { flexDirection: 'row', justifyContent: 'space-between' },
  tierName: { color: theme.colors.fg, fontWeight: '600' },
  tierPrice: { color: theme.colors.fg },
  addToCartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  addToCartDisabled: { opacity: 0.5 },
  addToCartText: { color: theme.colors.fg, fontSize: theme.font.size.md, fontWeight: '500' },
});
