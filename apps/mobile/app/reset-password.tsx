import { zodResolver } from '@hookform/resolvers/zod';
import { resetPasswordSchema } from '@jdm/shared/auth';
import type { ResetPasswordInput } from '@jdm/shared/auth';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, Text, View } from 'react-native';

import { resetPasswordRequest } from '~/api/auth';
import { ApiError } from '~/api/client';
import { Button } from '~/components/Button';
import { TextField } from '~/components/TextField';
import { authCopy } from '~/copy/auth';
import { theme } from '~/theme';

export default function ResetPasswordScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const router = useRouter();
  const [done, setDone] = useState(false);
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token: token ?? '', password: '' },
  });

  useEffect(
    () => () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    },
    [],
  );

  const onSubmit = handleSubmit(async (values) => {
    try {
      await resetPasswordRequest(values);
      setDone(true);
      redirectTimer.current = setTimeout(() => {
        redirectTimer.current = null;
        router.replace('/login');
      }, 1_500);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError('password', { message: authCopy.errors.rateLimited });
      } else {
        setError('password', { message: authCopy.errors.unknown });
      }
    }
  });

  if (!token) {
    return (
      <View style={styles.container}>
        <Text style={styles.body}>{authCopy.errors.invalidLink}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{authCopy.reset.title}</Text>
      {done ? (
        <Text style={styles.body} accessibilityLiveRegion="polite">
          {authCopy.reset.done}
        </Text>
      ) : (
        <>
          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, value } }) => (
              <TextField
                label={authCopy.reset.password}
                secureTextEntry
                value={value}
                onChangeText={onChange}
                error={errors.password?.message}
              />
            )}
          />
          <Button
            label={isSubmitting ? authCopy.common.loading : authCopy.reset.submit}
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
