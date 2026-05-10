import type { MyOrder } from '@jdm/shared/orders';
import { Button } from '@jdm/ui';
import { PaymentSheetError, useStripe } from '@stripe/stripe-react-native';
import Constants from 'expo-constants';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { listMyOrders, resumeOrder } from '~/api/orders';
import { ordersCopy } from '~/copy/orders';
import { formatBRL, formatEventDateRange } from '~/lib/format';
import { theme } from '~/theme';

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

function paymentBadgeStyle(status: MyOrder['status']) {
  if (status === 'paid') return styles.badgePaid;
  if (status === 'pending') return styles.badgePending;
  return styles.badgeMuted;
}

function fulfillmentBadgeStyle(status: NonNullable<MyOrder['fulfillmentStatus']>) {
  if (status === 'delivered' || status === 'picked_up') return styles.badgePaid;
  if (status === 'cancelled') return styles.badgeMuted;
  return styles.badgeFulfillment;
}

const STRIPE_AVAILABLE = !!(
  Constants.expoConfig?.extra as { stripePublishableKey?: string } | undefined
)?.stripePublishableKey;

// Resumes a Pix order. Stripe SDK not touched, so this button is safe
// in any build regardless of whether StripeProvider is mounted.
function ResumePixButton({ orderId }: { orderId: string }) {
  const router = useRouter();

  const handlePay = async () => {
    try {
      const data = await resumeOrder(orderId);
      if (data.method !== 'pix') {
        Alert.alert(ordersCopy.payError, ordersCopy.payErrorBody);
        return;
      }
      router.push({
        pathname: '/events/buy/checkout-pix',
        params: {
          orderId: data.orderId,
          brCode: data.brCode,
          expiresAt: data.expiresAt,
          amountCents: String(data.amountCents),
        },
      } as never);
    } catch {
      Alert.alert(ordersCopy.payError, ordersCopy.payErrorBody);
    }
  };

  return (
    <Pressable onPress={() => void handlePay()} accessibilityRole="button" style={styles.payLink}>
      <Text style={styles.payLinkText}>{ordersCopy.pay}</Text>
    </Pressable>
  );
}

// Resumes a Stripe (card) order. Only rendered when StripeProvider is in
// the tree (STRIPE_AVAILABLE === true). Isolates useStripe() so OrderCard
// doesn't crash in preview builds without Stripe.
function PayWithStripeButton({ orderId, reload }: { orderId: string; reload: () => unknown }) {
  const router = useRouter();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const handlePay = async () => {
    try {
      const data = await resumeOrder(orderId);
      if (data.method === 'pix') {
        // Provider says stripe but server returned pix: fall back to the Pix flow.
        router.push({
          pathname: '/events/buy/checkout-pix',
          params: {
            orderId: data.orderId,
            brCode: data.brCode,
            expiresAt: data.expiresAt,
            amountCents: String(data.amountCents),
          },
        } as never);
        return;
      }
      const { error: initError } = await initPaymentSheet({
        paymentIntentClientSecret: data.clientSecret,
        merchantDisplayName: 'JDM Experience',
      });
      if (initError) {
        Alert.alert(ordersCopy.payError, ordersCopy.payErrorBody);
        return;
      }
      const { error: presentError } = await presentPaymentSheet();
      if (presentError && presentError.code !== PaymentSheetError.Canceled) {
        Alert.alert(ordersCopy.payError, ordersCopy.payErrorBody);
        return;
      }
      reload();
    } catch {
      Alert.alert(ordersCopy.payError, ordersCopy.payErrorBody);
    }
  };

  return (
    <Pressable onPress={() => void handlePay()} accessibilityRole="button" style={styles.payLink}>
      <Text style={styles.payLinkText}>{ordersCopy.pay}</Text>
    </Pressable>
  );
}

