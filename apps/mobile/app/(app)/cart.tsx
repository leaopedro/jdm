import { useRouter } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useCart } from '~/cart/context';
import { Button } from '~/components/Button';
import { cartCopy } from '~/copy/cart';
import { formatBRL } from '~/lib/format';
import { theme } from '~/theme';

export default function CartScreen() {
  const { cart, loading, error, itemCount, removeItem, clear, refresh } = useCart();
  const router = useRouter();
  const [removingId, setRemovingId] = useState<string | null>(null);

  const handleRemove = useCallback(
    async (itemId: string) => {
      setRemovingId(itemId);
      await removeItem(itemId);
      setRemovingId(null);
    },
    [removeItem],
  );

  const handleClear = useCallback(() => {
    Alert.alert(cartCopy.actions.clear, cartCopy.actions.clearConfirm, [
      { text: cartCopy.actions.clearNo, style: 'cancel' },
      {
        text: cartCopy.actions.clearYes,
        style: 'destructive',
        onPress: () => void clear(),
      },
    ]);
  }, [clear]);

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

  return (
    <View style={styles.container}>
      <FlatList
        data={cart.items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardTop}>
              <View style={styles.cardInfo}>
                <Text style={styles.cardTitle}>
                  {cartCopy.item.quantity(item.quantity)} {cartCopy.item.ticket}
                </Text>
                <Text style={styles.cardSub}>{formatBRL(item.amountCents)}</Text>
              </View>
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
            </View>
            {item.extras.length > 0 && (
              <Text style={styles.cardExtras}>
                {cartCopy.item.extras}: {item.extras.length}
              </Text>
            )}
          </View>
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
            <Pressable onPress={handleClear} style={styles.clearBtn}>
              <Text style={styles.clearText}>{cartCopy.actions.clear}</Text>
            </Pressable>
          )}
        </View>
      </View>
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
  cardExtras: { color: theme.colors.muted, fontSize: theme.font.size.sm },
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
});
