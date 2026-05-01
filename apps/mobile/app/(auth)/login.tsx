import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema } from '@jdm/shared/auth';
import type { LoginInput } from '@jdm/shared/auth';
import { Link, useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, Text, View } from 'react-native';

import { ApiError } from '~/api/client';
import { useAuth } from '~/auth/context';
import { Button } from '~/components/Button';
import { TextField } from '~/components/TextField';
import { authCopy } from '~/copy/auth';
import { theme } from '~/theme';

export default function LoginScreen() {
  const { login } = useAuth();
  const router = useRouter();
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await login(values);
      router.replace('/welcome');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401)
          setError('password', { message: authCopy.errors.invalidCredentials });
        else if (err.status === 403)
          router.replace({
            pathname: '/verify-email-pending',
            params: { email: values.email },
          });
        else if (err.status === 429) setError('password', { message: authCopy.errors.rateLimited });
        else setError('password', { message: authCopy.errors.unknown });
      } else {
        setError('password', { message: authCopy.errors.network });
      }
    }
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{authCopy.login.title}</Text>
      <Controller
        control={control}
        name="email"
        render={({ field: { onChange, value } }) => (
          <TextField
            label={authCopy.login.email}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={value}
            onChangeText={onChange}
            error={errors.email?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field: { onChange, value } }) => (
          <TextField
            label={authCopy.login.password}
            secureTextEntry
            autoComplete="password"
            value={value}
            onChangeText={onChange}
            error={errors.password?.message}
          />
        )}
      />
      <Button
        label={isSubmitting ? authCopy.common.loading : authCopy.login.submit}
        onPress={() => void onSubmit()}
      />
      <Link
        style={styles.link}
        href="/forgot"
        accessibilityRole="link"
        accessibilityLabel={authCopy.login.forgot}
      >
        {authCopy.login.forgot}
      </Link>
      <Link
        style={styles.link}
        href="/signup"
        accessibilityRole="link"
        accessibilityLabel={authCopy.login.noAccount}
      >
        {authCopy.login.noAccount}
      </Link>
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
  link: { color: theme.colors.fg, fontSize: theme.font.size.md, textDecorationLine: 'underline' },
});
