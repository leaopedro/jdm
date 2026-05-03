import type { EventDetail } from '@jdm/shared/events';
import type { EventExtraPublic } from '@jdm/shared/extras';
import type { MyTicket } from '@jdm/shared/tickets';
import { ArrowLeft } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { ApiError } from '~/api/client';
import { createOrder } from '~/api/orders';
import { Button } from '~/components/Button';
import { buyCopy } from '~/copy/buy';
import { formatBRL } from '~/lib/format';
import { theme } from '~/theme';

interface SelectedExtra {
  id: string;
  name: string;
  priceCents: number;
}

interface Props {
  event: EventDetail;
  existingTicket: MyTicket;
  onPayment: (clientSecret: string) => void;
  onBack: () => void;
}

function resolveConflictMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return buyCopy.extrasOnly.errorGeneric;
  const body = err.body as { message?: string } | null;
  const msg = body?.message ?? '';
  if (err.status === 409 && msg.includes('sold out')) return buyCopy.extrasOnly.errorSoldOut;
  if (err.status === 409 && msg.includes('already purchased'))
    return buyCopy.extrasOnly.errorAlreadyOwned;
  return buyCopy.extrasOnly.errorGeneric;
}

export function ExtrasOnlyCheckout({ event, existingTicket, onPayment, onBack }: Props) {
  const [selected, setSelected] = useState<Map<string, SelectedExtra>>(() => new Map());
  const [submitting, setSubmitting] = useState(false);

  const tierId =
    event.tiers.find((t) => t.name === existingTicket.tierName)?.id ?? event.tiers[0]?.id ?? '';

  const totalCents = Array.from(selected.values()).reduce((sum, e) => sum + e.priceCents, 0);

  const toggle = useCallback((extra: EventExtraPublic) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(extra.id)) {
        next.delete(extra.id);
      } else {
        next.set(extra.id, { id: extra.id, name: extra.name, priceCents: extra.priceCents });
      }
      return next;
    });
  }, []);

  const handleSubmit = async () => {
    if (selected.size === 0) {
      Alert.alert(buyCopy.review.errorTitle, buyCopy.extrasOnly.selectAtLeast);
      return;
    }
    setSubmitting(true);
    try {
      const order = await createOrder({
        eventId: event.id,
        tierId,
        quantity: 1,
        method: 'card',
        tickets: [{ extras: Array.from(selected.keys()) }],
      });
      onPayment(order.clientSecret);
    } catch (err) {
      Alert.alert(buyCopy.review.errorTitle, resolveConflictMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const ownedExtraIds = new Set(existingTicket.extras.map((e) => e.extraName));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          hitSlop={8}
        >
          <ArrowLeft color={theme.colors.fg} size={20} />
        </Pressable>
        <Text style={styles.title}>{buyCopy.extrasOnly.title}</Text>
      </View>

      <View style={styles.banner}>
        <Text style={styles.bannerText}>{buyCopy.extrasOnly.banner}</Text>
        <Text style={styles.bannerSub}>
          {buyCopy.extrasOnly.bannerSub(existingTicket.tierName)}
        </Text>
      </View>

      {event.extras.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>{buyCopy.extrasOnly.emptyExtras}</Text>
        </View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {event.extras.map((extra) => {
            const soldOut = extra.quantityRemaining === 0;
            const alreadyOwned = ownedExtraIds.has(extra.name);
            const disabled = soldOut || alreadyOwned;
            const isSelected = selected.has(extra.id);

            return (
              <Pressable
                key={extra.id}
                style={[styles.extraCard, disabled && styles.disabled]}
                onPress={() => !disabled && toggle(extra)}
                disabled={disabled}
                accessibilityRole="switch"
                accessibilityState={{ checked: isSelected, disabled }}
              >
                <View style={styles.extraInfo}>
                  <Text style={styles.extraName}>{extra.name}</Text>
                  {extra.description ? (
                    <Text style={styles.extraDesc} numberOfLines={2}>
                      {extra.description}
                    </Text>
                  ) : null}
                  <View style={styles.extraMeta}>
                    <Text style={styles.extraPrice}>{formatBRL(extra.priceCents)}</Text>
                    {alreadyOwned ? (
                      <Text style={styles.ownedBadge}>Adquirido</Text>
                    ) : soldOut ? (
                      <Text style={styles.soldOut}>{buyCopy.extras.soldOut}</Text>
                    ) : extra.quantityRemaining != null ? (
                      <Text style={styles.remaining}>
                        {buyCopy.extras.remaining(extra.quantityRemaining)}
                      </Text>
                    ) : null}
                  </View>
                </View>
                <Switch
                  value={isSelected}
                  onValueChange={() => toggle(extra)}
                  disabled={disabled}
                  trackColor={{ false: theme.colors.border, true: theme.colors.accent }}
                  thumbColor={theme.colors.fg}
                />
              </Pressable>
            );
          })}

          {selected.size > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{buyCopy.review.total}</Text>
              <Text style={styles.totalValue}>{formatBRL(totalCents)}</Text>
            </View>
          )}
        </ScrollView>
      )}

      <View style={styles.footer}>
        <Button
          label={submitting ? buyCopy.review.submitting : buyCopy.extrasOnly.pay}
          onPress={() => void handleSubmit()}
          disabled={submitting || selected.size === 0}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: {
    color: theme.colors.fg,
    fontSize: theme.font.size.md,
    fontWeight: '600',
    flex: 1,
  },
  banner: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 14,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.border,
    gap: 4,
  },
  bannerText: { color: theme.colors.fg, fontSize: theme.font.size.sm, fontWeight: '600' },
  bannerSub: { color: theme.colors.muted, fontSize: theme.font.size.sm },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText: { color: theme.colors.muted, textAlign: 'center' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 10, paddingBottom: 100 },
  extraCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    gap: 12,
  },
  disabled: { opacity: 0.4 },
  extraInfo: { flex: 1, gap: 4 },
  extraName: { color: theme.colors.fg, fontSize: theme.font.size.md, fontWeight: '600' },
  extraDesc: { color: theme.colors.muted, fontSize: theme.font.size.sm },
  extraMeta: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  extraPrice: { color: theme.colors.fg, fontSize: theme.font.size.sm, fontWeight: '600' },
  soldOut: { color: theme.colors.accent, fontSize: theme.font.size.sm, fontWeight: '600' },
  ownedBadge: { color: theme.colors.muted, fontSize: theme.font.size.sm, fontStyle: 'italic' },
  remaining: { color: theme.colors.muted, fontSize: theme.font.size.sm },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    marginTop: 8,
  },
  totalLabel: { color: theme.colors.fg, fontSize: theme.font.size.md, fontWeight: '600' },
  totalValue: { color: theme.colors.fg, fontSize: theme.font.size.md, fontWeight: '700' },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
});
