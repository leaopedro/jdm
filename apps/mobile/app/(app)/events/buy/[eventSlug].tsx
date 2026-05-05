import type { EventDetail, TicketTier } from '@jdm/shared/events';
import { PaymentSheetError, useStripe } from '@stripe/stripe-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { getEvent } from '~/api/events';
import { Button } from '~/components/Button';
import { buyCopy } from '~/copy/buy';
import { ticketsCopy } from '~/copy/tickets';
import { formatBRL } from '~/lib/format';
import {
  PerTicketWizard,
  QuantityStepper,
  WizardProvider,
  createCarPlateStep,
} from '~/screens/buy/per-ticket-wizard';
import type { WizardStepDefinition } from '~/screens/buy/per-ticket-wizard';
import { theme } from '~/theme';

type Phase = 'loading' | 'select' | 'wizard';

export default function BuyScreen() {
  const { eventSlug, tierId: initialTierId } = useLocalSearchParams<{
    eventSlug: string;
    tierId?: string;
  }>();
  const router = useRouter();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedTier, setSelectedTier] = useState<TicketTier | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [method, setMethod] = useState<'card' | 'pix'>('card');
  const [phase, setPhase] = useState<Phase>('loading');

  useEffect(() => {
    if (!eventSlug || typeof eventSlug !== 'string') return;
    void (async () => {
      try {
        const ev = await getEvent(eventSlug);
        setEvent(ev);
        if (initialTierId) {
          const match = ev.tiers.find((t) => t.id === initialTierId);
          if (match && match.remainingCapacity > 0) {
            setSelectedTier(match);
          }
        }
        setPhase('select');
      } catch {
        setError('Evento não encontrado.');
      }
    })();
  }, [eventSlug]);

  // TODO(JDMA-142): replace hardcoded cap with event.maxTicketsPerUser once schema lands
  // TODO(JDMA-147): raise cap above 1 once createOrder supports tickets[] batch shape
  const maxPerTier = selectedTier ? Math.min(selectedTier.remainingCapacity, 1) : 1;

  const handleStart = () => {
    if (!selectedTier) return;
    // TODO(JDMA-147): remove guard once batch tickets[] API lands
    if (quantity > 1) {
      Alert.alert(buyCopy.review.errorTitle, 'Compra de múltiplos ingressos ainda não disponível.');
      return;
    }
    setPhase('wizard');
  };

  const handlePayment = useCallback(
    async (clientSecret: string) => {
      const init = await initPaymentSheet({
        merchantDisplayName: 'JDM Experience',
        paymentIntentClientSecret: clientSecret,
        applePay: { merchantCountryCode: 'BR' },
        googlePay: { merchantCountryCode: 'BR', testEnv: true },
        defaultBillingDetails: {},
      });
      if (init.error) {
        Alert.alert(ticketsCopy.purchase.error, init.error.message);
        return;
      }

      const sheet = await presentPaymentSheet();
      if (sheet.error) {
        if (sheet.error.code === PaymentSheetError.Canceled) {
          Alert.alert(ticketsCopy.purchase.cancelled);
        } else {
          Alert.alert(ticketsCopy.purchase.error, sheet.error.message);
        }
        return;
      }

      Alert.alert(ticketsCopy.purchase.success, undefined, [
        {
          text: ticketsCopy.purchase.successCta,
          onPress: () => {
            router.dismissAll();
            router.navigate('/tickets' as never);
          },
        },
      ]);
    },
    [initPaymentSheet, presentPaymentSheet, router],
  );

  const handleOrderCreated = useCallback(
    (order: { clientSecret: string }) => handlePayment(order.clientSecret),
    [handlePayment],
  );

  const handleExitWizard = useCallback(() => {
    setPhase('select');
  }, []);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!event || phase === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  const pluggableSteps: WizardStepDefinition[] = [createCarPlateStep()];

  if (phase === 'wizard' && selectedTier) {
    return (
      // key resets wizard state when tier/quantity changes — intentional fresh start
      <WizardProvider
        key={`${selectedTier.id}-${quantity}-${method}`}
        eventId={event.id}
        tier={selectedTier}
        quantity={quantity}
        steps={pluggableSteps}
        onOrderCreated={handleOrderCreated}
        onExitWizard={handleExitWizard}
        method={method}
      >
        <PerTicketWizard />
      </WizardProvider>
    );
  }

  // --- Tier + quantity selection phase ---
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          hitSlop={8}
        >
          <ArrowLeft color={theme.colors.fg} size={20} />
        </Pressable>
        <Text style={styles.title}>{event.title}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.sectionTitle}>{ticketsCopy.purchase.pickTier}</Text>

        {event.tiers.map((tier) => {
          const soldOut = tier.remainingCapacity === 0;
          const isSelected = selectedTier?.id === tier.id;
          return (
            <Pressable
              key={tier.id}
              onPress={() => {
                if (!soldOut) {
                  setSelectedTier(tier);
                  setQuantity(1);
                }
              }}
              disabled={soldOut}
              style={[
                styles.tier,
                isSelected && styles.tierSelected,
                soldOut && styles.tierDisabled,
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected, disabled: soldOut }}
            >
              <View style={styles.tierTop}>
                <Text style={styles.tierName}>{tier.name}</Text>
                <Text style={styles.tierPrice}>{formatBRL(tier.priceCents)}</Text>
              </View>
              <Text style={styles.sub}>
                {soldOut
                  ? ticketsCopy.purchase.soldOut
                  : buyCopy.stepper.available(tier.remainingCapacity)}
              </Text>
            </Pressable>
          );
        })}

        {selectedTier && (
          <View style={styles.stepperSection}>
            <Text style={styles.sectionTitle}>{buyCopy.stepper.title}</Text>
            <QuantityStepper value={quantity} max={maxPerTier} onChange={setQuantity} />
            <Text style={styles.sub}>{buyCopy.stepper.max(maxPerTier)}</Text>
          </View>
        )}

        {selectedTier && (
          <View style={styles.methodRow}>
            <Pressable
              style={[styles.methodBtn, method === 'card' && styles.methodBtnActive]}
              onPress={() => setMethod('card')}
            >
              <Text style={[styles.methodText, method === 'card' && styles.methodTextActive]}>
                Cartão
              </Text>
            </Pressable>
            <Pressable
              style={[styles.methodBtn, method === 'pix' && styles.methodBtnActive]}
              onPress={() => setMethod('pix')}
            >
              <Text style={[styles.methodText, method === 'pix' && styles.methodTextActive]}>
                Pix
              </Text>
            </Pressable>
          </View>
        )}

        {selectedTier && (
          <View style={styles.summary}>
            <Text style={styles.summaryText}>
              {quantity}x {selectedTier.name} = {formatBRL(selectedTier.priceCents * quantity)}
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Button label={buyCopy.wizard.start} onPress={handleStart} disabled={!selectedTier} />
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
  },
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
  scroll: { padding: 16, gap: 12, paddingBottom: 100 },
  sectionTitle: {
    color: theme.colors.fg,
    fontSize: theme.font.size.md,
    fontWeight: '600',
    marginBottom: 8,
  },
  tier: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 4,
    marginBottom: 8,
  },
  tierSelected: { borderColor: theme.colors.accent, borderWidth: 2 },
  tierDisabled: { opacity: 0.5 },
  tierTop: { flexDirection: 'row', justifyContent: 'space-between' },
  tierName: { color: theme.colors.fg, fontWeight: '600' },
  tierPrice: { color: theme.colors.fg },
  sub: { color: theme.colors.muted, fontSize: 13 },
  stepperSection: { marginTop: 16, gap: 12 },
  summary: {
    marginTop: 16,
    padding: 14,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.border,
  },
  summaryText: {
    color: theme.colors.fg,
    fontSize: theme.font.size.md,
    fontWeight: '600',
    textAlign: 'center',
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  error: { color: theme.colors.muted },
  extrasBanner: {
    padding: 14,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.accent + '18',
    borderWidth: 1,
    borderColor: theme.colors.accent,
    marginBottom: 8,
  },
  extrasBannerTitle: {
    color: theme.colors.accent,
    fontWeight: '600',
    fontSize: theme.font.size.md,
  },
  extrasBannerSub: {
    color: theme.colors.muted,
    fontSize: 13,
    marginTop: 2,
  },
  methodRow: {
    flexDirection: 'row',
    gap: 8,
  },
  methodBtn: {
    flex: 1,
    paddingVertical: 10,
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
