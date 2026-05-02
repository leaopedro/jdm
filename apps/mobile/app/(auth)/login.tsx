import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema } from '@jdm/shared/auth';
import type { LoginInput } from '@jdm/shared/auth';
import { Button, Text } from '@jdm/ui';
import { useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  View,
} from 'react-native';

import { ApiError } from '~/api/client';
import { useAuth } from '~/auth/context';
import { TextField } from '~/components/TextField';
import { authCopy } from '~/copy/auth';

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
    <SafeAreaView className="flex-1 bg-bg">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-5 pb-10"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={{ height: 64 }} />

          <View className="items-center">
            <Image
              // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
              source={require('@jdm/design/assets/logo-wordmark.webp')}
              accessibilityLabel={authCopy.common.appName}
              style={{ width: 220, height: 88, resizeMode: 'contain' }}
            />
          </View>

          <View style={{ height: 12 }} />

          <Text variant="eyebrow" tone="muted" className="text-center">
            {authCopy.login.tagline}
          </Text>

          <View style={{ height: 40 }} />

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

          <View style={{ height: 16 }} />

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

          <View style={{ height: 8 }} />

          <View className="flex-row justify-end">
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={authCopy.login.forgot}
              onPress={() => router.push('/forgot')}
              hitSlop={8}
            >
              <Text tone="muted" variant="bodySm">
                {authCopy.login.forgot}
              </Text>
            </Pressable>
          </View>

          <View style={{ height: 24 }} />

          <Button
            label={authCopy.login.submit}
            variant="primary"
            size="lg"
            fullWidth
            loading={isSubmitting}
            onPress={() => void onSubmit()}
          />

          <View style={{ height: 32 }} />

          <View className="flex-row items-center justify-center">
            <Text tone="muted">{authCopy.login.noAccountPrefix}</Text>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={authCopy.login.createAccount}
              onPress={() => router.push('/signup')}
              hitSlop={8}
            >
              <Text tone="brand" weight="semibold">
                {authCopy.login.createAccount}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
