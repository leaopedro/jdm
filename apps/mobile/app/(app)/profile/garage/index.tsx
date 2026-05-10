import type { Car } from '@jdm/shared/cars';
import { Button } from '@jdm/ui';
import { Link, Stack, useFocusEffect, useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { listCars } from '~/api/cars';
import { profileCopy } from '~/copy/profile';
import { theme } from '~/theme';

export default function GarageIndex() {
  const router = useRouter();
  const [cars, setCars] = useState<Car[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      void (async () => setCars(await listCars()))();
    }, []),
  );

  if (!cars) {
    return (
      <View style={styles.center}>
        <Stack.Screen
          options={{
            title: profileCopy.garage.title,
            headerLeft: () => (
              <Pressable onPress={() => router.back()} hitSlop={8}>
                <ChevronLeft color="#F5F5F5" size={24} />
              </Pressable>
            ),
          }}
        />
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: profileCopy.garage.title,
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <ChevronLeft color="#F5F5F5" size={24} />
            </Pressable>
          ),
        }}
      />
      <Button
        label={profileCopy.garage.add}
        onPress={() => router.push('/profile/garage/new' as never)}
      />
      {cars.length === 0 ? (
        <Text style={styles.empty}>{profileCopy.garage.empty}</Text>
      ) : (
        <FlatList
          data={cars}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Link href={`/profile/garage/${item.id}` as never} asChild>
              <Pressable
                style={styles.card}
                accessibilityRole="link"
                accessibilityLabel={`${item.year} ${item.make} ${item.model}${item.nickname ? `, ${item.nickname}` : ''}`}
                accessibilityHint="Opens car details"
              >
                {item.photos[0] ? (
                  <Image
                    source={{ uri: item.photos[0].url }}
                    style={styles.thumb}
                    accessible={false}
                  />
                ) : (
                  <View style={[styles.thumb, styles.thumbPlaceholder]} />
                )}
                <View style={styles.cardText}>
                  <Text style={styles.title}>
                    {item.year} {item.make} {item.model}
                  </Text>
                  {item.nickname ? <Text style={styles.sub}>{item.nickname}</Text> : null}
                </View>
              </Pressable>
            </Link>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
    backgroundColor: theme.colors.bg,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.bg,
  },
  empty: { color: theme.colors.muted },
  list: { gap: theme.spacing.md },
  card: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.border,
    borderRadius: theme.radii.md,
  },
  cardText: { flex: 1 },
  thumb: { width: 64, height: 64, borderRadius: theme.radii.sm },
  thumbPlaceholder: { backgroundColor: theme.colors.muted },
  title: { color: theme.colors.fg, fontSize: theme.font.size.md, fontWeight: '600' },
  sub: { color: theme.colors.muted },
});
