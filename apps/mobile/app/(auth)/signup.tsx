import { zodResolver } from '@hookform/resolvers/zod';
import { signupSchema } from '@jdm/shared/auth';
import type { SignupInput } from '@jdm/shared/auth';
import { Link, useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, Text, View } from 'react-native';

import { ApiError } from '~/api/client';
import { useAuth } from '~/auth/context';
import { Button } from '~/components/Button';
import { TextField } from '~/components/TextField';
import { authCopy } from '~/copy/auth';
import { theme } from '~/theme';

export default function SignupScreen() {
  const { signup } = useAuth();
  const router = useRouter();
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: '', password: '', name: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await signup(values);
      router.replace('/verify-email-pending');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError('email', { message: authCopy.errors.emailExists });
      } else if (err instanceof ApiError && err.status === 400) {
        setError('password', { message: authCopy.errors.weakPassword });
      } else if (err instanceof ApiError && err.status === 429) {
        setError('password', { message: authCopy.errors.rateLimited });
      } else {
        setError('password', { message: authCopy.errors.unknown });
      }
    }
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{authCopy.signup.title}</Text>
      <Controller
        control={control}
        name="name"
        render={({ field: { onChange, value } }) => (
          <TextField
            label={authCopy.signup.name}
            value={value}
            onChangeText={onChange}
            error={errors.name?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="email"
        render={({ field: { onChange, value } }) => (
          <TextField
            label={authCopy.signup.email}
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
            label={authCopy.signup.password}
            secureTextEntry
            value={value}
            onChangeText={onChange}
            error={errors.password?.message}
          />
        )}
      />
      <Button
        label={isSubmitting ? authCopy.common.loading : authCopy.signup.submit}
        onPress={() => void onSubmit()}
      />
      <Text style={styles.agree}>{authCopy.signup.agree}</Text>
      <Link style={styles.link} href="/login">
        {authCopy.signup.haveAccount}
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
  agree: { color: theme.colors.muted, fontSize: theme.font.size.sm },
  link: { color: theme.colors.fg, fontSize: theme.font.size.md, textDecorationLine: 'underline' },
});
