import { zodResolver } from '@hookform/resolvers/zod';
import { resetPasswordSchema } from '@jdm/shared/auth';
import type { ResetPasswordInput } from '@jdm/shared/auth';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, Text, View } from 'react-native';

import { resetPasswordRequest } from '~/api/auth';
import { Button } from '~/components/Button';
import { TextField } from '~/components/TextField';
import { authCopy } from '~/copy/auth';
import { theme } from '~/theme';

export default function ResetPasswordScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const router = useRouter();
  const [done, setDone] = useState(false);
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token: token ?? '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await resetPasswordRequest(values);
      setDone(true);
      setTimeout(() => router.replace('/login'), 1_500);
    } catch {
      setError('password', { message: authCopy.errors.unknown });
    }
  });

  if (!token) {
    return (
      <View style={styles.container}>
        <Text style={styles.body}>Link inválido.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Nova senha</Text>
      {done ? (
        <Text style={styles.body}>Senha atualizada.</Text>
      ) : (
        <>
          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, value } }) => (
              <TextField
                label={authCopy.signup.password}
                secureTextEntry
                value={value}
                onChangeText={onChange}
                error={errors.password?.message}
              />
            )}
          />
          <Button
            label={isSubmitting ? authCopy.common.loading : authCopy.common.submit}
            onPress={() => void onSubmit()}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    padding: theme.spacing.xl,
    gap: theme.spacing.md,
    justifyContent: 'center',
  },
  title: { color: theme.colors.fg, fontSize: theme.font.size.xxl, fontWeight: '700' },
  body: { color: theme.colors.fg, fontSize: theme.font.size.md },
});
