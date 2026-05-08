import { Controller, type Control } from 'react-hook-form';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { TextField } from '~/components/TextField';
import { profileCopy } from '~/copy/profile';
import type { ShippingAddressFormValues } from '~/shipping/form';
import { theme } from '~/theme';

type Props = {
  control: Control<ShippingAddressFormValues>;
};

export function ShippingAddressFormFields({ control }: Props) {
  return (
    <>
      <Controller
        control={control}
        name="recipientName"
        render={({ field, fieldState }) => (
          <TextField
            label={profileCopy.shipping.recipientNameLabel}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="phone"
        render={({ field, fieldState }) => (
          <TextField
            label={profileCopy.shipping.phoneLabel}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            error={fieldState.error?.message}
            keyboardType="phone-pad"
          />
        )}
      />
      <Controller
        control={control}
        name="postalCode"
        render={({ field, fieldState }) => (
          <TextField
            label={profileCopy.shipping.postalCodeLabel}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            error={fieldState.error?.message}
            keyboardType="number-pad"
          />
        )}
      />
      <Controller
        control={control}
        name="street"
        render={({ field, fieldState }) => (
          <TextField
            label={profileCopy.shipping.streetLabel}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="number"
        render={({ field, fieldState }) => (
          <TextField
            label={profileCopy.shipping.numberLabel}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="complement"
        render={({ field, fieldState }) => (
          <TextField
            label={profileCopy.shipping.complementLabel}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="neighborhood"
        render={({ field, fieldState }) => (
          <TextField
            label={profileCopy.shipping.neighborhoodLabel}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="city"
        render={({ field, fieldState }) => (
          <TextField
            label={profileCopy.shipping.cityLabel}
            value={field.value ?? ''}
            onChangeText={field.onChange}
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="stateCode"
        render={({ field, fieldState }) => (
          <TextField
            label={profileCopy.shipping.stateCodeLabel}
            value={field.value ?? ''}
            onChangeText={(value) => field.onChange(value.toUpperCase())}
            error={fieldState.error?.message}
            autoCapitalize="characters"
            maxLength={2}
          />
        )}
      />
      <Controller
        control={control}
        name="isDefault"
        render={({ field }) => (
          <View style={styles.defaultRow}>
            <Text style={styles.defaultLabel}>{profileCopy.shipping.defaultLabel}</Text>
            <Switch
              value={field.value ?? false}
              onValueChange={field.onChange}
              trackColor={{ false: '#2A2D36', true: theme.colors.accent }}
              thumbColor="#F5F5F5"
            />
          </View>
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({
  defaultRow: {
    marginTop: theme.spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  defaultLabel: {
    flex: 1,
    color: theme.colors.fg,
    fontSize: theme.font.size.md,
  },
});