function ResumeOrderButton({
  order,
  reload,
}: {
  order: MyOrder;
  reload: () => unknown;
}): React.ReactElement | null {
  // Pix orders never touch the Stripe SDK, so render them regardless of
  // whether STRIPE_AVAILABLE is true.
  if (order.provider === 'abacatepay') {
    return <ResumePixButton orderId={order.id} />;
  }
  // Stripe orders need StripeProvider. Hide the CTA when Stripe is not
  // configured (e.g. preview builds without a publishable key) — there is
  // no usable resume path for card orders in that environment.
  if (STRIPE_AVAILABLE) {
    return <PayWithStripeButton orderId={order.id} reload={reload} />;
  }
  return null;
}

function OrderCard({ order, reload }: { order: MyOrder; reload: () => unknown }) {
  const router = useRouter();
  const eventDate = order.event
    ? formatEventDateRange(order.event.startsAt, order.event.endsAt)
    : null;

  const isPendingAndActive =
    order.status === 'pending' &&
    (order.expiresAt === null || new Date(order.expiresAt) > new Date());

  const openTicket = (ticketIds: string[]) => {
    if (ticketIds.length === 1) {
      router.push({
        pathname: '/tickets/[ticketId]',
        params: { ticketId: ticketIds[0]! },
      } as never);
    } else {
      router.push('/tickets');
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.title}>
            {ordersCopy.summary.orderId} #{order.shortId}
          </Text>
          <Text style={styles.subtitle}>{ordersCopy.orderKind[order.kind]}</Text>
        </View>
        <View style={styles.badges}>
          <View style={[styles.badge, paymentBadgeStyle(order.status)]}>
            <Text style={styles.badgeText}>{ordersCopy.paymentStatus[order.status]}</Text>
          </View>
          {order.containsStoreItems && order.status === 'paid' && order.fulfillmentStatus ? (
            <View style={[styles.badge, fulfillmentBadgeStyle(order.fulfillmentStatus)]}>
              <Text style={styles.badgeText}>
                {ordersCopy.fulfillmentStatus[order.fulfillmentStatus]}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.metaBlock}>
        <Text style={styles.metaLabel}>
          {ordersCopy.summary.orderDate} {dateFormatter.format(new Date(order.createdAt))}
        </Text>
        {eventDate ? (
          <Text style={styles.metaLabel}>
            {ordersCopy.summary.eventDate} {eventDate}
          </Text>
        ) : null}
        {order.containsStoreItems && order.fulfillmentMethod ? (
          <Text style={styles.metaLabel}>
            {ordersCopy.fulfillmentMethod[order.fulfillmentMethod]}
            {order.shippingCents > 0
              ? ` ${ordersCopy.summary.separator} ${ordersCopy.summary.shipping} ${formatBRL(order.shippingCents)}`
              : ''}
          </Text>
        ) : null}
      </View>

      <View style={styles.items}>
        {order.items.map((item) => {
          const ticketIds =
            item.kind === 'ticket' && order.status === 'paid' && item.ticketIds
              ? item.ticketIds
              : null;
          return (
            <View key={item.id} style={styles.itemRow}>
              <View style={styles.itemText}>
                <Text style={styles.itemTitle}>
                  {item.quantity}x {item.title}
                </Text>
                {item.detail ? <Text style={styles.itemDetail}>{item.detail}</Text> : null}
                {ticketIds && ticketIds.length > 0 ? (
                  <Pressable
                    onPress={() => openTicket(ticketIds)}
                    accessibilityRole="button"
                    style={styles.ticketLink}
                  >
                    <Text style={styles.ticketLinkText}>
                      {ticketIds.length === 1 ? ordersCopy.viewTicket : ordersCopy.viewTickets}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              <Text style={styles.itemPrice}>{formatBRL(item.subtotalCents)}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.footerRow}>
        <View>
          <Text style={styles.footerText}>{ordersCopy.summary.total}</Text>
          <Text style={styles.total}>{formatBRL(order.amountCents)}</Text>
        </View>
        {isPendingAndActive ? <ResumeOrderButton order={order} reload={reload} /> : null}
      </View>
    </View>
  );
}

export default function ProfileOrdersScreen() {
  const [orders, setOrders] = useState<MyOrder[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(false);
      const res = await listMyOrders();
      setOrders(res.items);
    } catch {
      setError(true);
    }
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

  const content = useMemo(() => {
    if (orders === null) {
      return (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.accent} />
        </View>
      );
    }

    if (error && orders.length === 0) {
      return (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>{ordersCopy.loadFailed}</Text>
          <View style={styles.retryWrap}>
            <Button label={ordersCopy.retry} onPress={() => void load()} />
          </View>
        </View>
      );
    }

    if (orders.length === 0) {
      return (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>{ordersCopy.empty}</Text>
          <Text style={styles.emptyText}>{ordersCopy.emptySub}</Text>
        </View>
      );
    }

    return (
      <View style={styles.list}>
        {orders.map((order) => (
          <OrderCard key={order.id} order={order} reload={load} />
        ))}
      </View>
    );
  }, [error, load, orders]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={orders && orders.length > 0 ? styles.content : styles.contentCentered}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />}
    >
      {content}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.bg,
  },
  content: {
    padding: theme.spacing.md,
  },
  contentCentered: {
    flexGrow: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xl,
    backgroundColor: theme.colors.bg,
  },
  retryWrap: {
    marginTop: theme.spacing.md,
  },
  emptyTitle: {
    color: theme.colors.fg,
    fontSize: theme.font.size.lg,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyText: {
    marginTop: theme.spacing.sm,
    color: theme.colors.muted,
    textAlign: 'center',
  },
  list: {
    gap: theme.spacing.md,
  },
  card: {
    padding: theme.spacing.lg,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: '#111217',
    gap: theme.spacing.md,
  },
  headerRow: {
    gap: theme.spacing.sm,
  },
  headerText: {
    gap: 2,
  },
  title: {
    color: theme.colors.fg,
    fontSize: theme.font.size.lg,
    fontWeight: '700',
  },
  subtitle: {
    color: theme.colors.muted,
    fontSize: theme.font.size.md,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
  },
  badge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgePaid: {
    backgroundColor: 'rgba(34, 197, 94, 0.14)',
    borderColor: 'rgba(34, 197, 94, 0.32)',
  },
  badgePending: {
    backgroundColor: 'rgba(225, 106, 0, 0.14)',
    borderColor: 'rgba(225, 106, 0, 0.36)',
  },
  badgeFulfillment: {
    backgroundColor: 'rgba(245, 245, 247, 0.08)',
    borderColor: theme.colors.border,
  },
  badgeMuted: {
    backgroundColor: 'rgba(138, 138, 147, 0.12)',
    borderColor: 'rgba(138, 138, 147, 0.2)',
  },
  badgeText: {
    color: theme.colors.fg,
    fontSize: theme.font.size.sm,
    fontWeight: '600',
  },
  metaBlock: {
    gap: 4,
  },
  metaLabel: {
    color: theme.colors.muted,
    fontSize: theme.font.size.sm,
  },
  items: {
    gap: theme.spacing.sm,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  itemText: {
    flex: 1,
    gap: 2,
  },
  itemTitle: {
    color: theme.colors.fg,
    fontSize: theme.font.size.md,
    fontWeight: '500',
  },
  itemDetail: {
    color: theme.colors.muted,
    fontSize: theme.font.size.sm,
  },
  ticketLink: {
    marginTop: theme.spacing.xs,
    alignSelf: 'flex-start',
  },
  ticketLinkText: {
    color: theme.colors.accent,
    fontSize: theme.font.size.sm,
    fontWeight: '600',
  },
  itemPrice: {
    color: theme.colors.fg,
    fontSize: theme.font.size.md,
    fontWeight: '600',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  footerText: {
    color: theme.colors.muted,
    fontSize: theme.font.size.sm,
  },
  total: {
    color: theme.colors.fg,
    fontSize: theme.font.size.lg,
    fontWeight: '700',
  },
  payLink: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.accent,
  },
  payLinkText: {
    color: '#fff',
    fontSize: theme.font.size.sm,
    fontWeight: '700',
  },
});
