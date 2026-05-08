import type { CartItem } from '@jdm/shared/cart';
import type { EventExtraPublic } from '@jdm/shared/extras';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Car as CarIcon, ChevronRight, Trash2 } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
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
import { getEventCommerceById } from '~/api/events';
import { useCart } from '~/cart/context';
import { Button } from '~/components/Button';
import { cartCopy } from '~/copy/cart';
import { useShippingAddresses } from '~/hooks/useShippingAddresses';
import { formatBRL } from '~/lib/format';
import { ExtrasDrawer } from '~/screens/cart/ExtrasDrawer';
import { formatShippingAddress } from '~/shipping/format-address';
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

function isProductItem(
  item: CartItem,
): item is CartItem & { kind: 'product'; product: NonNullable<CartItem['product']> } {
  return item.kind === 'product' && item.product !== null;
}

function showError(message: string) {
  if (isWeb && typeof window !== 'undefined') {
    window.alert(message);
  } else {
    Alert.alert(message);
  }
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
  const params = useLocalSearchParams<{ shippingAddressId?: string }>();
  const requestedShippingAddressId =
    typeof params.shippingAddressId === 'string' ? params.shippingAddressId : null;
  const requiresShipping =
    cart?.items.some((item) => isProductItem(item) && item.product.requiresShipping) ?? false;
  const {
    items: shippingAddresses,
    loading: loadingShippingAddresses,
    error: shippingAddressesError,
    refresh: refreshShippingAddresses,
  } = useShippingAddresses(requiresShipping);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [drawerItem, setDrawerItem] = useState<CartItem | null>(null);
  const [drawerExtras, setDrawerExtras] = useState<EventExtraPublic[]>([]);
  const [loadingExtras, setLoadingExtras] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'pix'>('card');
  const [selectedShippingAddressId, setSelectedShippingAddressId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      if (requiresShipping) {
        void refreshShippingAddresses();
      }
    }, [refresh, refreshShippingAddresses, requiresShipping]),
  );

  useEffect(() => {
    if (!requiresShipping) {
      setSelectedShippingAddressId(null);
      return;
    }

    if (shippingAddresses.length === 0) {
      setSelectedShippingAddressId(null);
      return;
    }

    setSelectedShippingAddressId((current) => {
      if (
        requestedShippingAddressId &&
        shippingAddresses.some((address) => address.id === requestedShippingAddressId)
      ) {
        return requestedShippingAddressId;
      }
      if (current && shippingAddresses.some((address) => address.id === current)) {
        return current;
      }
      return shippingAddresses.find((address) => address.isDefault)?.id ?? shippingAddresses[0]!.id;
    });
  }, [requiresShipping, requestedShippingAddressId, shippingAddresses]);

  useEffect(() => {
    if (!requestedShippingAddressId) return;
    if (selectedShippingAddressId !== requestedShippingAddressId) return;
    router.replace('/cart' as never);
  }, [requestedShippingAddressId, router, selectedShippingAddressId]);

  const handleRemove = useCallback(
    async (itemId: string) => {
      setRemovingId(itemId);
      const ok = await removeItem(itemId);
      setRemovingId(null);
      if (!ok) {
        showError(cartCopy.errors.remove);
      }
    },
    [removeItem],
  );

  const handleClear = useCallback(async () => {
    const confirmed = await confirmDestructive(
      cartCopy.actions.clear,
      cartCopy.actions.clearConfirm,
    );
    if (confirmed) {
      const ok = await clear();
      if (!ok) {
        showError(cartCopy.errors.clear);
      }
    }
  }, [clear]);

  const handlePay = useCallback(async () => {
    setCheckingOut(true);
    try {
      const result = await beginCheckout({
        paymentMethod,
        ...(selectedShippingAddressId ? { shippingAddressId: selectedShippingAddressId } : {}),
        ...getCheckoutReturnUrls(),
      });

      if (paymentMethod === 'pix') {
        const firstOrderId = result.orderIds[0];
        if (!result.brCode || !result.reservationExpiresAt || !firstOrderId) {
          showError(cartCopy.errors.checkout);
          return;
        }
        router.push({
          pathname: '/(app)/events/buy/checkout-pix',
          params: {
            orderId: firstOrderId,
            brCode: result.brCode,
            expiresAt: result.reservationExpiresAt,
            amountCents: String(result.cart.totals.amountCents),
            currency: result.cart.totals.currency,
          },
        } as never);
        return;
      }

      if (!result.checkoutUrl) {
        showError(cartCopy.errors.checkout);
        return;
      }
      if (isWeb && typeof window !== 'undefined') {
        window.location.href = result.checkoutUrl;
      } else {
        await Linking.openURL(result.checkoutUrl);
      }
    } catch {
      showError(cartCopy.errors.checkout);
    } finally {
      setCheckingOut(false);
    }
  }, [paymentMethod, router, selectedShippingAddressId]);

  const openExtrasDrawer = useCallback(async (item: CartItem) => {
    setDrawerItem(item);
    setLoadingExtras(true);
    try {
      if (!item.eventId) {
        setDrawerExtras([]);
        return;
      }
      const event = await getEventCommerceById(item.eventId);
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
          {(() => {
            const v = cartCopy.errors[error as keyof typeof cartCopy.errors];
            return typeof v === 'string' ? v : cartCopy.errors.load;
          })()}
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
  const blockedByShippingAddress = requiresShipping && !selectedShippingAddressId;
  const openShippingAddresses = () => {
    router.push({
      pathname: '/profile/shipping',
      params: { returnTo: '/cart' },
    } as never);
  };

  const openCarPlate = (item: CartItem) => {
    if (!item.eventId || !item.tierId) return;
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

  const openItem = (item: CartItem) => {
    if (isProductItem(item)) {
      router.push(`/store/${item.product.productSlug}` as never);
      return;
    }
    void openExtrasDrawer(item);
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
            onPress={() => openItem(item)}
            accessibilityRole="button"
            accessibilityHint={
              isProductItem(item) ? cartCopy.item.viewProduct : cartCopy.item.tapExtras
            }
          >
            <View style={styles.cardTop}>
              <View style={styles.cardInfo}>
                <Text style={styles.cardTitle}>
                  {isProductItem(item)
                    ? `${cartCopy.item.quantity(item.quantity)} ${item.product.productTitle}`
                    : `${cartCopy.item.quantity(item.quantity)} ${cartCopy.item.ticket}`}
                </Text>
                <Text style={styles.cardSub}>
                  {isProductItem(item)
                    ? `${item.product.variantName} · ${formatBRL(item.product.unitPriceCents)}`
                    : formatBRL(item.amountCents)}
                </Text>
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
            {isProductItem(item) ? (
              <View style={styles.productMetaRow}>
                <Text style={styles.cardExtras}>
                  {item.product.requiresShipping ? cartCopy.item.shipping : cartCopy.item.pickup}
                </Text>
              </View>
            ) : item.extras.length > 0 ? (
              <View style={styles.extrasRow}>
                <Text style={styles.cardExtras}>
                  {item.extras.length} {cartCopy.item.extras.toLowerCase()}
                </Text>
                <Text style={styles.extrasAmount}>
                  {formatBRL(item.extras.reduce((s, e) => s + e.subtotalCents, 0))}
                </Text>
              </View>
            ) : (
              <Text style={styles.tapHint}>
                {isProductItem(item) ? cartCopy.item.viewProduct : cartCopy.item.tapExtras}
              </Text>
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
        {cart.totals.productsSubtotalCents > 0 && (
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>{cartCopy.totals.products}</Text>
            <Text style={styles.totalsValue}>{formatBRL(cart.totals.productsSubtotalCents)}</Text>
          </View>
        )}
        {cart.totals.shippingSubtotalCents > 0 && (
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>{cartCopy.totals.shipping}</Text>
            <Text style={styles.totalsValue}>{formatBRL(cart.totals.shippingSubtotalCents)}</Text>
          </View>
        )}
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

        {requiresShipping ? (
          <View style={styles.shippingSection}>
            <Text style={styles.shippingTitle}>{cartCopy.shipping.title}</Text>
            <Text style={styles.shippingHint}>{cartCopy.shipping.choose}</Text>
            {loadingShippingAddresses ? (
              <Text style={styles.shippingHint}>{cartCopy.shipping.loading}</Text>
            ) : shippingAddressesError ? (
              <Pressable
                onPress={() => {
                  void refreshShippingAddresses();
                }}
                style={styles.shippingRetry}
              >
                <Text style={styles.shippingRetryText}>{cartCopy.shipping.retry}</Text>
              </Pressable>
            ) : shippingAddresses.length === 0 ? (
              <View style={styles.shippingActions}>
                <Text style={styles.shippingBlocked}>{cartCopy.shipping.empty}</Text>
                <Button label={cartCopy.shipping.add} onPress={openShippingAddresses} />
              </View>
            ) : (
              <View style={styles.shippingActions}>
                <View style={styles.shippingAddressList}>
                  {shippingAddresses.map((address) => {
                    const selected = selectedShippingAddressId === address.id;

                    return (
                      <Pressable
                        key={address.id}
                        onPress={() => setSelectedShippingAddressId(address.id)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        style={[
                          styles.shippingAddressCard,
                          selected && styles.shippingAddressCardSelected,
                        ]}
                      >
                        <View style={styles.shippingAddressHeader}>
                          <Text style={styles.shippingAddressName}>{address.recipientName}</Text>
                          {address.isDefault ? (
                            <Text style={styles.shippingAddressBadge}>
                              {cartCopy.shipping.defaultBadge}
                            </Text>
                          ) : null}
                        </View>
                        <Text style={styles.shippingAddressBody}>
                          {formatShippingAddress(address)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Button
                  label={cartCopy.shipping.manage}
                  variant="secondary"
                  onPress={openShippingAddresses}
                />
              </View>
            )}
          </View>
        ) : null}

        {itemCount > 0 && (
          <View style={styles.methodRow}>
            <Pressable
              style={[styles.methodBtn, paymentMethod === 'card' && styles.methodBtnActive]}
              onPress={() => setPaymentMethod('card')}
              accessibilityRole="radio"
              accessibilityState={{ selected: paymentMethod === 'card' }}
            >
              <Text
                style={[styles.methodText, paymentMethod === 'card' && styles.methodTextActive]}
              >
                {cartCopy.payment.card}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.methodBtn, paymentMethod === 'pix' && styles.methodBtnActive]}
              onPress={() => setPaymentMethod('pix')}
              accessibilityRole="radio"
              accessibilityState={{ selected: paymentMethod === 'pix' }}
            >
              <Text style={[styles.methodText, paymentMethod === 'pix' && styles.methodTextActive]}>
                {cartCopy.payment.pix}
              </Text>
            </Pressable>
          </View>
        )}

        <View style={styles.footerButtons}>
          {itemCount > 0 && (
            <>
              <Button
                label={checkingOut ? cartCopy.actions.paying : cartCopy.actions.pay}
                onPress={() => void handlePay()}
                disabled={checkingOut || blockedByCarRequirement || blockedByShippingAddress}
              />
              {blockedByCarRequirement ? (
                <Text style={styles.payBlocked}>{cartCopy.item.carRequired}</Text>
              ) : blockedByShippingAddress ? (
                <Text style={styles.payBlocked}>{cartCopy.shipping.blocked}</Text>
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
  productMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
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
  shippingSection: {
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  shippingTitle: {
    color: theme.colors.fg,
    fontSize: theme.font.size.md,
    fontWeight: '600',
  },
  shippingHint: {
    color: theme.colors.muted,
    fontSize: theme.font.size.sm,
  },
  shippingBlocked: {
    color: theme.colors.accent,
    fontSize: theme.font.size.sm,
  },
  shippingRetry: {
    alignSelf: 'flex-start',
    paddingVertical: theme.spacing.xs,
  },
  shippingRetryText: {
    color: theme.colors.accent,
    fontSize: theme.font.size.sm,
    fontWeight: '600',
  },
  shippingAddressList: {
    gap: theme.spacing.sm,
  },
  shippingActions: {
    gap: theme.spacing.sm,
  },
  shippingAddressCard: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  shippingAddressCardSelected: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accent + '12',
  },
  shippingAddressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  shippingAddressName: {
    color: theme.colors.fg,
    fontSize: theme.font.size.sm,
    fontWeight: '600',
  },
  shippingAddressBadge: {
    color: theme.colors.accent,
    fontSize: theme.font.size.sm,
    fontWeight: '600',
  },
  shippingAddressBody: {
    color: theme.colors.muted,
    fontSize: theme.font.size.sm,
  },
  carRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.md,
  },
  carRowWarn: {
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accent + '15',
  },
  carRowText: { color: theme.colors.muted, fontSize: theme.font.size.sm, flex: 1 },
  carRowTextWarn: { color: theme.colors.accent, fontWeight: '600' },
  payBlocked: {
    color: theme.colors.accent,
    fontSize: theme.font.size.sm,
    textAlign: 'center',
  },
  methodRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  methodBtn: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
  },
  methodBtnActive: {
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accent + '15',
  },
  methodText: {
    fontSize: theme.font.size.sm,
    color: theme.colors.muted,
  },
  methodTextActive: {
    color: theme.colors.accent,
    fontWeight: '600',
  },
});
