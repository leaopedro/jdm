import type { EventSummary } from '@jdm/shared/events';
import { Badge, Button, Card, Text } from '@jdm/ui';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Image, Pressable, SafeAreaView, ScrollView, View } from 'react-native';

import { listEvents } from '~/api/events';
import { useAuth } from '~/auth/context';
import { formatEventDateRange } from '~/lib/format';

const copy = {
  heroEyebrow: 'PRÓXIMO ROLÊ',
  heroCta: 'Ver evento',
  secondaryEyebrow: 'TAMBÉM NA CENA',
  quickActionsEyebrow: 'ATALHOS',
  quickEventos: 'Eventos',
  quickIngressos: 'Ingressos',
  quickGaragem: 'Garagem',
  brandAffirmation: 'BEM-VINDO À CENA.',
  emptyTitle: 'Nenhum encontro agendado.',
  emptySub: 'Volte logo. A cena não para.',
  errorLine: 'Não rolou carregar. Tenta de novo.',
  errorRetry: 'Tentar novamente',
  ticketBadge: 'INGRESSO GARANTIDO',
  premiumBadge: 'PREMIUM',
} as const;

const eventTypeLabel: Record<EventSummary['type'], string> = {
  meeting: 'ENCONTRO',
  drift: 'DRIFT',
  other: 'EVENTO',
};

const venueLine = (e: EventSummary): string =>
  [e.venueName, [e.city, e.stateCode].filter(Boolean).join('/')].filter(Boolean).join(' · ');

