import { zodResolver } from '@hookform/resolvers/zod';
import { carInputSchema, type CarInput } from '@jdm/shared/cars';
import { useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { createCar } from '~/api/cars';
import { Button } from '~/components/Button';
import { TextField } from '~/components/TextField';
import { profileCopy } from '~/copy/profile';
import { theme } from '~/theme';

export default function NewCar() {
  const router = useRouter();
  const form = useForm<CarInput>({
    resolver: zodResolver(carInputSchema),
    defaultValues: {
      make: '',
      model: '',
      year: new Date().getFullYear(),
      nickname: undefined,
    },
  });

  const onSave = form.handleSubmit(async (values) => {
    const car = await createCar(values);
    router.replace(`/garage/${car.id}` as never);
  });

  return (
    <View style={styles.container}>
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
});
