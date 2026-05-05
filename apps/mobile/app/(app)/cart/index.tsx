import type { CartItem } from '@jdm/shared/cart';
import type { EventExtraPublic } from '@jdm/shared/extras';
import { useRouter } from 'expo-router';
import { Car as CarIcon, ChevronRight, Trash2 } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { beginCheckout } from '~/api/cart';
import { getEventById } from '~/api/events';
import { useCart } from '~/cart/context';
import { Button } from '~/components/Button';
import { cartCopy } from '~/copy/cart';
import { formatBRL } from '~/lib/format';
import { ExtrasDrawer } from '~/screens/cart/ExtrasDrawer';
import { theme } from '~/theme';

const isWeb = Platform.OS === 'web';

function itemNeedsCar(item: CartItem): boolean {
  if (!item.requiresCar || item.kind !== 'ticket') return false;
  if (item.tickets.length === 0) return true;
  return item.tickets.some((t) => !t.carId || !t.licensePlate);
}

function firstTicketPlate(item: CartItem): string | undefined {
  return item.tickets[0]?.licensePlate;
}

function confirmDestructive(title: string, message: string): Promise<boolean> {
  if (isWeb) {
    if (typeof window === 'undefined') return Promise.resolve(false);
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: cartCopy.actions.clearNo, style: 'cancel', onPress: () => resolve(false) },
      {
        text: cartCopy.actions.clearYes,
        style: 'destructive',
        onPress: () => resolve(true),
      },
    ]);
  });
}

function getCheckoutReturnUrls(): { successUrl?: string; cancelUrl?: string } {
  if (!isWeb || typeof window === 'undefined') return {};
  const base = `${window.location.origin}/events/buy/checkout-return`;
  return {
    successUrl: base,
    cancelUrl: `${base}?cancelled=true`,
  };
}

