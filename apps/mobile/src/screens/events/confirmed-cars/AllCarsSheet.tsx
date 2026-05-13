import type { ConfirmedCar } from '@jdm/shared/events';
import { FlatList, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { eventsCopy } from '~/copy/events';
import { theme } from '~/theme';

type Props = {
  visible: boolean;
  cars: ConfirmedCar[];
  onClose: () => void;
  onSelectCar: (car: ConfirmedCar) => void;
};

export function AllCarsSheet({ visible, cars, onClose, onSelectCar }: Props) {
  return (
    <Modal
      visible={visible}
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
        <Text style={styles.title}>{eventsCopy.confirmedCars.sheetTitle}</Text>
        <FlatList
          data={cars}
          keyExtractor={(c) => c.ref}
          numColumns={3}
          contentContainerStyle={styles.grid}
          renderItem={({ item }) => (
            <Pressable
              style={styles.cell}
              onPress={() => onSelectCar(item)}
              accessibilityRole="button"
              accessibilityLabel={`${item.make} ${item.model} ${item.year}`}
            >
              {item.photoUrl ? (
                <Image source={{ uri: item.photoUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]} />
              )}
              <Text style={styles.cellName} numberOfLines={1}>
                {item.make}
              </Text>
              <Text style={styles.cellSub} numberOfLines={1}>
                {item.model}
              </Text>
            </Pressable>
          )}
        />
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
    maxHeight: '75%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    alignSelf: 'center',
    marginVertical: theme.spacing.sm,
  },
  title: {
    color: theme.colors.fg,
    fontSize: theme.font.size.md,
    fontWeight: '600',
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  grid: {
    paddingHorizontal: theme.spacing.sm,
    paddingBottom: theme.spacing.lg,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    padding: theme.spacing.xs,
    gap: theme.spacing.xs,
  },
  avatar: {
    width: 72,
    height: 56,
    borderRadius: theme.radii.sm,
  },
  avatarPlaceholder: {
    backgroundColor: theme.colors.border,
  },
  cellName: {
    color: theme.colors.fg,
    fontSize: theme.font.size.sm,
    fontWeight: '600',
  },
  cellSub: {
    color: theme.colors.muted,
    fontSize: theme.font.size.sm,
  },
});
