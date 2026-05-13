import type { ConfirmedCar } from '@jdm/shared/events';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { theme } from '~/theme';

type Props = {
  car: ConfirmedCar | null;
  onClose: () => void;
};

export function CarDetailSheet({ car, onClose }: Props) {
  return (
    <Modal
      visible={car !== null}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Fechar"
      />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        {car ? (
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {car.photoUrl ? (
              <Image
                source={{ uri: car.photoUrl }}
                style={styles.photo}
                accessibilityLabel={`${car.make} ${car.model}`}
              />
            ) : (
              <View style={[styles.photo, styles.photoPlaceholder]} />
            )}
            <Text style={styles.name}>
              {car.year} {car.make} {car.model}
            </Text>
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: theme.colors.bg,
    borderTopLeftRadius: theme.radii.lg,
    borderTopRightRadius: theme.radii.lg,
    paddingBottom: 40,
    maxHeight: '60%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    alignSelf: 'center',
    marginVertical: theme.spacing.sm,
  },
  content: {
    alignItems: 'center',
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  photo: {
    width: 200,
    height: 140,
    borderRadius: theme.radii.md,
  },
  photoPlaceholder: {
    backgroundColor: theme.colors.border,
  },
  name: {
    color: theme.colors.fg,
    fontSize: theme.font.size.lg,
    fontWeight: '700',
    textAlign: 'center',
  },
});
