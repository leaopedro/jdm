import { ArrowLeft } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { SelectedExtra } from './ExtrasStep';
import { useWizard } from './context';

import { createOrder } from '~/api/orders';
import { Button } from '~/components/Button';
import { buyCopy } from '~/copy/buy';
import { formatBRL } from '~/lib/format';
import { theme } from '~/theme';

export function ReviewScreen() {
  const { state, dispatch, onOrderCreated, onExitWizard } = useWizard();
  const { tier, quantity, tickets, eventId } = state;
  const canGoBack = state.steps.length > 0;
  const [submitting, setSubmitting] = useState(false);

  const unitPrice = tier.priceCents;
  const extrasCents = tickets.reduce((sum, t) => {
    const extras = (t.extras as SelectedExtra[] | undefined) ?? [];
    return sum + extras.reduce((s, e) => s + e.priceCents, 0);
  }, 0);
  const totalCents = unitPrice * quantity + extrasCents;

  const handleSubmit = async () => {
    if (quantity > 1) {
      Alert.alert(buyCopy.review.errorTitle, 'Compra de múltiplos ingressos ainda não disponível.');
      return;
    }
    setSubmitting(true);
    try {
      const order = await createOrder({
        eventId,
        tierId: tier.id,
        quantity,
        method: 'card',
        tickets: tickets.map((t) => ({
          extras: ((t.extras as SelectedExtra[] | undefined) ?? []).map((e) => e.id),
        })),
      });
      await onOrderCreated(order);
    } catch {
      Alert.alert(buyCopy.review.errorTitle, buyCopy.review.errorBody);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          onPress={canGoBack ? () => dispatch({ type: 'BACK' }) : onExitWizard}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          hitSlop={8}
          style={styles.backButton}
        >
          <ArrowLeft color={theme.colors.fg} size={20} />
        </Pressable>
        <Text style={styles.title}>{buyCopy.review.title}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {tickets.map((ticketData, idx) => {
          const extras = (ticketData.extras as SelectedExtra[] | undefined) ?? [];
          return (
            <View key={idx} style={styles.ticketCard}>
              <Text style={styles.ticketTitle}>
                {buyCopy.wizard.ticketLabel(idx + 1, quantity)}
              </Text>
              <View style={styles.lineItem}>
                <Text style={styles.lineLabel}>{tier.name}</Text>
                <Text style={styles.lineValue}>{formatBRL(unitPrice)}</Text>
              </View>
              {extras.map((extra) => (
                <View key={extra.id} style={styles.lineItem}>
                  <Text style={styles.lineLabel}>{extra.name}</Text>
                  <Text style={styles.lineValue}>{formatBRL(extra.priceCents)}</Text>
                </View>
              ))}
            </View>
          );
        })}

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{buyCopy.review.total}</Text>
          <Text style={styles.totalValue}>{formatBRL(totalCents)}</Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label={submitting ? buyCopy.review.submitting : buyCopy.review.confirm}
          onPress={() => void handleSubmit()}
          disabled={submitting}
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
  backButton: { padding: 4 },
  title: {
    color: theme.colors.fg,
    fontSize: theme.font.size.md,
    fontWeight: '600',
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 12 },
  ticketCard: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    padding: 14,
    gap: 8,
  },
  ticketTitle: {
    color: theme.colors.fg,
    fontWeight: '600',
    fontSize: theme.font.size.sm,
    marginBottom: 4,
  },
  lineItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  lineLabel: { color: theme.colors.muted, fontSize: theme.font.size.sm },
  lineValue: { color: theme.colors.fg, fontSize: theme.font.size.sm },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    marginTop: 4,
  },
  totalLabel: {
    color: theme.colors.fg,
    fontSize: theme.font.size.md,
    fontWeight: '700',
  },
  totalValue: {
    color: theme.colors.fg,
    fontSize: theme.font.size.md,
    fontWeight: '700',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
});