export default function Welcome() {
  const router = useRouter();
  const { user } = useAuth();
  const [items, setItems] = useState<EventSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await listEvents({ window: 'upcoming', limit: 4 });
      setItems(res.items);
    } catch {
      setItems([]);
      setError(copy.errorLine);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const firstName = (user?.name ?? '').trim().split(/\s+/)[0] ?? '';
  const hero = items && items.length > 0 ? items[0] : null;
  const secondary = items && items.length > 1 ? items.slice(1, 4) : [];

  // Premium / active-ticket presence is not on PublicUser today and the
  // brief forbids new API calls here. Both flags stay false until the
  // auth context exposes them.
  const hasActiveTicket = false;
  const isPremium = false;

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pt-4 pb-10 gap-8"
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-center justify-between">
          <Image
            // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
            source={require('@jdm/design/assets/logo-wordmark.webp')}
            accessibilityLabel="JDM Experience"
            style={{ width: 132, height: 36, resizeMode: 'contain' }}
          />
          <View className="flex-row items-center gap-2">
            {isPremium ? <Badge tone="brand" label={copy.premiumBadge} size="sm" /> : null}
            {firstName ? (
              <Text variant="eyebrow" tone="muted">{`OLÁ, ${firstName.toUpperCase()}`}</Text>
            ) : null}
          </View>
        </View>

        <View className="gap-3" accessibilityLiveRegion="polite">
          <Text variant="eyebrow" tone="muted" accessibilityRole="header">
            {copy.heroEyebrow}
          </Text>

          {items === null ? (
            <HeroSkeleton />
          ) : error ? (
            <HeroError onRetry={() => void load()} />
          ) : !hero ? (
            <HeroEmpty />
          ) : (
            <HeroCard
              event={hero}
              hasActiveTicket={hasActiveTicket}
              onPress={() => router.push(`/events/${hero.slug}`)}
            />
          )}
        </View>

        {secondary.length > 0 ? (
          <View className="gap-3">
            <Text variant="eyebrow" tone="muted" accessibilityRole="header">
              {copy.secondaryEyebrow}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-3 pr-5"
            >
              {secondary.map((e) => (
                <SecondaryCard
                  key={e.id}
                  event={e}
                  onPress={() => router.push(`/events/${e.slug}`)}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View className="gap-3">
          <Text variant="eyebrow" tone="muted" accessibilityRole="header">
            {copy.quickActionsEyebrow}
          </Text>
          <View className="flex-row gap-3">
            <QuickChip label={copy.quickEventos} onPress={() => router.push('/events')} />
            <QuickChip label={copy.quickIngressos} onPress={() => router.push('/tickets')} />
            <QuickChip label={copy.quickGaragem} onPress={() => router.push('/garage')} />
          </View>
        </View>

        <View className="pt-2 pb-4">
          <Text variant="display" tone="primary" className="text-center">
            {copy.brandAffirmation}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

interface HeroCardProps {
  event: EventSummary;
  hasActiveTicket: boolean;
  onPress: () => void;
}

function HeroCard({ event, hasActiveTicket, onPress }: HeroCardProps) {
  return (
    <Card variant="raised" padding="none">
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${event.title}, ${formatEventDateRange(event.startsAt, event.endsAt)}`}
        accessibilityHint="Abre os detalhes do evento"
      >
        <View className="relative">
          {event.coverUrl ? (
            <Image
              source={{ uri: event.coverUrl }}
              accessible={false}
              style={{ width: '100%', aspectRatio: 16 / 9 }}
            />
          ) : (
            <View className="bg-surface-alt" style={{ width: '100%', aspectRatio: 16 / 9 }} />
          )}
          {hasActiveTicket ? (
            <View className="absolute top-3 right-3">
              <Badge tone="success" label={copy.ticketBadge} size="sm" />
            </View>
          ) : null}
        </View>
        <View className="p-5 gap-3">
          <Text variant="eyebrow" tone="brand">
            {eventTypeLabel[event.type]}
          </Text>
          <Text variant="h1" numberOfLines={2}>
            {event.title}
          </Text>
          <View className="gap-1">
            <Text variant="bodySm" tone="secondary">
              {formatEventDateRange(event.startsAt, event.endsAt)}
            </Text>
            {venueLine(event) ? (
              <Text variant="bodySm" tone="muted">
                {venueLine(event)}
              </Text>
            ) : null}
          </View>
        </View>
      </Pressable>
      <View className="px-5 pb-5">
        <Button label={copy.heroCta} variant="primary" size="lg" fullWidth onPress={onPress} />
      </View>
    </Card>
  );
}

interface SecondaryCardProps {
  event: EventSummary;
  onPress: () => void;
}

function SecondaryCard({ event, onPress }: SecondaryCardProps) {
  const meta = [event.city, event.stateCode].filter(Boolean).join('/');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${event.title}, ${formatEventDateRange(event.startsAt, event.endsAt)}`}
      accessibilityHint="Abre os detalhes do evento"
      style={{ width: 256 }}
    >
      <Card variant="raised" padding="none">
        {event.coverUrl ? (
          <Image
            source={{ uri: event.coverUrl }}
            accessible={false}
            style={{ width: '100%', aspectRatio: 16 / 9 }}
          />
        ) : (
          <View className="bg-surface-alt" style={{ width: '100%', aspectRatio: 16 / 9 }} />
        )}
        <View className="p-3 gap-1">
          <Text variant="caption" tone="muted">
            {formatEventDateRange(event.startsAt, event.endsAt)}
          </Text>
          <Text variant="h3" numberOfLines={2}>
            {event.title}
          </Text>
          {meta ? (
            <Text variant="caption" tone="muted">
              {meta}
            </Text>
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

interface QuickChipProps {
  label: string;
  onPress: () => void;
}

function QuickChip({ label, onPress }: QuickChipProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-1 h-12 items-center justify-center rounded-xl bg-surface border border-border active:opacity-80"
    >
      <Text variant="bodySm" weight="semibold">
        {label}
      </Text>
    </Pressable>
  );
}

function HeroSkeleton() {
  return (
    <Card variant="raised" padding="none">
      <View className="bg-surface-alt" style={{ width: '100%', aspectRatio: 16 / 9 }} />
      <View className="p-5 gap-3">
        <View className="h-3 w-20 rounded-md bg-surface-alt" />
        <View className="h-6 w-3/4 rounded-md bg-surface-alt" />
        <View className="h-3 w-1/2 rounded-md bg-surface-alt" />
        <View className="h-12 mt-2 rounded-lg bg-surface-alt" />
      </View>
    </Card>
  );
}

interface HeroErrorProps {
  onRetry: () => void;
}

function HeroError({ onRetry }: HeroErrorProps) {
  return (
    <Card variant="raised" padding="lg">
      <View className="gap-4 items-start">
        <Text variant="body" tone="secondary">
          {copy.errorLine}
        </Text>
        <Button label={copy.errorRetry} variant="secondary" onPress={onRetry} />
      </View>
    </Card>
  );
}

function HeroEmpty() {
  return (
    <Card variant="raised" padding="lg">
      <View className="gap-1">
        <Text variant="h3">{copy.emptyTitle}</Text>
        <Text variant="bodySm" tone="muted">
          {copy.emptySub}
        </Text>
      </View>
    </Card>
  );
}
