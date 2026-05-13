import type { ConfirmedCar } from '@jdm/shared/events';
import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AllCarsSheet } from './AllCarsSheet';
import { CarDetailSheet } from './CarDetailSheet';

import { eventsCopy } from '~/copy/events';
import { theme } from '~/theme';

const INLINE_MAX = 4;

type Props = {
  cars: ConfirmedCar[];
  loading: boolean;
  /** Section is hidden entirely when false (event has no car-required tiers). */
  visible: boolean;
};

export function ConfirmedCarsSection({ cars, loading, visible }: Props) {
  const [selectedCar, setSelectedCar] = useState<ConfirmedCar | null>(null);
  const [allSheetOpen, setAllSheetOpen] = useState(false);

  if (!visible) return null;

  const inlineSlice = cars.slice(0, INLINE_MAX);
  const hasOverflow = cars.length > INLINE_MAX;

  return (
    <View style={styles.section}>
      <Text style={styles.h2}>{eventsCopy.confirmedCars.sectionTitle}</Text>

      {loading ? (
        <View style={styles.loadingRow} accessibilityLabel={eventsCopy.confirmedCars.loading}>
          <ActivityIndicator color={theme.colors.muted} />
          <Text style={styles.muted}>{eventsCopy.confirmedCars.loading}</Text>
        </View>
      ) : cars.length === 0 ? (
        <Text style={styles.muted}>{eventsCopy.confirmedCars.empty}</Text>
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.row}
            accessibilityLabel={eventsCopy.confirmedCars.sectionTitle}
          >
            {inlineSlice.map((car) => (
              <Pressable
                key={car.ref}
                style={styles.avatarWrap}
                onPress={() => setSelectedCar(car)}
                accessibilityRole="button"
                accessibilityLabel={`${car.make} ${car.model} ${car.year}`}
                hitSlop={4}
              >
                {car.photoUrl ? (
                  <Image source={{ uri: car.photoUrl }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarPlaceholder]} />
                )}
                <Text style={styles.avatarLabel} numberOfLines={1}>
                  {car.make}
                </Text>
              </Pressable>
            ))}

            {hasOverflow ? (
              <Pressable
                style={styles.overflowBtn}
                onPress={() => setAllSheetOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={eventsCopy.confirmedCars.viewAll}
              >
                <Text style={styles.overflowCount}>+{cars.length - INLINE_MAX}</Text>
                <Text style={styles.overflowLabel}>{eventsCopy.confirmedCars.viewAll}</Text>
              </Pressable>
            ) : null}
          </ScrollView>

          {hasOverflow ? (
            <Pressable
              onPress={() => setAllSheetOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={eventsCopy.confirmedCars.viewAll}
              style={styles.viewAllBtn}
            >
              <Text style={styles.viewAllLabel}>{eventsCopy.confirmedCars.viewAll}</Text>
            </Pressable>
          ) : null}
        </>
      )}

      <CarDetailSheet car={selectedCar} onClose={() => setSelectedCar(null)} />

      <AllCarsSheet
        visible={allSheetOpen}
        cars={cars}
        onClose={() => setAllSheetOpen(false)}
        onSelectCar={(car) => {
          setAllSheetOpen(false);
          setSelectedCar(car);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    padding: theme.spacing.lg,
    gap: theme.spacing.xs,
  },
  h2: {
    color: theme.colors.fg,
    fontSize: theme.font.size.md,
    fontWeight: '600',
    marginBottom: theme.spacing.sm,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  muted: {
    color: theme.colors.muted,
    fontSize: theme.font.size.md,
  },
  row: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    paddingBottom: theme.spacing.xs,
  },
  avatarWrap: {
    alignItems: 'center',
    gap: theme.spacing.xs,
    width: 64,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  avatarPlaceholder: {
    backgroundColor: theme.colors.border,
  },
  avatarLabel: {
    color: theme.colors.fg,
    fontSize: theme.font.size.sm,
    textAlign: 'center',
  },
  overflowBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overflowCount: {
    color: theme.colors.fg,
    fontSize: theme.font.size.sm,
    fontWeight: '700',
  },
  overflowLabel: {
    color: theme.colors.muted,
    fontSize: 10,
  },
  viewAllBtn: {
    alignSelf: 'flex-start',
    marginTop: theme.spacing.xs,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.border,
  },
  viewAllLabel: {
    color: theme.colors.fg,
    fontSize: theme.font.size.sm,
  },
});
