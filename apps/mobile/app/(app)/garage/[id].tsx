import { zodResolver } from '@hookform/resolvers/zod';
import { type Car, carUpdateSchema, type CarUpdateInput } from '@jdm/shared/cars';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { addCarPhoto, deleteCar, getCar, removeCarPhoto, updateCar } from '~/api/cars';
import { Button } from '~/components/Button';
import { TextField } from '~/components/TextField';
import { profileCopy } from '~/copy/profile';
import { pickAndUpload } from '~/lib/upload-image';
import { theme } from '~/theme';

export default function CarDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [car, setCar] = useState<Car | null>(null);
  const [uploading, setUploading] = useState(false);

  const form = useForm<CarUpdateInput>({
    resolver: zodResolver(carUpdateSchema),
    defaultValues: {},
  });

  useEffect(() => {
    void (async () => {
      const found = await getCar(id);
      setCar(found);
      form.reset({
        make: found.make,
        model: found.model,
        year: found.year,
        nickname: found.nickname ?? undefined,
      });
    })();
  }, [form, id]);

  const onSave = form.handleSubmit(async (values) => {
    if (!car) return;
    const updated = await updateCar(car.id, values);
    setCar(updated);
  });

  const onAddPhoto = async () => {
    if (!car) return;
    setUploading(true);
    try {
      const up = await pickAndUpload('car_photo');
      if (!up) return;
      const updated = await addCarPhoto(car.id, {
        objectKey: up.presign.objectKey,
        width: up.picked.width,
        height: up.picked.height,
      });
      setCar(updated);
    } finally {
      setUploading(false);
    }
  };

  const onRemovePhoto = async (photoId: string) => {
    if (!car) return;
    await removeCarPhoto(car.id, photoId);
    setCar({ ...car, photos: car.photos.filter((p) => p.id !== photoId) });
  };

  const onDelete = () => {
    if (!car) return;
    Alert.alert(profileCopy.garage.deleteConfirm, '', [
      { text: profileCopy.garage.save, style: 'cancel' },
      {
        text: profileCopy.garage.delete,
        style: 'destructive',
        onPress: () => {
          void deleteCar(car.id).then(() => {
            router.replace('/garage' as never);
          });
        },
      },
    ]);
  };

  if (!car) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <FlatList
        horizontal
        data={car.photos}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.photoRow}
        renderItem={({ item }) => (
          <Pressable onLongPress={() => void onRemovePhoto(item.id)}>
            <Image source={{ uri: item.url }} style={styles.photo} />
          </Pressable>
        )}
        ListFooterComponent={
          <Pressable style={[styles.photo, styles.photoAdd]} onPress={() => void onAddPhoto()}>
            <Text style={styles.photoAddLabel}>
              {uploading ? profileCopy.garage.photoUploading : profileCopy.garage.addPhoto}
            </Text>
          </Pressable>
        }
      />

      <Controller
        control={form.control}
        name="make"
        render={({ field, fieldState }) => (
          <TextField
            label={profileCopy.garage.makeLabel}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        control={form.control}
        name="model"
        render={({ field, fieldState }) => (
          <TextField
            label={profileCopy.garage.modelLabel}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        control={form.control}
        name="year"
        render={({ field, fieldState }) => (
          <TextField
            label={profileCopy.garage.yearLabel}
            keyboardType="number-pad"
            value={String(field.value ?? '')}
            onChangeText={(v) => field.onChange(Number(v) || 0)}
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        control={form.control}
        name="nickname"
        render={({ field, fieldState }) => (
          <TextField
            label={profileCopy.garage.nicknameLabel}
            value={field.value ?? ''}
            onChangeText={(v) => field.onChange(v.length > 0 ? v : undefined)}
            error={fieldState.error?.message}
          />
        )}
      />

      <Button label={profileCopy.garage.save} onPress={() => void onSave()} />
      <Button label={profileCopy.garage.delete} onPress={onDelete} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
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
  photoRow: { gap: theme.spacing.sm, paddingVertical: theme.spacing.sm },
  photo: { width: 120, height: 120, borderRadius: theme.radii.sm },
  photoAdd: {
    backgroundColor: theme.colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoAddLabel: {
    color: theme.colors.fg,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
});
