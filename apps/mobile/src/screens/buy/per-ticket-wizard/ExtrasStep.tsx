import type { EventExtraPublic } from '@jdm/shared/extras';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import type { WizardStepDefinition, WizardStepProps } from './types';

import { buyCopy } from '~/copy/buy';
import { formatBRL } from '~/lib/format';
import { theme } from '~/theme';

export interface SelectedExtra {
  id: string;
  name: string;
  priceCents: number;
}

interface ExtrasStepInternalProps extends WizardStepProps {
  extras: EventExtraPublic[];
}

function ExtrasStepScreen({ extras, data, onNext, onBack }: ExtrasStepInternalProps) {
  const initial = (data.extras as SelectedExtra[] | undefined) ?? [];
  const [selected, setSelected] = useState<Map<string, SelectedExtra>>(
    () => new Map(initial.map((e) => [e.id, e])),
  );

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

  const handleNext = () => {
    onNext({ extras: Array.from(selected.values()) });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{buyCopy.extras.title}</Text>
        <Text style={styles.subtitle}>{buyCopy.extras.subtitle}</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {extras.map((extra) => {
          const soldOut = extra.quantityRemaining === 0;
          const isSelected = selected.has(extra.id);

          return (
            <Pressable
              key={extra.id}
              style={[styles.extraCard, soldOut && styles.disabled]}
              onPress={() => !soldOut && toggle(extra)}
              disabled={soldOut}
              accessibilityRole="switch"
              accessibilityState={{ checked: isSelected, disabled: soldOut }}
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
                  {soldOut ? (
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
                disabled={soldOut}
                trackColor={{ false: theme.colors.border, true: theme.colors.accent }}
                thumbColor={theme.colors.fg}
              />
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable onPress={onBack} style={styles.secondaryButton} accessibilityRole="button">
          <Text style={styles.secondaryLabel}>{buyCopy.wizard.back}</Text>
        </Pressable>
        <Pressable onPress={handleNext} style={styles.primaryButton} accessibilityRole="button">
          <Text style={styles.primaryLabel}>
            {selected.size > 0 ? buyCopy.extras.confirm : buyCopy.extras.skip}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export function createExtrasStep(extras: EventExtraPublic[]): WizardStepDefinition {
  return {
    id: 'extras',
    label: buyCopy.extras.title,
    component: (props: WizardStepProps) => <ExtrasStepScreen {...props} extras={extras} />,
    appliesTo: () => extras.length > 0,
  };
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  header: { paddingHorizontal: 16, paddingTop: 16, gap: 4 },
  title: { color: theme.colors.fg, fontSize: theme.font.size.lg, fontWeight: '700' },
  subtitle: { color: theme.colors.muted, fontSize: theme.font.size.sm },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 10 },
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
  remaining: { color: theme.colors.muted, fontSize: theme.font.size.sm },
  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
  },
  secondaryLabel: { color: theme.colors.fg, fontWeight: '600' },
  primaryButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.accent,
    alignItems: 'center',
  },
  primaryLabel: { color: theme.colors.fg, fontWeight: '700' },
});