export default function CartScreen() {
  const { cart, loading, error, itemCount, removeItem, clear, refresh } = useCart();
  const router = useRouter();
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [drawerItem, setDrawerItem] = useState<CartItem | null>(null);
  const [drawerExtras, setDrawerExtras] = useState<EventExtraPublic[]>([]);
  const [loadingExtras, setLoadingExtras] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  const handleRemove = useCallback(
    async (itemId: string) => {
      setRemovingId(itemId);
      await removeItem(itemId);
      setRemovingId(null);
    },
    [removeItem],
  );

  const handleClear = useCallback(async () => {
    const confirmed = await confirmDestructive(
      cartCopy.actions.clear,
      cartCopy.actions.clearConfirm,
    );
    if (confirmed) {
      await clear();
    }
  }, [clear]);

  const handlePay = useCallback(async () => {
    setCheckingOut(true);
    try {
      const result = await beginCheckout({
        paymentMethod: 'card',
        ...getCheckoutReturnUrls(),
      });
      if (!result.checkoutUrl) {
        if (isWeb && typeof window !== 'undefined') {
          window.alert(cartCopy.errors.checkout);
        } else {
          Alert.alert(cartCopy.errors.checkout);
        }
        return;
      }
      if (isWeb && typeof window !== 'undefined') {
        window.location.href = result.checkoutUrl;
      } else {
        await Linking.openURL(result.checkoutUrl);
      }
    } catch {
      if (isWeb && typeof window !== 'undefined') {
        window.alert(cartCopy.errors.checkout);
      } else {
        Alert.alert(cartCopy.errors.checkout);
      }
    } finally {
      setCheckingOut(false);
    }
  }, []);

  const openExtrasDrawer = useCallback(async (item: CartItem) => {
    setDrawerItem(item);
    setLoadingExtras(true);
    try {
      const event = await getEventById(item.eventId);
      setDrawerExtras(event.extras);
    } catch {
      setDrawerExtras([]);
    } finally {
      setLoadingExtras(false);
    }
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerItem(null);
    setDrawerExtras([]);
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.colors.accent} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>
          {cartCopy.errors[error as keyof typeof cartCopy.errors] ?? cartCopy.errors.load}
        </Text>
        <View style={styles.ctaWrap}>
          <Button label={cartCopy.errors.retry} onPress={() => void refresh()} />
        </View>
      </View>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>{cartCopy.empty}</Text>
        <Text style={styles.emptyText}>{cartCopy.emptySub}</Text>
        <View style={styles.ctaWrap}>
          <Button label={cartCopy.browseEvents} onPress={() => router.push('/events' as never)} />
        </View>
      </View>
    );
  }

  const currentDrawerItem = drawerItem
    ? (cart.items.find((i) => i.id === drawerItem.id) ?? drawerItem)
    : null;

  const blockedByCarRequirement = cart.items.some(itemNeedsCar);

  const openCarPlate = (item: CartItem) => {
    const firstTicket = item.tickets[0];
    router.push({
      pathname: '/cart/car-plate',
      params: {
        eventId: item.eventId,
        tierId: item.tierId,
        itemId: item.id,
        ...(firstTicket?.carId ? { initialCarId: firstTicket.carId } : {}),
        ...(firstTicket?.licensePlate ? { initialPlate: firstTicket.licensePlate } : {}),
      },
    } as never);
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={cart.items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => void openExtrasDrawer(item)}
            accessibilityRole="button"
            accessibilityHint={cartCopy.item.tapExtras}
          >
            <View style={styles.cardTop}>
              <View style={styles.cardInfo}>
                <Text style={styles.cardTitle}>
                  {cartCopy.item.quantity(item.quantity)} {cartCopy.item.ticket}
                </Text>
                <Text style={styles.cardSub}>{formatBRL(item.amountCents)}</Text>
              </View>
              <View style={styles.cardActions}>
                <Pressable
                  onPress={() => void handleRemove(item.id)}
                  disabled={removingId === item.id}
                  accessibilityRole="button"
                  accessibilityLabel={cartCopy.item.remove}
                  hitSlop={8}
                  style={styles.removeBtn}
                >
                  {removingId === item.id ? (
                    <ActivityIndicator size="small" color={theme.colors.muted} />
                  ) : (
                    <Trash2 color={theme.colors.muted} size={18} strokeWidth={1.75} />
                  )}
                </Pressable>
                <ChevronRight color={theme.colors.muted} size={16} strokeWidth={1.75} />
              </View>
            </View>
            {item.extras.length > 0 ? (
              <View style={styles.extrasRow}>
                <Text style={styles.cardExtras}>
                  {item.extras.length} {cartCopy.item.extras.toLowerCase()}
                </Text>
                <Text style={styles.extrasAmount}>
                  {formatBRL(item.extras.reduce((s, e) => s + e.subtotalCents, 0))}
                </Text>
              </View>
            ) : (
              <Text style={styles.tapHint}>{cartCopy.item.tapExtras}</Text>
            )}
            {item.requiresCar && item.kind === 'ticket' ? (
              <Pressable
                onPress={() => openCarPlate(item)}
                style={[styles.carRow, itemNeedsCar(item) && styles.carRowWarn]}
                accessibilityRole="button"
                accessibilityLabel={
                  itemNeedsCar(item) ? cartCopy.item.selectCar : cartCopy.item.changeCar
                }
              >
                <CarIcon
                  color={itemNeedsCar(item) ? theme.colors.accent : theme.colors.muted}
                  size={16}
                  strokeWidth={1.75}
                />
                <Text style={[styles.carRowText, itemNeedsCar(item) && styles.carRowTextWarn]}>
                  {itemNeedsCar(item)
                    ? cartCopy.item.selectCar
                    : cartCopy.item.plate(firstTicketPlate(item) ?? '')}
                </Text>
                <ChevronRight
                  color={itemNeedsCar(item) ? theme.colors.accent : theme.colors.muted}
                  size={14}
                  strokeWidth={1.75}
                />
              </Pressable>
            ) : null}
          </Pressable>
        )}
      />

      <View style={styles.footer}>
        <View style={styles.totalsRow}>
          <Text style={styles.totalsLabel}>{cartCopy.totals.tickets}</Text>
          <Text style={styles.totalsValue}>{formatBRL(cart.totals.ticketSubtotalCents)}</Text>
        </View>
        {cart.totals.extrasSubtotalCents > 0 && (
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>{cartCopy.totals.extras}</Text>
            <Text style={styles.totalsValue}>{formatBRL(cart.totals.extrasSubtotalCents)}</Text>
          </View>
        )}
        {cart.totals.discountCents > 0 && (
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>{cartCopy.totals.discount}</Text>
            <Text style={[styles.totalsValue, styles.discount]}>
              -{formatBRL(cart.totals.discountCents)}
            </Text>
          </View>
        )}
        <View style={[styles.totalsRow, styles.totalBorder]}>
          <Text style={styles.totalLabel}>{cartCopy.totals.total}</Text>
          <Text style={styles.totalValue}>{formatBRL(cart.totals.amountCents)}</Text>
        </View>

        <View style={styles.footerButtons}>
          {itemCount > 0 && (
            <>
              <Button
                label={checkingOut ? cartCopy.actions.paying : cartCopy.actions.pay}
                onPress={() => void handlePay()}
                disabled={checkingOut || blockedByCarRequirement}
              />
              {blockedByCarRequirement ? (
                <Text style={styles.payBlocked}>{cartCopy.item.carRequired}</Text>
              ) : null}
            </>
          )}
          {itemCount > 0 && (
            <Pressable
              onPress={() => void handleClear()}
              style={styles.clearBtn}
              disabled={checkingOut}
            >
              <Text style={styles.clearText}>{cartCopy.actions.clear}</Text>
            </Pressable>
          )}
        </View>
      </View>

      {currentDrawerItem && !loadingExtras && (
        <ExtrasDrawer
          visible
          item={currentDrawerItem}
          eventExtras={drawerExtras}
          onClose={closeDrawer}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  center: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
    gap: theme.spacing.sm,
  },
  list: { padding: theme.spacing.lg, gap: theme.spacing.md },
  emptyTitle: {
    color: theme.colors.fg,
    fontSize: theme.font.size.lg,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyText: {
    color: theme.colors.muted,
    fontSize: theme.font.size.md,
    textAlign: 'center',
  },
  ctaWrap: { marginTop: theme.spacing.md, width: '100%' },
  card: {
    backgroundColor: theme.colors.border,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.xs,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardInfo: { flex: 1, gap: theme.spacing.xs },
  cardTitle: { color: theme.colors.fg, fontSize: theme.font.size.md, fontWeight: '600' },
  cardSub: { color: theme.colors.muted, fontSize: theme.font.size.sm },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  cardExtras: { color: theme.colors.muted, fontSize: theme.font.size.sm },
  extrasRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  extrasAmount: { color: theme.colors.muted, fontSize: theme.font.size.sm },
  tapHint: { color: theme.colors.muted, fontSize: theme.font.size.sm, fontStyle: 'italic' },
  removeBtn: { padding: theme.spacing.xs },
  footer: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalsLabel: { color: theme.colors.muted, fontSize: theme.font.size.md },
  totalsValue: { color: theme.colors.fg, fontSize: theme.font.size.md },
  discount: { color: '#4CAF50' },
  totalBorder: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing.sm,
    marginTop: theme.spacing.xs,
  },
  totalLabel: { color: theme.colors.fg, fontSize: theme.font.size.lg, fontWeight: '700' },
  totalValue: { color: theme.colors.fg, fontSize: theme.font.size.lg, fontWeight: '700' },
  footerButtons: { marginTop: theme.spacing.sm, gap: theme.spacing.sm },
  clearBtn: { alignSelf: 'center', padding: theme.spacing.sm },
  clearText: { color: theme.colors.muted, fontSize: theme.font.size.sm },
  carRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  carRowWarn: {},
  carRowText: { color: theme.colors.muted, fontSize: theme.font.size.sm, flex: 1 },
  carRowTextWarn: { color: theme.colors.accent, fontWeight: '600' },
  payBlocked: {
    color: theme.colors.accent,
    fontSize: theme.font.size.sm,
    textAlign: 'center',
  },
});
