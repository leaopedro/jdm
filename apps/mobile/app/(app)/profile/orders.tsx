import type { MyOrder } from '@jdm/shared/orders';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { listMyOrders } from '~/api/orders';
import { Button } from '~/components/Button';
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

function OrderCard({ order }: { order: MyOrder }) {
  const eventDate = order.event
    ? formatEventDateRange(order.event.startsAt, order.event.endsAt)
    : null;

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
              ? ` • ${ordersCopy.summary.shipping} ${formatBRL(order.shippingCents)}`
              : ''}
          </Text>
        ) : null}
      </View>

      <View style={styles.items}>
        {order.items.map((item) => (
          <View key={item.id} style={styles.itemRow}>
            <View style={styles.itemText}>
              <Text style={styles.itemTitle}>
                {item.quantity}x {item.title}
              </Text>
              {item.detail ? <Text style={styles.itemDetail}>{item.detail}</Text> : null}
            </View>
            <Text style={styles.itemPrice}>{formatBRL(item.subtotalCents)}</Text>
          </View>
        ))}
      </View>

      <View style={styles.footerRow}>
        <Text style={styles.footerText}>{ordersCopy.summary.total}</Text>
        <Text style={styles.total}>{formatBRL(order.amountCents)}</Text>
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
          <OrderCard key={order.id} order={order} />
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
  itemPrice: {
    color: theme.colors.fg,
    fontSize: theme.font.size.md,
    fontWeight: '600',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
});
